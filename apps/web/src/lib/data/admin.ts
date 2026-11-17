import "server-only";

import { cache } from "react";
import type {
  CampusPost,
  Fine,
  FineStatus,
  Incident,
  IncidentPhoto,
  OwnershipClaim,
  Profile,
} from "@borrowbuddy/shared";
import { BUCKETS } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

/* -------------------------------------------------------------------------
   Overview (one RPC: queue sizes, totals, 14-day series)
   ------------------------------------------------------------------------- */

export type QueueKey = "verifications" | "reports" | "incidents" | "fines" | "claims";

export type AdminOverview = {
  queues: Record<QueueKey, number> & { fines_amount: number };
  oldest: Record<QueueKey, string | null>;
  students: { total: number; verified: number; pending: number; rejected: number; suspended: number; admins: number };
  activity: { open_loans: number; overdue_loans: number; listings: number; groups: number; pickup_spots: number };
  series: { day: string; signups: number; loans: number; incidents: number }[];
  error: string | null;
};

const QUEUE_KEYS: QueueKey[] = ["verifications", "reports", "incidents", "fines", "claims"];

function emptyOverview(error: string | null): AdminOverview {
  return {
    queues: { verifications: 0, reports: 0, incidents: 0, fines: 0, claims: 0, fines_amount: 0 },
    oldest: { verifications: null, reports: null, incidents: null, fines: null, claims: null },
    students: { total: 0, verified: 0, pending: 0, rejected: 0, suspended: 0, admins: 0 },
    activity: { open_loans: 0, overdue_loans: 0, listings: 0, groups: 0, pickup_spots: 0 },
    series: [],
    error,
  };
}

function numbers<T extends string>(source: unknown, keys: readonly T[]): Record<T, number> {
  const record = (source ?? {}) as Record<string, unknown>;
  return Object.fromEntries(keys.map((key) => [key, Number(record[key] ?? 0) || 0])) as Record<T, number>;
}

/**
 * Everything the console's sidebar and overview need, in one round trip.
 * Cached per request so the layout and the page share it. Admins only; on
 * failure the counts are zero and `error` says why.
 */
export const getAdminOverview = cache(async (): Promise<AdminOverview> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_overview");
  if (error || !data) return emptyOverview(error?.message ?? "No data");

  const raw = data as Record<string, unknown>;
  const oldest = (raw.oldest ?? {}) as Record<string, string | null>;
  return {
    queues: numbers(raw.queues, [...QUEUE_KEYS, "fines_amount"] as const),
    oldest: Object.fromEntries(QUEUE_KEYS.map((key) => [key, oldest[key] ?? null])) as Record<QueueKey, string | null>,
    students: numbers(raw.students, ["total", "verified", "pending", "rejected", "suspended", "admins"] as const),
    activity: numbers(raw.activity, ["open_loans", "overdue_loans", "listings", "groups", "pickup_spots"] as const),
    series: ((raw.series ?? []) as AdminOverview["series"]).map((point) => ({
      day: String(point.day),
      signups: Number(point.signups) || 0,
      loans: Number(point.loans) || 0,
      incidents: Number(point.incidents) || 0,
    })),
    error: null,
  };
});

/** A queue counts as stale once its oldest item has waited this long. */
export const STALE_AFTER_HOURS = 48;

export function isStale(oldest: string | null | undefined): boolean {
  if (!oldest) return false;
  return Date.now() - new Date(oldest).getTime() > STALE_AFTER_HOURS * 3_600_000;
}

/* -------------------------------------------------------------------------
   Audit log
   ------------------------------------------------------------------------- */

export type AuditEntry = {
  id: number;
  action: string;
  entity: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  subject_name: string | null;
};

export async function getAuditLog({
  category,
  search,
  limit = 50,
  offset = 0,
}: {
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ entries: AuditEntry[]; total: number; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_audit", {
    p_category: category || null,
    p_search: search || null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) return { entries: [], total: 0, error: error.message };
  const rows = (data ?? []) as (AuditEntry & { total_count: number })[];
  return {
    entries: rows.map((row) => {
      const { total_count, ...entry } = row;
      void total_count;
      return { ...entry, id: Number(entry.id), metadata: entry.metadata ?? {} };
    }),
    total: rows[0] ? Number(rows[0].total_count) : 0,
    error: null,
  };
}

