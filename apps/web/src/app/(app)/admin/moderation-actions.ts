"use server";

import { fineActionSchema, incidentResolveSchema } from "@borrowbuddy/shared";
import { adminReturnPath, finishAdminAction } from "@/lib/admin-actions";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export async function resolveIncident(formData: FormData): Promise<void> {
  await requireAdmin();
  const back = adminReturnPath(formData, "/admin/incidents");
  const fineAmountRaw = String(formData.get("fine_amount") ?? "").trim();

  const parsed = incidentResolveSchema.safeParse({
    incident_id: formData.get("incident_id"),
    decision: formData.get("decision"),
    resolution_note: formData.get("resolution_note"),
    fine_amount: fineAmountRaw && Number(fineAmountRaw) > 0 ? Number(fineAmountRaw) : undefined,
    fine_user_id: formData.get("fine_user_id") || undefined,
  });
  if (!parsed.success) {
    return finishAdminAction({ message: parsed.error.issues[0]?.message ?? "Check the form." }, "", back);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_incident", {
    p_incident_id: parsed.data.incident_id,
    p_decision: parsed.data.decision,
    p_resolution_note: parsed.data.resolution_note,
    p_fine_amount: parsed.data.fine_amount ?? null,
    p_fine_user_id: parsed.data.fine_amount ? (parsed.data.fine_user_id ?? null) : null,
  });

  const fined = parsed.data.fine_amount ? " A fine was issued." : "";
  return finishAdminAction(
    error,
    parsed.data.decision === "resolved" ? `Incident resolved.${fined}` : `Incident rejected.${fined}`,
    back,
    ["/fines"],
  );
}

export async function actOnFine(formData: FormData): Promise<void> {
  await requireAdmin();
  const back = adminReturnPath(formData, "/admin/fines");

  const parsed = fineActionSchema.safeParse({
    fine_id: formData.get("fine_id"),
    action: formData.get("action"),
  });
  if (!parsed.success) {
    return finishAdminAction({ message: "Missing fine details." }, "", back);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("settle_fine", {
    p_fine_id: parsed.data.fine_id,
    p_action: parsed.data.action,
  });

  return finishAdminAction(
    error,
    parsed.data.action === "settle" ? "Fine marked as paid." : "Fine waived.",
    back,
    ["/fines"],
  );
}
