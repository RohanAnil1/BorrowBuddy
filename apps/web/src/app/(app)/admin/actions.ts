"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verificationDecisionSchema } from "@borrowbuddy/shared";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export async function reviewVerification(formData: FormData): Promise<void> {
  await requireAdmin();

  const parsed = verificationDecisionSchema.safeParse({
    profile_id: formData.get("profile_id"),
    decision: formData.get("decision"),
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    redirect("/admin?error=Missing%20profile%20or%20decision");
  }

  const status = parsed.data.decision === "approve" ? "verified" : "rejected";
  const supabase = await createClient();

  const { error } = await supabase.rpc("admin_set_verification", {
    p_profile_id: parsed.data.profile_id,
    p_status: status,
    p_note: parsed.data.note ?? null,
  });

  if (error) {
    redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin");
  revalidatePath("/home");
}
