"use server";

import { revalidatePath } from "next/cache";
import { profileSetupSchema } from "@borrowbuddy/shared";
import type { ActionState } from "@/lib/action-state";
import { requireProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await requireProfile();

  const parsed = profileSetupSchema.safeParse({
    full_name: formData.get("full_name"),
    phone: formData.get("phone") || undefined,
    department: formData.get("department"),
    year_of_study: Number(formData.get("year_of_study") ?? 1),
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.full_name,
      phone: parsed.data.phone || null,
      department: parsed.data.department,
      year_of_study: parsed.data.year_of_study,
    })
    .eq("id", profile.id);

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/me");
  return { status: "success", message: "Profile updated." };
}

export async function submitStudentId(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireProfile();
  const path = String(formData.get("student_id_path") ?? "").trim();

  if (!path) {
    return { status: "error", message: "Upload a photo of your student ID first." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_student_id", { p_path: path });

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/me");
  revalidatePath("/pending");
  return { status: "success", message: "Submitted for review." };
}
