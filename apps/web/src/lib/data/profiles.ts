import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, VerificationStatus } from "@borrowbuddy/shared";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Profile columns any signed-in student may read. Email, phone, the student ID
 * path and the verification note are private: the database stops serving them
 * to other students, so they come from my_private_profile() for your own
 * profile and admin_pending_profiles() for the review queue.
 */
export const PUBLIC_PROFILE_COLUMNS =
  "id,full_name,department_id,...departments(department:name),year_of_study,avatar_path,verification_status,trust_score,is_admin,email_notifications,created_at,updated_at";

type PrivateFields = Pick<Profile, "email" | "phone" | "student_id_path" | "verification_note">;

/** Someone else's profile: the public columns only. */
export type PublicProfile = Omit<Profile, keyof PrivateFields>;

/** Your own full profile: the public row plus your private fields. */
export async function loadOwnProfile(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<Profile | null> {
  const [row, own] = await Promise.all([
    supabase.from("profiles").select(PUBLIC_PROFILE_COLUMNS).eq("id", user.id).maybeSingle(),
    supabase.rpc("my_private_profile").maybeSingle(),
  ]);
  if (!row.data) return null;
  const fields = (own.data ?? null) as Partial<PrivateFields> | null;
  return {
    ...(row.data as unknown as PublicProfile),
    email: fields?.email ?? user.email ?? "",
    phone: fields?.phone ?? null,
    student_id_path: fields?.student_id_path ?? null,
    verification_note: fields?.verification_note ?? null,
  } as Profile;
}

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  const profile = await loadOwnProfile(supabase, user);
  if (profile) return profile;
  // No profile row: it was deleted. ensure_my_profile() starts a fresh one
  // only for a live sign-in; a sign-in the deletion ended gets false.
  const { data: live } = await supabase.rpc("ensure_my_profile");
  return live === true ? loadOwnProfile(supabase, user) : null;
});

export async function getProfile(id: string): Promise<PublicProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select(PUBLIC_PROFILE_COLUMNS).eq("id", id).maybeSingle();
  return (data as unknown as PublicProfile | null) ?? null;
}

/** The verification queue with email and ID upload. Admins only; anyone else gets an empty list. */
export async function getPendingVerifications(limit = 50): Promise<Profile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_pending_profiles", { p_limit: limit });
  if (error) return [];
  return (data as Profile[] | null) ?? [];
}

/** A row of the admin student directory: the full profile plus activity counts. */
export type AdminStudentRow = Omit<Profile, "updated_at" | "email_notifications"> & {
  items_count: number;
  active_loans_count: number;
  pending_fines_total: number;
};

export type StudentDirectory = {
  students: AdminStudentRow[];
  total: number;
  counts: Record<VerificationStatus, number>;
  error: string | null;
};

const EMPTY_COUNTS: Record<VerificationStatus, number> = {
  pending: 0,
  verified: 0,
  rejected: 0,
  suspended: 0,
};

/** Every student for the admin directory, newest first. Admins only. */
export async function getStudentDirectory({
  search,
  status,
  limit = 50,
  offset = 0,
}: {
  search?: string;
  status?: VerificationStatus;
  limit?: number;
  offset?: number;
}): Promise<StudentDirectory> {
  const supabase = await createClient();
  const [list, totals] = await Promise.all([
    supabase.rpc("admin_list_profiles", {
      p_search: search || null,
      p_status: status ?? null,
      p_limit: limit,
      p_offset: offset,
    }),
    supabase.rpc("admin_profile_status_counts"),
  ]);

  const counts = { ...EMPTY_COUNTS };
  for (const row of (totals.data ?? []) as { verification_status: VerificationStatus; total: number }[]) {
    counts[row.verification_status] = Number(row.total);
  }

  const rows = (list.data ?? []) as (AdminStudentRow & { total_count: number })[];
  return {
    students: rows.map((row) => {
      const { total_count, ...student } = row;
      void total_count;
      return { ...student, trust_score: Number(student.trust_score) };
    }),
    total: rows[0] ? Number(rows[0].total_count) : 0,
    counts,
    error: list.error?.message ?? totals.error?.message ?? null,
  };
}

/** Everything the admin manage page shows about one student. */
export type AdminStudentDetail = {
  profile: Profile;
  items: { id: string; title: string; status: string; created_at: string }[];
  loans: {
    id: string;
    status: string;
    start_date: string;
    due_date: string;
    created_at: string;
    item_title: string;
    role: "borrower" | "owner";
    other_name: string;
  }[];
  fines: { id: string; amount: number; status: string; source: string; reason: string; created_at: string }[];
  audit: { id: number; action: string; metadata: Record<string, unknown>; created_at: string; actor_name: string | null }[];
};

/** One student for the admin manage page. Admins only; null when not found. */
export async function getStudentDetail(id: string): Promise<AdminStudentDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_get_student", { p_profile_id: id });
  if (error || !data) return null;
  const detail = data as AdminStudentDetail;
  return { ...detail, profile: { ...detail.profile, trust_score: Number(detail.profile.trust_score) } };
}