/* -------------------------------------------------------------------------
   Verification queue
   ------------------------------------------------------------------------- */

/** Signed URLs for private files, in one request. Missing files are skipped. */
export async function signedUrls(bucket: string, paths: (string | null | undefined)[], expiresIn = 60 * 30) {
  const unique = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  if (unique.length === 0) return new Map<string, string>();
  const supabase = await createClient();
  const { data } = await supabase.storage.from(bucket).createSignedUrls(unique, expiresIn);
  return new Map(
    (data ?? []).filter((row) => row.path && row.signedUrl).map((row) => [row.path as string, row.signedUrl]),
  );
}

export async function getVerificationQueue(limit = 60) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_pending_profiles", { p_limit: limit });
  const profiles = (data as Profile[] | null) ?? [];
  const urls = await signedUrls(BUCKETS.studentIds, profiles.map((profile) => profile.student_id_path));
  return {
    profiles: profiles.map((profile) => ({
      ...profile,
      id_url: profile.student_id_path ? (urls.get(profile.student_id_path) ?? null) : null,
    })),
    error: error?.message ?? null,
  };
}

/* -------------------------------------------------------------------------
   Incidents
   ------------------------------------------------------------------------- */

export type AdminIncident = Incident & {
  reporter: Pick<Profile, "id" | "full_name"> | null;
  resolver: Pick<Profile, "id" | "full_name"> | null;
  photos: (IncidentPhoto & { url: string | null })[];
  loan: {
    id: string;
    item_title: string | null;
    borrower_id: string;
    owner_id: string;
    borrower_name: string | null;
    owner_name: string | null;
  } | null;
};

export const INCIDENT_FILTERS = {
  open: ["open", "under_review"],
  closed: ["resolved", "rejected"],
} as const;

export async function getAdminIncidents(filter: keyof typeof INCIDENT_FILTERS, limit = 50) {
  const supabase = await createClient();
  const open = filter === "open";
  const { data, error } = await supabase
    .from("incidents")
    .select(
      "*, reporter:profiles!incidents_reporter_id_fkey(id, full_name), resolver:profiles!incidents_resolved_by_fkey(id, full_name), photos:incident_photos(*), loan:loans(id, borrower_id, owner_id, borrower:profiles!loans_borrower_id_fkey(full_name), owner:profiles!loans_owner_id_fkey(full_name), item:items(title))",
    )
    .in("status", [...INCIDENT_FILTERS[filter]])
    .order(open ? "created_at" : "resolved_at", { ascending: open })
    .limit(limit);

  type Row = Incident & {
    reporter: Pick<Profile, "id" | "full_name"> | null;
    resolver: Pick<Profile, "id" | "full_name"> | null;
    photos: IncidentPhoto[] | null;
    loan: {
      id: string;
      borrower_id: string;
      owner_id: string;
      borrower: { full_name: string } | null;
      owner: { full_name: string } | null;
      item: { title: string } | null;
    } | null;
  };
  const rows = (data as unknown as Row[] | null) ?? [];
  const urls = await signedUrls(
    BUCKETS.incidentPhotos,
    rows.flatMap((row) => (row.photos ?? []).map((photo) => photo.path)),
  );

  const incidents: AdminIncident[] = rows.map((row) => ({
    ...row,
    photos: (row.photos ?? []).map((photo) => ({ ...photo, url: urls.get(photo.path) ?? null })),
    loan: row.loan
      ? {
          id: row.loan.id,
          borrower_id: row.loan.borrower_id,
          owner_id: row.loan.owner_id,
          borrower_name: row.loan.borrower?.full_name ?? null,
          owner_name: row.loan.owner?.full_name ?? null,
          item_title: row.loan.item?.title ?? null,
        }
      : null,
  }));
  return { incidents, error: error?.message ?? null };
}

