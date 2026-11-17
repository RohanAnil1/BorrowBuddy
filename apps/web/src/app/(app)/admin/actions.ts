"use server";

import { verificationDecisionSchema } from "@borrowbuddy/shared";
import { adminReturnPath, finishAdminAction } from "@/lib/admin-actions";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export async function reviewVerification(formData: FormData): Promise<void> {
  await requireAdmin();
  const back = adminReturnPath(formData, "/admin/verifications");

  const parsed = verificationDecisionSchema.safeParse({
    profile_id: formData.get("profile_id"),
    decision: formData.get("decision"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return finishAdminAction({ message: "Missing student or decision." }, "", back);
  }

  const approve = parsed.data.decision === "approve";
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_verification", {
    p_profile_id: parsed.data.profile_id,
    p_status: approve ? "verified" : "rejected",
    p_note: parsed.data.note ?? null,
  });

  const name = String(formData.get("name") ?? "").slice(0, 80) || "Student";
  return finishAdminAction(
    error,
    approve ? `${name} is verified and can start borrowing.` : `${name}'s ID was rejected. They've been told why.`,
    back,
    ["/home"],
  );
}
