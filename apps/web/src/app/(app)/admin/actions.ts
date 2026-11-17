"use server";

import { verificationDecisionSchema } from "@borrowbuddy/shared";
import { adminReturnPath, finishAdminAction } from "@/lib/admin-actions";
import { sendEmail } from "@/lib/email/send";
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

/** Sends the signed-in admin a test email, to check that email delivery works. */
export async function sendTestEmail(): Promise<void> {
  const me = await requireAdmin();
  const result = await sendEmail({
    to: me.email,
    subject: "BorrowBuddy test email",
    text: "This is a test from the BorrowBuddy admin console. If you can read it, notification emails are working.",
    html: '<p style="font-family:Arial,sans-serif;font-size:15px">This is a test from the <b>BorrowBuddy</b> admin console.</p><p style="font-family:Arial,sans-serif;font-size:15px">If you can read it, notification emails are working.</p>',
  });
  return finishAdminAction(
    result.ok ? null : { message: `Test email failed: ${result.error}` },
    `Test email sent to ${me.email} via ${result.ok ? (result.via === "smtp" ? "Gmail SMTP" : "Resend") : ""}. Check the inbox and spam folder.`,
    "/admin",
  );
}
