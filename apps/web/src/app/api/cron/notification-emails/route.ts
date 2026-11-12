import { createHash, timingSafeEqual } from "node:crypto";
import { renderDigest, digestSubject, type DigestEntry } from "@/lib/email/notification-digest";
import { getServerEnv } from "@/lib/env";
import { notificationHref } from "@/lib/notification-links";
import { createAdminClient } from "@/lib/supabase/admin";

/** Types worth an email. Chat and campus chatter stay in-app only. */
const EMAIL_TYPES = [
  "request_received",
  "request_approved",
  "request_declined",
  "loan_due_soon",
  "loan_overdue",
  "extension_requested",
  "extension_approved",
  "extension_declined",
  "handover_reminder",
  "fine_created",
  "verification_approved",
  "verification_rejected",
];
/** Give the app a chance first: only email what stayed unread this long. */
const GRACE_MINUTES = 2;
/** Older than this is stale news; mark it handled without sending. */
const MAX_AGE_HOURS = 24;
const MAX_ROWS = 300;
const MAX_STUDENTS = 50;
const MAX_ENTRIES = 6;

type QueueRow = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  created_at: string;
  profile: { email: string; full_name: string; email_notifications: boolean; verification_status: string } | null;
};

function authorized(request: Request, secret: string | undefined) {
  if (!secret || secret.length < 24) return false;
  const header = request.headers.get("authorization") ?? "";
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * POST /api/cron/notification-emails: called every 5 minutes by pg_cron (via
 * pg_net) with `Authorization: Bearer $CRON_SECRET`. Sends each student one
 * digest of important unread notifications through Resend and stamps
 * notifications.emailed_at so nothing is sent twice.
 */
export async function POST(request: Request) {
  const env = getServerEnv();
  if (!authorized(request, env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!env.RESEND_API_KEY || !env.NOTIFICATIONS_FROM_EMAIL) {
    return Response.json({ error: "Email is not configured (RESEND_API_KEY, NOTIFICATIONS_FROM_EMAIL)." }, { status: 503 });
  }

  const db = createAdminClient();
  const now = Date.now();
  const { data, error } = await db
    .from("notifications")
    .select("id, user_id, title, body, payload, created_at, profile:profiles!notifications_user_id_fkey (email, full_name, email_notifications, verification_status)")
    .is("emailed_at", null)
    .is("read_at", null)
    .in("type", EMAIL_TYPES)
    .lt("created_at", new Date(now - GRACE_MINUTES * 60_000).toISOString())
    .gt("created_at", new Date(now - MAX_AGE_HOURS * 3_600_000).toISOString())
    .order("created_at", { ascending: true })
    .limit(MAX_ROWS);
  if (error) return Response.json({ error: "Queue read failed." }, { status: 500 });

  const byStudent = new Map<string, QueueRow[]>();
  for (const row of (data ?? []) as unknown as QueueRow[]) {
    const list = byStudent.get(row.user_id) ?? [];
    list.push(row);
    byStudent.set(row.user_id, list);
  }

  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const rows of [...byStudent.values()].slice(0, MAX_STUDENTS)) {
    const profile = rows[0].profile;
    const ids = rows.map((row) => row.id);
    const wantsEmail = Boolean(profile?.email && profile.email_notifications);

    if (wantsEmail && profile) {
      const entries: DigestEntry[] = rows
        .slice(-MAX_ENTRIES)
        .reverse()
        .map((row) => ({ title: row.title, body: row.body, href: notificationHref(row) }));
      const { html, text } = renderDigest({ firstName: profile.full_name.split(" ")[0] || "there", entries, appUrl });

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          // Same batch, same key: a retried run can't send a duplicate.
          "Idempotency-Key": `bb-digest-${createHash("sha256").update([...ids].sort().join(",")).digest("hex")}`,
        },
        body: JSON.stringify({
          from: env.NOTIFICATIONS_FROM_EMAIL,
          to: [profile.email],
          subject: digestSubject(entries),
          html,
          text,
          headers: { "List-Unsubscribe": `<${appUrl}/me#email>` },
        }),
      }).catch(() => null);

      if (!response?.ok) {
        failed += 1;
        continue; // leave unstamped; the next run retries
      }
      sent += 1;
    } else {
      skipped += 1;
    }

    // Stamp opted-out rows too, so they leave the queue.
    await db.from("notifications").update({ emailed_at: new Date().toISOString() }).in("id", ids);
  }

  return Response.json({ students: byStudent.size, sent, skipped, failed });
}
