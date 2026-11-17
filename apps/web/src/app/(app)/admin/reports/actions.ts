"use server";

import { UUID, adminReturnPath, finishAdminAction } from "@/lib/admin-actions";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export async function resolveReport(formData: FormData): Promise<void> {
  await requireAdmin();
  const back = adminReturnPath(formData, "/admin/reports");
  const id = String(formData.get("report_id") ?? "");
  const decision = formData.get("decision") === "dismissed" ? "dismissed" : "resolved";
  if (!UUID.test(id)) return finishAdminAction({ message: "Missing report." }, "", back);
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_resolve_report", {
    p_report_id: id,
    p_decision: decision,
    p_note: note || null,
  });
  return finishAdminAction(error, decision === "resolved" ? "Report resolved." : "Report dismissed.", back);
}