/* -------------------------------------------------------------------------
   Fines
   ------------------------------------------------------------------------- */

export type AdminFine = Fine & {
  user: Pick<Profile, "id" | "full_name"> | null;
  settler: Pick<Profile, "id" | "full_name"> | null;
  loan: { id: string; item_title: string | null } | null;
};

export async function getAdminFines(status: FineStatus | "all", { limit = 25, offset = 0 } = {}) {
  const supabase = await createClient();
  let query = supabase
    .from("fines")
    .select(
      "*, user:profiles!fines_user_id_fkey(id, full_name), settler:profiles!fines_settled_by_fkey(id, full_name), loan:loans(id, item:items(title))",
      { count: "exact" },
    )
    .order("created_at", { ascending: status === "pending" })
    .range(offset, offset + limit - 1);
  if (status !== "all") query = query.eq("status", status);
  const { data, error, count } = await query;

  type Row = Fine & {
    user: Pick<Profile, "id" | "full_name"> | null;
    settler: Pick<Profile, "id" | "full_name"> | null;
    loan: { id: string; item: { title: string } | null } | null;
  };
  const fines: AdminFine[] = ((data as unknown as Row[] | null) ?? []).map((row) => ({
    ...row,
    loan: row.loan ? { id: row.loan.id, item_title: row.loan.item?.title ?? null } : null,
  }));
  return { fines, total: count ?? fines.length, error: error?.message ?? null };
}

export async function getFineStatusCounts() {
  const supabase = await createClient();
  const statuses: FineStatus[] = ["pending", "settled", "waived"];
  const results = await Promise.all(
    statuses.map((status) =>
      supabase.from("fines").select("id", { count: "exact", head: true }).eq("status", status),
    ),
  );
  return Object.fromEntries(statuses.map((status, index) => [status, results[index].count ?? 0])) as Record<
    FineStatus,
    number
  >;
}

/* -------------------------------------------------------------------------
   Reports (students flag an item, a person or a message)
   ------------------------------------------------------------------------- */

export type ReportStatus = "open" | "resolved" | "dismissed";

export type AdminReport = {
  id: string;
  reporter_id: string;
  target: "item" | "user" | "message";
  target_id: string;
  reason: string;
  status: ReportStatus;
  resolved_at: string | null;
  created_at: string;
  reporter: Pick<Profile, "id" | "full_name"> | null;
  resolver: Pick<Profile, "id" | "full_name"> | null;
  target_label: string | null;
  target_href: string | null;
};

export async function getAdminReports(status: ReportStatus, limit = 50) {
  const supabase = await createClient();
  const [list, ...counts] = await Promise.all([
    supabase
      .from("reports")
      .select(
        "*, reporter:profiles!reports_reporter_id_fkey(id, full_name), resolver:profiles!reports_resolved_by_fkey(id, full_name)",
      )
      .eq("status", status)
      .order("created_at", { ascending: status === "open" })
      .limit(limit),
    ...(["open", "resolved", "dismissed"] as const).map((key) =>
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", key),
    ),
  ]);

  const rows = (list.data as unknown as Omit<AdminReport, "target_label" | "target_href">[] | null) ?? [];
  const ids = (target: AdminReport["target"]) =>
    [...new Set(rows.filter((row) => row.target === target).map((row) => row.target_id))];

  const [items, people, messages] = await Promise.all([
    ids("item").length
      ? supabase.from("items").select("id, title").in("id", ids("item"))
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    ids("user").length
      ? supabase.from("profiles").select("id, full_name").in("id", ids("user"))
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    ids("message").length
      ? supabase.from("messages").select("id, body, conversation_id").in("id", ids("message"))
      : Promise.resolve({ data: [] as { id: string; body: string | null; conversation_id: string }[] }),
  ]);
  const itemTitles = new Map((items.data ?? []).map((row) => [row.id, row.title]));
  const names = new Map((people.data ?? []).map((row) => [row.id, row.full_name]));
  const bodies = new Map((messages.data ?? []).map((row) => [row.id, row]));

  const reports: AdminReport[] = rows.map((row) => {
    if (row.target === "item") {
      return { ...row, target_label: itemTitles.get(row.target_id) ?? null, target_href: `/items/${row.target_id}` };
    }
    if (row.target === "user") {
      return { ...row, target_label: names.get(row.target_id) ?? null, target_href: `/admin/students/${row.target_id}` };
    }
    const message = bodies.get(row.target_id);
    return {
      ...row,
      target_label: message ? (message.body ?? "Photo") : null,
      target_href: message ? `/chat/${message.conversation_id}` : null,
    };
  });

  return {
    reports,
    counts: { open: counts[0].count ?? 0, resolved: counts[1].count ?? 0, dismissed: counts[2].count ?? 0 },
    error: list.error?.message ?? null,
  };
}

