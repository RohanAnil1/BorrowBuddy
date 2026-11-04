import "server-only";
import type {
  CampusPost,
  CollectionTransfer,
  ExchangeMessage,
  HandoverAppointment,
  HandoverSchedule,
  OwnershipClaim,
} from "@borrowbuddy/shared";
import { createClient } from "@/lib/supabase/server";

export async function campusPosts(
  filters: {
    kind?: string;
    q?: string;
    category?: string;
    location?: string;
    date?: string;
    status?: string;
    page?: number;
    owner?: string;
  } = {},
) {
  const db = await createClient();
  let query = db
    .from("campus_posts")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id");
  if (filters.kind) query = query.eq("kind", filters.kind);
  if (filters.q) query = query.ilike("title", `%${filters.q}%`);
  if (filters.category) query = query.eq("category_id", filters.category);
  if (filters.location)
    query = query.ilike("location", `%${filters.location}%`);
  if (filters.date) query = query.eq("found_on", filters.date);
  if (filters.owner) query = query.eq("owner_id", filters.owner);
  if (filters.status && filters.status !== "all")
    query = query.eq("status", filters.status);
  const page = Math.max(0, filters.page ?? 0);
  const { data, error, count } = await query.range(page * 24, page * 24 + 23);
  if (error) throw new Error("Could not load the campus board. Please retry.");
  return { posts: (data ?? []) as CampusPost[], count: count ?? 0 };
}
export async function campusPost(id: string): Promise<CampusPost | null> {
  const db = await createClient();
  const { data, error } = await db
    .from("campus_posts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Could not load this campus post.");
  return data as CampusPost | null;
}
export async function campusPhotos(
  paths: string[],
): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const db = await createClient();
  const { data, error } = await db.storage
    .from("campus-photos")
    .createSignedUrls([...new Set(paths)], 300);
  if (error) throw new Error("Could not load campus photos. Please retry.");
  return Object.fromEntries(
    (data ?? [])
      .filter((x) => x.path && x.signedUrl)
      .map((x) => [x.path!, x.signedUrl!]),
  );
}
export async function campusClaims(
  postId?: string,
  pendingOnly = false,
): Promise<OwnershipClaim[]> {
  const db = await createClient();
  let q = db
    .from("campus_claims")
    .select("*")
    .order("created_at", { ascending: pendingOnly })
    .limit(100);
  if (postId) q = q.eq("post_id", postId);
  if (pendingOnly) q = q.eq("status", "pending");
  const { data, error } = await q;
  if (error) throw new Error("Could not load private ownership claims.");
  return (data ?? []) as OwnershipClaim[];
}
export async function campusNotes(postId: string): Promise<string | null> {
  const db = await createClient();
  const { data, error } = await db
    .from("campus_post_notes")
    .select("identifying_notes")
    .eq("post_id", postId)
    .maybeSingle();
  if (error) throw new Error("Could not load identifying notes.");
  return data?.identifying_notes ?? null;
}
export async function campusTransfers(): Promise<CollectionTransfer[]> {
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new Error("Sign in to view collections.");
  const { data, error } = await db
    .from("campus_transfers")
    .select("*")
    .or(`host_id.eq.${auth.user.id},recipient_id.eq.${auth.user.id}`)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("Could not load collection conversations.");
  return (data ?? []) as CollectionTransfer[];
}
export async function campusTransfer(
  id: string,
): Promise<CollectionTransfer | null> {
  const db = await createClient();
  const { data, error } = await db
    .from("campus_transfers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Could not load this collection.");
  return data as CollectionTransfer | null;
}
export async function campusMessages(id: string): Promise<ExchangeMessage[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("campus_messages")
    .select("*")
    .eq("transfer_id", id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(50);
  if (error) throw new Error("Could not load private messages.");
  return ((data ?? []) as ExchangeMessage[]).reverse();
}
export async function campusThreadHeads(): Promise<
  Record<string, string | null>
> {
  const db = await createClient();
  const { data, error } = await db.rpc("campus_thread_heads");
  if (error) throw new Error("Could not load collection unread status.");
  return Object.fromEntries(
    (data ?? []).map(
      (row: { transfer_id: string; last_incoming_at: string | null }) => [
        row.transfer_id,
        row.last_incoming_at,
      ],
    ),
  );
}
export async function campusSchedule(
  hostId: string,
): Promise<HandoverSchedule | null> {
  const db = await createClient();
  const { data, error } = await db
    .from("campus_schedules")
    .select("*")
    .eq("host_id", hostId)
    .maybeSingle();
  if (error) throw new Error("Could not load handover availability.");
  return data as HandoverSchedule | null;
}
export async function campusAppointments(context?: {
  loan?: string;
  transfer?: string;
}): Promise<HandoverAppointment[]> {
  const db = await createClient();
  let q = db
    .from("campus_appointments")
    .select("*")
    .order("starts_at", { ascending: false })
    .limit(100);
  if (context?.loan) q = q.eq("loan_id", context.loan);
  if (context?.transfer) q = q.eq("transfer_id", context.transfer);
  const { data, error } = await q;
  if (error) throw new Error("Could not load handover appointments.");
  return (data ?? []) as HandoverAppointment[];
}
export async function campusPeople(ids: string[]) {
  if (!ids.length)
    return {} as Record<string, { id: string; full_name: string }>;
  const db = await createClient();
  const { data, error } = await db
    .from("profiles")
    .select("id,full_name")
    .in("id", [...new Set(ids)]);
  if (error) throw new Error("Could not load member names.");
  return Object.fromEntries((data ?? []).map((p) => [p.id, p])) as Record<
    string,
    { id: string; full_name: string }
  >;
}
