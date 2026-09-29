"use server";

import { redirect } from "next/navigation";
import { profileSetupSchema } from "@borrowbuddy/shared";
import type { ActionState } from "@/lib/action-state";
import { requireProfile } from "@/lib/auth/guards";
import { firstUploadPath } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export async function completeOnboarding(
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

  // Student ID is compulsory for unverified accounts — PNG/JPG under the
  // caller's own storage folder. Already-verified accounts (bootstrap admins)
  // keep their locked ID: submit_student_id would reject a re-submission.
  const needsId = profile.verification_status !== "verified";
  const studentIdPath = firstUploadPath(formData.get("student_id_path"));
  const idPattern = new RegExp(`^${profile.id}/[A-Za-z0-9-]+\\.(png|jpe?g)$`);

  if (needsId && !idPattern.test(studentIdPath)) {
    return {
      status: "error",
      message: "Upload a PNG or JPG photo of your student ID — it's required to continue.",
    };
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

  if (needsId) {
    const { error: idError } = await supabase.rpc("submit_student_id", {
      p_path: studentIdPath,
    });
    if (idError) {
      return { status: "error", message: idError.message };
    }
  }

  // Verified accounts (e.g. the bootstrap admin) go straight in; everyone
  // else waits in the review queue.
  redirect(profile.verification_status === "verified" ? "/home" : "/pending");
}
