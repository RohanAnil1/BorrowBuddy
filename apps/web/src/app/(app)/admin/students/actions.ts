"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  studentAdminChangeSchema,
  studentDetailsSchema,
  studentNoticeSchema,
  studentStatusChangeSchema,
  studentTrustSchema,
} from "@borrowbuddy/shared";
import { requireAdmin } from "@/lib/auth/guards";
import { flash } from "@/lib/flash";
import { BUCKETS } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const BASE = "/admin/students";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where to land after an action: back on the same directory or student page, never off-site. */
function returnPath(formData: FormData): string {
  const value = String(formData.get("return_to") ?? "");
  return value === BASE || value.startsWith(`${BASE}?`) || value.startsWith(`${BASE}/`) ? value : BASE;
}

function readProfileId(formData: FormData): string | null {
  const id = String(formData.get("profile_id") ?? "");
  return uuid.test(id) ? id : null;
}

async function finish(error: { message: string } | null, success: string, path: string) {
  await flash(error ? error.message : success, error ? "error" : "success");
  revalidatePath(BASE, "layout");
  revalidatePath("/admin");
  redirect(path);
}

const STATUS_MESSAGES = {
  verified: "Student verified.",
  rejected: "Verification rejected.",
  suspended: "Student suspended.",
} as const;

export async function setStudentStatus(formData: FormData): Promise<void> {
  await requireAdmin();
  const back = returnPath(formData);
  const parsed = studentStatusChangeSchema.safeParse({
    profile_id: formData.get("profile_id"),
    status: formData.get("status"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return finish({ message: "Missing student or status." }, "", back);

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_verification", {
    p_profile_id: parsed.data.profile_id,
    p_status: parsed.data.status,
    p_note: parsed.data.note ?? null,
  });
  return finish(error, STATUS_MESSAGES[parsed.data.status], back);
}

export async function setStudentAdmin(formData: FormData): Promise<void> {
  await requireAdmin();
  const back = returnPath(formData);
  const parsed = studentAdminChangeSchema.safeParse({
    profile_id: formData.get("profile_id"),
    is_admin: formData.get("is_admin"),
  });
  if (!parsed.success) return finish({ message: "Missing student or access level." }, "", back);

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_admin", {
    p_profile_id: parsed.data.profile_id,
    p_is_admin: parsed.data.is_admin,
  });
  return finish(error, parsed.data.is_admin ? "Admin access granted." : "Admin access removed.", back);
}

export async function revokeStudentVerification(formData: FormData): Promise<void> {
  await requireAdmin();
  const back = returnPath(formData);
  const id = readProfileId(formData);
  if (!id) return finish({ message: "Missing student." }, "", back);
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_revoke_verification", { p_profile_id: id, p_note: note || null });
  return finish(error, "Verification revoked. They need to upload a new student ID.", back);
}

export async function updateStudentDetails(formData: FormData): Promise<void> {
  await requireAdmin();
  const back = returnPath(formData);
  const year = String(formData.get("year_of_study") ?? "").trim();
  const parsed = studentDetailsSchema.safeParse({
    profile_id: formData.get("profile_id"),
    full_name: formData.get("full_name"),
    department: formData.get("department") ?? "",
    year_of_study: year ? Number(year) : null,
    phone: formData.get("phone") ?? "",
  });
  if (!parsed.success) {
    return finish({ message: parsed.error.issues[0]?.message ?? "Check the details." }, "", back);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_student", {
    p_profile_id: parsed.data.profile_id,
    p_full_name: parsed.data.full_name,
    p_department: parsed.data.department || null,
    p_year_of_study: parsed.data.year_of_study,
    p_phone: parsed.data.phone || null,
  });
  return finish(error, "Details saved.", back);
}

export async function setStudentTrust(formData: FormData): Promise<void> {
  await requireAdmin();
  const back = returnPath(formData);
  const parsed = studentTrustSchema.safeParse({
    profile_id: formData.get("profile_id"),
    trust_score: Number(formData.get("trust_score")),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return finish({ message: parsed.error.issues[0]?.message ?? "Check the trust score." }, "", back);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_trust_score", {
    p_profile_id: parsed.data.profile_id,
    p_score: parsed.data.trust_score,
    p_reason: parsed.data.reason,
  });
  return finish(error, "Trust score updated.", back);
}

export async function recalculateStudentTrust(formData: FormData): Promise<void> {
  await requireAdmin();
  const back = returnPath(formData);
  const id = readProfileId(formData);
  if (!id) return finish({ message: "Missing student." }, "", back);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_recalculate_trust_score", { p_profile_id: id });
  return finish(error, `Trust score recalculated: ${Math.round(Number(data ?? 0))}.`, back);
}

export async function sendStudentNotice(formData: FormData): Promise<void> {
  await requireAdmin();
  const back = returnPath(formData);
  const parsed = studentNoticeSchema.safeParse({
    profile_id: formData.get("profile_id"),
    title: formData.get("title"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return finish({ message: parsed.error.issues[0]?.message ?? "Check the message." }, "", back);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_send_notice", {
    p_profile_id: parsed.data.profile_id,
    p_title: parsed.data.title,
    p_body: parsed.data.body,
  });
  return finish(error, "Notice sent.", back);
}

export async function pauseStudentListings(formData: FormData): Promise<void> {
  await requireAdmin();
  const back = returnPath(formData);
  const id = readProfileId(formData);
  if (!id) return finish({ message: "Missing student." }, "", back);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_pause_student_listings", { p_profile_id: id });
  const count = Number(data ?? 0);
  revalidatePath("/home");
  return finish(error, count ? `Paused ${count} listing${count === 1 ? "" : "s"}.` : "No live listings to pause.", back);
}

export async function waiveStudentFines(formData: FormData): Promise<void> {
  await requireAdmin();
  const back = returnPath(formData);
  const id = readProfileId(formData);
  if (!id) return finish({ message: "Missing student." }, "", back);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_waive_student_fines", { p_profile_id: id });
  const count = Number(data ?? 0);
  revalidatePath("/fines");
  return finish(error, count ? `Waived ${count} fine${count === 1 ? "" : "s"}.` : "No pending fines.", back);
}

export async function removeStudentAvatar(formData: FormData): Promise<void> {
  await requireAdmin();
  const back = returnPath(formData);
  const id = readProfileId(formData);
  if (!id) return finish({ message: "Missing student." }, "", back);

  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc("admin_remove_student_avatar", { p_profile_id: id });
  if (!error && typeof path === "string" && path) {
    // Best effort: the profile no longer points at it either way.
    try {
      await createAdminClient().storage.from(BUCKETS.avatars).remove([path]);
    } catch (storageError) {
      console.error("[admin] avatar file removal failed:", storageError);
    }
  }
  return finish(error, path ? "Profile photo removed." : "They have no profile photo.", back);
}
