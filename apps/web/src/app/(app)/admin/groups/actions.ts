"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { GROUP_DESCRIPTION_MAX, GROUP_TITLE_MAX } from "@borrowbuddy/shared";
import { requireAdmin } from "@/lib/auth/guards";
import { flash } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readId(formData: FormData, key: string, back: string): string {
  const id = String(formData.get(key) ?? "");
  if (!uuid.test(id)) redirect(back);
  return id;
}

function readSettings(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const visibility = formData.get("visibility") === "invite" ? "invite" : "open";
  const posting = formData.get("posting") === "admins" ? "admins" : "everyone";
  if (!title || title.length > GROUP_TITLE_MAX) return { error: `Give the group a name of up to ${GROUP_TITLE_MAX} characters.` } as const;
  if (description.length > GROUP_DESCRIPTION_MAX) return { error: `Keep the description under ${GROUP_DESCRIPTION_MAX} characters.` } as const;
  return { title, description: description || null, visibility, posting } as const;
}

async function finish(error: { message: string } | null, success: string, path: string) {
  await flash(error ? error.message : success, error ? "error" : "success");
  revalidatePath("/admin/groups", "layout");
  revalidatePath("/chat", "layout");
  redirect(path);
}

export async function createGroup(formData: FormData): Promise<void> {
  await requireAdmin();
  const settings = readSettings(formData);
  if ("error" in settings) return finish({ message: settings.error! }, "", "/admin/groups");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_create_group", {
    p_title: settings.title,
    p_description: settings.description,
    p_visibility: settings.visibility,
    p_posting: settings.posting,
  });
  await finish(error, `Created ${settings.title}.`, error ? "/admin/groups" : `/admin/groups/${data as string}`);
}

export async function updateGroup(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = readId(formData, "group_id", "/admin/groups");
  const settings = readSettings(formData);
  if ("error" in settings) return finish({ message: settings.error! }, "", `/admin/groups/${id}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_group", {
    p_group_id: id,
    p_title: settings.title,
    p_description: settings.description,
    p_visibility: settings.visibility,
    p_archived: formData.get("archived") === "on",
    p_posting: settings.posting,
  });
  await finish(error, "Group saved.", `/admin/groups/${id}`);
}

export async function deleteGroup(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = readId(formData, "group_id", "/admin/groups");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_group", { p_group_id: id });
  await finish(error, "Group deleted.", error ? `/admin/groups/${id}` : "/admin/groups");
}

export async function unpinGroupMessage(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = readId(formData, "group_id", "/admin/groups");
  const messageId = readId(formData, "message_id", `/admin/groups/${id}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("pin_message", { p_message_id: messageId, p_pinned: false });
  await finish(error, "Message unpinned.", `/admin/groups/${id}`);
}

export async function addGroupMember(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = readId(formData, "group_id", "/admin/groups");
  const userId = readId(formData, "user_id", `/admin/groups/${id}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_add_group_member", { p_group_id: id, p_user_id: userId });
  await finish(error, "Member added.", `/admin/groups/${id}`);
}

export async function removeGroupMember(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = readId(formData, "group_id", "/admin/groups");
  const userId = readId(formData, "user_id", `/admin/groups/${id}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_remove_group_member", { p_group_id: id, p_user_id: userId });
  await finish(error, "Member removed.", `/admin/groups/${id}`);
}