/* -------------------------------------------------------------------------
   Campus ownership claims (lost & found)
   ------------------------------------------------------------------------- */

export type ClaimReview = {
  claim: OwnershipClaim;
  claimant: string;
  post: CampusPost | null;
  photo: string | null;
  notes: string | null;
};

/**
 * Pending ownership claims, oldest first, with the found post, its first
 * photo, the finder's private identifying notes and the claimant's name.
 * Batched: a handful of queries no matter how many claims are waiting.
 */
export async function getClaimReviews(limit = 100) {
  const db = await createClient();
  const [{ data: claimRows, error }, { data: approved }] = await Promise.all([
    db.from("campus_claims").select("*").eq("status", "pending").order("created_at").limit(limit),
    db
      .from("campus_transfers")
      .select("id, post_id, recipient_id, created_at, post:campus_posts(title), recipient:profiles!campus_transfers_recipient_id_fkey(full_name)")
      .not("claim_id", "is", null)
      .eq("status", "active")
      .order("created_at")
      .limit(100),
  ]);
  const claims = (claimRows ?? []) as OwnershipClaim[];
  const postIds = [...new Set(claims.map((claim) => claim.post_id))];
  const claimantIds = [...new Set(claims.map((claim) => claim.claimant_id))];

  const [posts, notes, people] = await Promise.all([
    postIds.length ? db.from("campus_posts").select("*").in("id", postIds) : Promise.resolve({ data: [] }),
    postIds.length
      ? db.from("campus_post_notes").select("post_id, identifying_notes").in("post_id", postIds)
      : Promise.resolve({ data: [] }),
    claimantIds.length
      ? db.from("profiles").select("id, full_name").in("id", claimantIds)
      : Promise.resolve({ data: [] }),
  ]);
  const postById = new Map(((posts.data ?? []) as CampusPost[]).map((post) => [post.id, post]));
  const notesByPost = new Map(
    ((notes.data ?? []) as { post_id: string; identifying_notes: string | null }[]).map((row) => [
      row.post_id,
      row.identifying_notes,
    ]),
  );
  const nameById = new Map(((people.data ?? []) as { id: string; full_name: string }[]).map((row) => [row.id, row.full_name]));
  const photos = await signedUrls(
    "campus-photos",
    [...postById.values()].map((post) => post.images[0]),
    300,
  );

  const reviews: ClaimReview[] = claims.map((claim) => {
    const post = postById.get(claim.post_id) ?? null;
    return {
      claim,
      claimant: nameById.get(claim.claimant_id) ?? "Campus member",
      post,
      photo: post?.images[0] ? (photos.get(post.images[0]) ?? null) : null,
      notes: notesByPost.get(claim.post_id) ?? null,
    };
  });

  type ApprovedRow = {
    id: string;
    post_id: string;
    recipient_id: string;
    created_at: string;
    post: { title: string } | null;
    recipient: { full_name: string } | null;
  };
  return {
    reviews,
    approved: ((approved as unknown as ApprovedRow[] | null) ?? []).map((row) => ({
      id: row.id,
      post_id: row.post_id,
      created_at: row.created_at,
      title: row.post?.title ?? "Found item",
      recipient: row.recipient?.full_name ?? "Campus member",
    })),
    error: error?.message ?? null,
  };
}
