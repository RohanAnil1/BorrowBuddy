"use server";

import { revalidatePath } from "next/cache";
import { incidentSchema, reviewSchema } from "@borrowbuddy/shared";
import type { ActionState } from "@/lib/action-state";
import { requireVerified } from "@/lib/auth/guards";
import { getLoan } from "@/lib/data/loans";
import { createClient } from "@/lib/supabase/server";

export async function submitReview(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await requireVerified();

  const parsed = reviewSchema.safeParse({
    loan_id: formData.get("loan_id"),
    rating: Number(formData.get("rating") ?? 0),
    comment: formData.get("comment") || undefined,
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Pick a rating first." };
  }

  const loan = await getLoan(parsed.data.loan_id);
  if (!loan) {
    return { status: "error", message: "Loan not found." };
  }

  const revieweeId = loan.owner_id === profile.id ? loan.borrower_id : loan.owner_id;
  const supabase = await createClient();

  const { error } = await supabase.from("reviews").insert({
    loan_id: parsed.data.loan_id,
    reviewer_id: profile.id,
    reviewee_id: revieweeId,
    role: loan.owner_id === profile.id ? "as_owner" : "as_borrower",
    rating: parsed.data.rating,
    comment: parsed.data.comment ?? null,
  });

  if (error) {
    if (error.code === "23505") {
      return { status: "error", message: "You already reviewed this loan." };
    }
    return { status: "error", message: error.message };
  }

  revalidatePath(`/loans/${parsed.data.loan_id}`);
  revalidatePath(`/users/${revieweeId}`);

  return { status: "success", message: "Thanks. Your rating is on their profile." };
}

export async function openIncident(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireVerified();

  let photoPaths: unknown = [];
  try {
    photoPaths = JSON.parse(String(formData.get("photo_paths") ?? "[]"));
  } catch {
    photoPaths = [];
  }

  const parsed = incidentSchema.safeParse({
    loan_id: formData.get("loan_id"),
    type: formData.get("type"),
    description: formData.get("description"),
    photo_paths: photoPaths,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Describe what happened.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("open_incident", {
    p_loan_id: parsed.data.loan_id,
    p_type: parsed.data.type,
    p_description: parsed.data.description,
    p_photo_paths: parsed.data.photo_paths,
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath(`/loans/${parsed.data.loan_id}`);
  return {
    status: "success",
    message: "Report filed. An admin will review it and both parties can add photos.",
  };
}
