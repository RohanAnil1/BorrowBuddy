import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@borrowbuddy/shared";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Profile columns any signed-in student may read. Email, phone, the student ID
 * path and the verification note are private: the database stops serving them
 * to other students, so they come from my_private_profile() for your own
 * profile and admin_pending_profiles() for the review queue.
 */
export const PUBLIC_PROFILE_COLUMNS =
  "id,full_name,department,year_of_study,avatar_path,verification_status,trust_score,is_admin,email_notifications,created_at,updated_at";

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
  return loadOwnProfile(supabase, user);
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
