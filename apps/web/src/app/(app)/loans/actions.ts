"use server";

import { revalidatePath } from "next/cache";
import { handoverConfirmSchema, handoverTokenSchema } from "@borrowbuddy/shared";
import type { ActionState } from "@/lib/action-state";
import { requireVerified } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export async function generateHandoverToken(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireVerified();

  const loanId = String(formData.get("loan_id") ?? "");
  const kind = String(formData.get("kind") ?? "");

  if (!loanId || (kind !== "pickup" && kind !== "return")) {
    return { status: "error", message: "Missing handover details." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_handover_token", {
    p_loan_id: loanId,
    p_kind: kind,
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "success", message: String(data) };
}

export async function confirmHandover(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireVerified();

  const parsed = handoverConfirmSchema.safeParse({
    loan_id: formData.get("loan_id"),
    token: formData.get("token"),
    kind: formData.get("kind"),
  });

  if (!parsed.success) {
    return { status: "error", message: "Enter the 6-digit code." };
  }

  const token = handoverTokenSchema.safeParse(parsed.data.token);
  if (!token.success) {
    return { status: "error", message: "Codes are exactly 6 digits." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_handover", {
    p_loan_id: parsed.data.loan_id,
    p_token: token.data,
    p_kind: parsed.data.kind,
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath(`/loans/${parsed.data.loan_id}`);
  revalidatePath("/my/borrows");
  revalidatePath("/my/items");

  return {
    status: "success",
    message:
      parsed.data.kind === "pickup"
        ? "Pickup confirmed. The item is now on loan."
        : "Return confirmed. Leave a rating for the other student.",
  };
}
