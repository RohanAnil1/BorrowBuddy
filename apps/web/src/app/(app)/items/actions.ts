"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { borrowRequestSchema, itemSchema, waitlistJoinSchema } from "@borrowbuddy/shared";
import type { ActionState } from "@/lib/action-state";
import { requireVerified } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

function parseItemForm(formData: FormData) {
  let imagePaths: unknown = [];
  try {
    imagePaths = JSON.parse(String(formData.get("image_paths") ?? "[]"));
  } catch {
    imagePaths = [];
  }

  return itemSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    category_id: formData.get("category_id"),
    condition: formData.get("condition"),
    deposit_amount: Number(formData.get("deposit_amount") ?? 0),
    max_loan_days: Number(formData.get("max_loan_days") ?? 14),
    pickup_location_id: formData.get("pickup_location_id") || null,
    image_paths: imagePaths,
  });
}

export async function createItem(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await requireVerified();
  const parsed = parseItemForm(formData);

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const { image_paths, ...rest } = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("items")
    .insert({ owner_id: profile.id, ...rest, images: image_paths, status: "available" })
    .select("id")
    .single();

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/home");
  revalidatePath("/my/items");
  redirect(`/items/${(data as { id: string }).id}`);
}

export async function updateItem(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await requireVerified();
  const itemId = String(formData.get("item_id") ?? "");
  if (!itemId) return { status: "error", message: "Missing item." };

  const parsed = parseItemForm(formData);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const { image_paths, ...rest } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase
    .from("items")
    .update({ ...rest, images: image_paths })
    .eq("id", itemId)
    .eq("owner_id", profile.id);

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/home");
  revalidatePath("/my/items");
  revalidatePath(`/items/${itemId}`);
  redirect(`/items/${itemId}`);
}

export async function setItemStatus(formData: FormData): Promise<void> {
  const profile = await requireVerified();
  const itemId = String(formData.get("item_id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!itemId || !["available", "paused", "retired"].includes(status)) return;

  const supabase = await createClient();
  await supabase
    .from("items")
    .update({ status })
    .eq("id", itemId)
    .eq("owner_id", profile.id);

  revalidatePath("/my/items");
  revalidatePath(`/items/${itemId}`);
  revalidatePath("/home");
}

export async function deleteItem(formData: FormData): Promise<void> {
  const profile = await requireVerified();
  const itemId = String(formData.get("item_id") ?? "");
  if (!itemId) return;

  const supabase = await createClient();
  await supabase.from("items").delete().eq("id", itemId).eq("owner_id", profile.id);

  revalidatePath("/my/items");
  redirect("/my/items");
}

export async function createBorrowRequest(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await requireVerified();

  const parsed = borrowRequestSchema.safeParse({
    item_id: formData.get("item_id"),
    start_date: formData.get("start_date"),
    end_date: formData.get("end_date"),
    message: formData.get("message") || undefined,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Pick a valid date range.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("borrow_requests").insert({
    item_id: parsed.data.item_id,
    borrower_id: profile.id,
    start_date: parsed.data.start_date,
    end_date: parsed.data.end_date,
    message: parsed.data.message ?? null,
  });

  if (error) {
    if (error.code === "23505") {
      return { status: "error", message: "You already have a pending request for this item." };
    }
    return { status: "error", message: error.message };
  }

  revalidatePath(`/items/${parsed.data.item_id}`);
  revalidatePath("/my/borrows");

  return {
    status: "success",
    message: "The owner has 48 hours to respond. You'll get a notification either way.",
  };
}

export async function joinWaitlist(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireVerified();

  const parsed = waitlistJoinSchema.safeParse({
    item_id: formData.get("item_id"),
    start_date: formData.get("start_date"),
    end_date: formData.get("end_date"),
  });

  if (!parsed.success) {
    return { status: "error", message: "Pick your dates first." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("join_waitlist", {
    p_item_id: parsed.data.item_id,
    p_start: parsed.data.start_date,
    p_end: parsed.data.end_date,
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath(`/items/${parsed.data.item_id}`);
  return { status: "success", message: "You're on the waitlist." };
}
