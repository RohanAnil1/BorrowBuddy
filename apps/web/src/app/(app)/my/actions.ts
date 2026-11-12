"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireVerified } from "@/lib/auth/guards";
import { flash } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";

export async function approveRequest(formData: FormData): Promise<void> {
  await requireVerified();
  const requestId = String(formData.get("request_id") ?? "");
  if (!requestId) return;

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_request", { p_request_id: requestId });

  if (error) {
    redirect(`/my/items?error=${encodeURIComponent(error.message)}`);
  }

  await flash("Approved. The loan and its chat are ready.");
  revalidatePath("/my/items");
  revalidatePath("/my/borrows");
  revalidatePath("/home");
}

export async function declineRequest(formData: FormData): Promise<void> {
  await requireVerified();
  const requestId = String(formData.get("request_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!requestId) return;

  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_request", {
    p_request_id: requestId,
    p_reason: reason || null,
  });

  if (error) {
    redirect(`/my/items?error=${encodeURIComponent(error.message)}`);
  }

  await flash("Request declined.");
  revalidatePath("/my/items");
  revalidatePath("/my/borrows");
}

export async function cancelRequest(formData: FormData): Promise<void> {
  await requireVerified();
  const requestId = String(formData.get("request_id") ?? "");
  if (!requestId) return;

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_request", { p_request_id: requestId });

  // My borrows has no error banner, so the result comes back as a toast.
  if (error) {
    await flash(error.message, "error");
    return;
  }

  await flash("Request cancelled.");
  revalidatePath("/my/borrows");
  revalidatePath("/my/items");
}

export async function cancelLoan(formData: FormData): Promise<void> {
  await requireVerified();
  const loanId = String(formData.get("loan_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!loanId) return;

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_loan", {
    p_loan_id: loanId,
    p_reason: reason || null,
  });

  if (error) {
    await flash(error.message, "error");
    return;
  }

  await flash("Loan cancelled. The other person has been told.");
  revalidatePath(`/loans/${loanId}`);
  revalidatePath("/my/borrows");
  revalidatePath("/my/items");
}

export async function leaveWaitlist(formData: FormData): Promise<void> {
  await requireVerified();
  const entryId = String(formData.get("entry_id") ?? "");
  if (!entryId) return;

  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_waitlist", { p_entry_id: entryId });

  if (error) {
    await flash(error.message, "error");
    return;
  }

  await flash("You left the waitlist.");
  revalidatePath("/my/borrows");
}
