"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireVerified } from "@/lib/auth/guards";
import { flash } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function groupId(formData: FormData): string {
  const id = String(formData.get("group_id") ?? "");
  if (!uuid.test(id)) redirect("/chat");
  return id;
}

export async function joinGroup(formData: FormData): Promise<void> {
  await requireVerified();
  const id = groupId(formData);
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_group", { p_group_id: id });
  await flash(error ? error.message : "You joined the group.", error ? "error" : "success");
  revalidatePath("/chat", "layout");
  redirect(`/chat/${id}`);
}

/** Mute or unmute a chat for yourself: no unread count, no mention notifications. */
export async function setMuted(formData: FormData): Promise<void> {
  await requireVerified();
  const id = String(formData.get("conversation_id") ?? "");
  if (!uuid.test(id)) redirect("/chat");
  const muted = formData.get("muted") === "true";
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_conversation_muted", { p_conversation_id: id, p_muted: muted });
  await flash(error ? error.message : muted ? "Chat muted." : "Chat unmuted.", error ? "error" : "success");
  revalidatePath("/chat", "layout");
  redirect(`/chat/${id}`);
}

export async function leaveGroup(formData: FormData): Promise<void> {
  await requireVerified();
  const id = groupId(formData);
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_group", { p_group_id: id });
  await flash(error ? error.message : "You left the group.", error ? "error" : "success");
  revalidatePath("/chat", "layout");
  redirect(error ? `/chat/${id}` : "/chat");
}
