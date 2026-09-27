import { redirect } from "next/navigation";
import type { Profile } from "@borrowbuddy/shared";
import { getServerEnv, isSupabaseConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/data/profiles";

/**
 * Bootstrap admin: when ADMIN_EMAIL is configured and the signed-in account
 * matches, promote it to admin + verified once. This is what lets the very
 * first admin reach the review queue with no one to approve them.
 */
async function ensureBootstrapAdmin(profile: Profile): Promise<Profile> {
  let adminEmail: string | undefined;
  try {
    adminEmail = getServerEnv().ADMIN_EMAIL;
  } catch {
    return profile;
  }
  if (!adminEmail || profile.email.toLowerCase() !== adminEmail.toLowerCase()) {
    return profile;
  }
  if (profile.is_admin && profile.verification_status === "verified") {
    return profile;
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .update({ is_admin: true, verification_status: "verified", verification_note: null })
      .eq("id", profile.id)
      .select()
      .single();
    if (error) {
      console.error("[bootstrap-admin] promotion failed:", error.message);
      return profile;
    }
    if (data) return data as Profile;
  } catch (error) {
    console.error("[bootstrap-admin] promotion threw:", error);
  }
  return profile;
}

export async function requireProfile(): Promise<Profile> {
  if (!isSupabaseConfigured()) redirect("/login");
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return ensureBootstrapAdmin(profile);
}

export async function requireVerified(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.verification_status !== "verified") redirect("/pending");
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireVerified();
  if (!profile.is_admin) redirect("/home");
  return profile;
}
