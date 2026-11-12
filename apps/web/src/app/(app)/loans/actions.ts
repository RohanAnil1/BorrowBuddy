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
  const { data, error } = await supabase.rpc("confirm_handover_v2", {
    p_loan_id: parsed.data.loan_id,
    p_token: token.data,
    p_kind: parsed.data.kind,
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  const result = data as { ok?: boolean; error?: string } | null;
  if (result?.ok !== true) {
    return { status: "error", message: result?.error ?? "Unable to confirm this code." };
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

const UUID = /^[0-9a-f-]{36}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function friendly(message: string) {
  // RPC errors are written for students; anything else gets a generic line.
  return message.length < 160 && !/violates|syntax|function|relation/i.test(message)
    ? message
    : "Something went wrong. Try again in a moment.";
}

export async function requestExtension(_previous: ActionState, formData: FormData): Promise<ActionState> {
  await requireVerified();
  const loanId = String(formData.get("loan_id") ?? "");
  const newDue = String(formData.get("new_due_date") ?? "");
  const message = String(formData.get("message") ?? "").trim().slice(0, 300);
  if (!UUID.test(loanId) || !ISO_DATE.test(newDue)) {
    return { status: "error", message: "Pick a new return date." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_loan_extension", {
    p_loan_id: loanId,
    p_new_due_date: newDue,
    p_message: message || null,
  });
  if (error) return { status: "error", message: friendly(error.message) };

  revalidatePath(`/loans/${loanId}`);
  revalidatePath("/dashboard");
  return { status: "success", message: "Request sent. You'll get a notification when they answer." };
}

export async function respondExtension(_previous: ActionState, formData: FormData): Promise<ActionState> {
  await requireVerified();
  const extensionId = String(formData.get("extension_id") ?? "");
  const loanId = String(formData.get("loan_id") ?? "");
  const approve = formData.get("decision") === "approve";
  if (!UUID.test(extensionId) || !UUID.test(loanId)) return { status: "error", message: "That request is no longer valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_loan_extension", { p_extension_id: extensionId, p_approve: approve });
  if (error) return { status: "error", message: friendly(error.message) };

  revalidatePath(`/loans/${loanId}`);
  revalidatePath("/dashboard");
  revalidatePath("/my/items");
  return { status: "success", message: approve ? "Approved. The new due date is set." : "Declined. The due date stays the same." };
}

export async function cancelExtension(_previous: ActionState, formData: FormData): Promise<ActionState> {
  await requireVerified();
  const extensionId = String(formData.get("extension_id") ?? "");
  const loanId = String(formData.get("loan_id") ?? "");
  if (!UUID.test(extensionId) || !UUID.test(loanId)) return { status: "error", message: "That request is no longer valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_loan_extension", { p_extension_id: extensionId });
  if (error) return { status: "error", message: friendly(error.message) };

  revalidatePath(`/loans/${loanId}`);
  revalidatePath("/dashboard");
  return { status: "success", message: "Request withdrawn." };
}
