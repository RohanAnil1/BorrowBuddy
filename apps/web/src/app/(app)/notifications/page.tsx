import { BellRing, CheckCheck } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { SubmitButton } from "@/components/app/submit-button";
import type { Notification } from "@borrowbuddy/shared";
import { relativeTime } from "@/lib/format";
import { requireProfile } from "@/lib/auth/guards";
import { getNotifications } from "@/lib/data/notifications";
import { markAllRead } from "./actions";

export const metadata = { title: "Notifications" };

function notificationHref(notification: Notification): string | null {
  const payload = notification.payload as Record<string, unknown>;
  const loanId = payload.loan_id;
  const itemId = payload.item_id;
  if (typeof payload.campus_transfer_id === "string") return `/campus/collections/${encodeURIComponent(payload.campus_transfer_id)}`;
  if (typeof payload.campus_claim_id === "string") return "/campus/admin";
  if (typeof payload.campus_post_id === "string") return `/campus/activity`;

  if (typeof loanId === "string") return `/loans/${loanId}`;
  if (typeof itemId === "string") return `/items/${itemId}`;
  return null;
}

export default async function NotificationsPage() {
  const profile = await requireProfile();
  const notifications = await getNotifications(profile.id);
  const unread = notifications.filter((entry) => !entry.read_at);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 dt:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="status-bracket text-[10px]">[ CONTROL TOWER ]</p>
          <h1 className="type-title mt-3 text-[2rem] dt:text-[2.5rem]">Notifications</h1>
        </div>
        {unread.length > 0 && (
          <form action={markAllRead}>
            <SubmitButton pendingLabel="…" variant="secondary">
              <CheckCheck className="size-4" />
              Mark all read
            </SubmitButton>
          </form>
        )}
      </div>

      <div className="mt-8">
        {notifications.length === 0 ? (
          <EmptyState
            body="REQUESTS, APPROVALS, DUE DATES AND HANDOVERS ALL SHOW UP HERE."
            code="ALL QUIET"
            icon={<BellRing className="size-7" />}
            title="Nothing on the wire"
          />
        ) : (
          <ol className="flex flex-col gap-3">
            {notifications.map((notification) => {
              const href = notificationHref(notification);
              const content = (
                <article
                  className={`border p-5 transition-colors ${
                    notification.read_at
                      ? "border-line bg-panel/60"
                      : "border-accent/50 bg-accent/5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-secondary text-[11px] uppercase text-ink">
                        {notification.title}
                      </p>
                      {notification.body && (
                        <p className="type-body mt-1 text-[13px] leading-6 text-ink/60 uppercase">
                          {notification.body}
                        </p>
                      )}
                    </div>
                    {!notification.read_at && (
                      <span className="blink-label mt-1.5 size-2 shrink-0 bg-accent" />
                    )}
                  </div>
                  <p className="font-secondary mt-3 text-[9px] text-ink/40">
                    {relativeTime(notification.created_at).toUpperCase()}
                  </p>
                </article>
              );

              return (
                <li key={notification.id}>
                  {href ? (
                    <Link className="block" href={href}>
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
