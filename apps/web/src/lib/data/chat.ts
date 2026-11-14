import type { Conversation, ConversationMember, GroupPosting, GroupVisibility, Message, Profile } from "@borrowbuddy/shared";
import { createClient } from "@/lib/supabase/server";

export type ConversationSummary = {
  id: string;
  type: "private" | "community";
  title: string;
  subtitle: string | null;
  loanId: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  /** Others' messages after your read cursor, capped at 100 by the database. */
  unreadCount: number;
  unread: boolean;
  /** Always true for loan chats; false for an open group you haven't joined. */
  isMember: boolean;
  memberCount: number | null;
  visibility: GroupVisibility;
  archived: boolean;
  /** Muted chats show no unread count and send no mention notifications. */
  muted: boolean;
  posting: GroupPosting;
};

export type ThreadMessage = Message & {
  sender: Pick<Profile, "id" | "full_name" | "avatar_path"> | null;
};

export type GroupMember = {
  user_id: string;
  full_name: string;
  avatar_path: string | null;
  is_admin: boolean;
  joined_at: string;
};

export type AdminGroup = {
  id: string;
  title: string;
  description: string | null;
  visibility: GroupVisibility;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  member_count: number;
  message_count: number;
  last_message_at: string | null;
  posting: GroupPosting;
  pinned_count: number;
};

export type PinnedMessage = Pick<Message, "id" | "body" | "sender_id" | "pinned_at" | "image_path" | "poll"> & {
  sender: Pick<Profile, "full_name"> | null;
};

type InboxRow = {
  conversation_id: string;
  type: "private" | "community";
  title: string | null;
  description: string | null;
  visibility: GroupVisibility;
  archived_at: string | null;
  loan_id: string | null;
  created_at: string;
  is_member: boolean;
  member_count: number | null;
  unread_count: number;
  last_message_body: string | null;
  last_message_sender_id: string | null;
  last_message_sender_name: string | null;
  last_message_at: string | null;
  last_message_deleted: boolean | null;
  last_message_has_image: boolean | null;
  counterpart_name: string | null;
  muted: boolean | null;
  posting: GroupPosting | null;
};

export const MESSAGE_FIELDS = "*, sender:profiles!messages_sender_id_fkey(id, full_name, avatar_path)";

function preview(row: InboxRow, userId: string): string | null {
  if (!row.last_message_at) return null;
  const text = row.last_message_deleted ? "Message deleted"
    : row.last_message_body || (row.last_message_has_image ? "Photo" : "Message");
  if (row.type !== "community") return text;
  const who = row.last_message_sender_id === userId ? "You" : row.last_message_sender_name?.split(" ")[0];
  return who ? `${who}: ${text}` : text;
}

/** "Public" (anyone verified can find and join) or "Private" (invite-only, hidden). */
export function groupKindLabel(visibility: GroupVisibility) {
  return visibility === "invite" ? "Private" : "Public";
}

function groupSubtitle(row: { visibility: GroupVisibility; member_count: number | null; archived_at: string | null; posting?: GroupPosting | null }) {
  const members = row.member_count === null ? null : `${row.member_count} ${row.member_count === 1 ? "member" : "members"}`;
  const kind = `${row.archived_at ? "Archived " : ""}${groupKindLabel(row.visibility).toLowerCase()} group`;
  const label = kind.charAt(0).toUpperCase() + kind.slice(1);
  return [label, row.posting === "admins" ? "Announcements" : null, members].filter(Boolean).join(" · ");
}

export async function getConversations(userId: string): Promise<ConversationSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_chat_inbox");
  return ((data as InboxRow[] | null) ?? []).map((row) => {
    const community = row.type === "community";
    return {
      id: row.conversation_id,
      type: row.type,
      title: community ? row.title ?? "Group" : row.counterpart_name ?? "Loan chat",
      subtitle: community ? groupSubtitle(row) : "Private loan chat",
      loanId: row.loan_id,
      lastMessage: preview(row, userId),
      lastMessageAt: row.last_message_at,
      unreadCount: row.unread_count,
      unread: row.unread_count > 0,
      isMember: row.is_member,
      memberCount: row.member_count,
      visibility: row.visibility,
      archived: Boolean(row.archived_at),
      muted: Boolean(row.muted),
      posting: row.posting ?? "everyone",
    } satisfies ConversationSummary;
  });
}

export async function getConversation(conversationId: string): Promise<Conversation | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();
  return (data as Conversation | null) ?? null;
}

export async function getLoanConversationId(loanId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversations")
    .select("id")
    .eq("loan_id", loanId)
    .eq("type", "private")
    .maybeSingle();

  return (data as { id: string } | null)?.id ?? null;
}

export async function getThreadMessages(conversationId: string, limit = 100): Promise<ThreadMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select(MESSAGE_FIELDS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  return ((data as ThreadMessage[] | null) ?? []).reverse();
}

export async function getConversationCounterpart(
  conversationId: string,
  userId: string,
): Promise<Pick<Profile, "id" | "full_name" | "avatar_path" | "trust_score"> | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversation_members")
    .select("user_id, profile:profiles(id, full_name, avatar_path, trust_score)")
    .eq("conversation_id", conversationId)
    .neq("user_id", userId)
    .maybeSingle();

  const row = data as unknown as {
    profile: Pick<Profile, "id" | "full_name" | "avatar_path" | "trust_score"> | null;
  } | null;

  return row?.profile ?? null;
}

/** Pinned messages, newest pin first. */
export async function getPinnedMessages(conversationId: string): Promise<PinnedMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("id, body, sender_id, pinned_at, image_path, poll, sender:profiles!messages_sender_id_fkey(full_name)")
    .eq("conversation_id", conversationId)
    .not("pinned_at", "is", null)
    .order("pinned_at", { ascending: false })
    .limit(20);
  return (data as unknown as PinnedMessage[] | null) ?? [];
}

/** Your own mute setting for a chat. */
export async function isConversationMuted(conversationId: string, userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversation_members")
    .select("muted")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean((data as { muted: boolean } | null)?.muted);
}

/** Group members with public profile fields; refused unless you can read the group. */
export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_group_members", { p_group_id: groupId });
  return (data as GroupMember[] | null) ?? [];
}

export async function isConversationMember(conversationId: string, userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

/** Admin only: every group with member and message counts. */
export async function getAdminGroups(): Promise<AdminGroup[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_groups");
  if (error) throw new Error(error.message);
  return (data as AdminGroup[] | null) ?? [];
}

/** Number of chats with unread messages (not the message total). */
export async function getUnreadMessageCount(userId: string): Promise<number> {
  const conversations = await getConversations(userId);
  return conversations.filter((conversation) => conversation.unread).length;
}

export { groupSubtitle };
export type { ConversationMember };
