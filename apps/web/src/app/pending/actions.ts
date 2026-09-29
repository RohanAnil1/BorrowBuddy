"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requireProfile } from "@/lib/auth/guards";
import { firstUploadPath } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

/** Replace a rejected student ID — the RPC re-verifies everything. */
export async function resubmitStudentId(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await requireProfile();

  const path = firstUploadPath(formData.get("student_id_path"));
  const pattern = new RegExp(`^${profile.id}/[A-Za-z0-9-]+\\.(png|jpe?g)$`);

  if (!pattern.test(path)) {
    return { status: "error", message: "Upload a PNG or JPG photo of your student ID first." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_student_id", { p_path: path });
  if (error) {
    return { status: "error", message: error.message };
  }

  redirect("/pending");
}
