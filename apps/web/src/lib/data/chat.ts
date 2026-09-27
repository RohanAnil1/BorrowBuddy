import type { Conversation, ConversationMember, Message, Profile } from "@borrowbuddy/shared";
import { createClient } from "@/lib/supabase/server";

export type ConversationSummary = {
  id: string;
  type: "private" | "community";
  title: string;
  subtitle: string | null;
  loanId: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: boolean;
};

export type ThreadMessage = Message & {
  sender: Pick<Profile, "id" | "full_name" | "avatar_path"> | null;
};

export async function getConversations(userId: string): Promise<ConversationSummary[]> {
  const supabase = await createClient();

  const [memberships, community] = await Promise.all([
    supabase
      .from("conversation_members")
      .select("conversation_id, last_read_at, conversation:conversations(id, type, title, loan_id)")
      .eq("user_id", userId),
    supabase.from("conversations").select("id, type, title, loan_id").eq("type", "community"),
  ]);

  const entries = new Map<
    string,
    { conversation: Pick<Conversation, "id" | "type" | "title" | "loan_id">; lastReadAt: string | null }
  >();

  for (const row of (memberships.data as unknown as {
    conversation: Pick<Conversation, "id" | "type" | "title" | "loan_id"> | null;
    last_read_at: string | null;
  }[] | null) ?? []) {
    if (row.conversation) {
      entries.set(row.conversation.id, {
        conversation: row.conversation,
        lastReadAt: row.last_read_at,
      });
    }
  }

  for (const row of (community.data as Pick<Conversation, "id" | "type" | "title" | "loan_id">[] | null) ?? []) {
    if (!entries.has(row.id)) {
      entries.set(row.id, { conversation: row, lastReadAt: null });
    }
  }

  if (entries.size === 0) return [];

  const ids = [...entries.keys()];

  const [recentMessages, memberRows] = await Promise.all([
    supabase
      .from("messages")
      .select("conversation_id, body, created_at, sender_id")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("conversation_members")
      .select("conversation_id, user_id, profile:profiles(id, full_name, avatar_path)")
      .in("conversation_id", ids),
  ]);

  const lastByConversation = new Map<string, { body: string; at: string }>();
  for (const message of (recentMessages.data as {
    conversation_id: string;
    body: string;
    created_at: string;
  }[] | null) ?? []) {
    if (!lastByConversation.has(message.conversation_id)) {
      lastByConversation.set(message.conversation_id, {
        body: message.body,
        at: message.created_at,
      });
    }
  }

  const counterpartByConversation = new Map<string, { id: string; full_name: string }>();
  for (const row of (memberRows.data as unknown as {
    conversation_id: string;
    user_id: string;
    profile: { id: string; full_name: string } | null;
  }[] | null) ?? []) {
    if (row.user_id !== userId && row.profile) {
      counterpartByConversation.set(row.conversation_id, row.profile);
    }
  }

  return ids
    .map((id) => {
      const entry = entries.get(id)!;
      const last = lastByConversation.get(id);
      const counterpart = counterpartByConversation.get(id);
      const isCommunity = entry.conversation.type === "community";

      return {
        id,
        type: entry.conversation.type,
        title: isCommunity
          ? entry.conversation.title ?? "Community"
          : counterpart?.full_name ?? "Loan chat",
        subtitle: isCommunity ? "Everyone on campus" : "Private loan chat",
        loanId: entry.conversation.loan_id,
        lastMessage: last?.body ?? null,
        lastMessageAt: last?.at ?? null,
        unread: Boolean(last && (!entry.lastReadAt || last.at > entry.lastReadAt)),
      } satisfies ConversationSummary;
    })
    .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
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
    .select("*, sender:profiles!messages_sender_id_fkey(id, full_name, avatar_path)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);

  return (data as ThreadMessage[] | null) ?? [];
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

export async function getUnreadMessageCount(userId: string): Promise<number> {
  const conversations = await getConversations(userId);
  return conversations.filter((conversation) => conversation.unread).length;
}

export type { ConversationMember };
