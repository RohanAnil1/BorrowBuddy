"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Message } from "@borrowbuddy/shared";
import { relativeTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { ThreadMessage } from "@/lib/data/chat";
import { cn } from "@/lib/utils";

export function MessageThread({
  conversationId,
  currentUserId,
  initialMessages,
  isCommunity,
}: {
  conversationId: string;
  currentUserId: string;
  initialMessages: ThreadMessage[];
  isCommunity: boolean;
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const supabase = createClient();

    void supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });

    const channel = supabase
      .channel(`conversation-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const row = payload.new as Message;
          const { data: sender } = await supabase
            .from("profiles")
            .select("id, full_name, avatar_path")
            .eq("id", row.sender_id)
            .maybeSingle();

          setMessages((current) =>
            current.some((message) => message.id === row.id)
              ? current
              : [...current, { ...row, sender }],
          );

          void supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);

    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, sender_id: currentUserId, body })
      .select("*, sender:profiles!messages_sender_id_fkey(id, full_name, avatar_path)")
      .single();

    setSending(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    const message = data as ThreadMessage;
    setDraft("");
    setMessages((current) =>
      current.some((entry) => entry.id === message.id) ? current : [...current, message],
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-1 py-4">
        {messages.length === 0 && (
          <p className="type-body py-16 text-center text-[13px] uppercase text-ink/50">
            {isCommunity
              ? "NOBODY HAS SAID ANYTHING YET. START THE CONVERSATION."
              : "SAY HELLO AND AGREE ON A PICKUP SPOT AND TIME."}
          </p>
        )}

        {messages.map((message) => {
          const mine = message.sender_id === currentUserId;
          return (
            <div
              className={cn("flex max-w-[85%] flex-col gap-1", mine ? "self-end items-end" : "self-start")}
              key={message.id}
            >
              {!mine && (
                <span className="px-1 font-secondary text-[9px] uppercase text-ink/50">
                  {(message.sender?.full_name ?? "Someone").toUpperCase()}
                </span>
              )}
              <div
                className={cn(
                  "px-4 py-3 text-[14px] leading-6",
                  mine
                    ? "bg-accent text-white"
                    : "border border-line bg-panel text-ink",
                )}
              >
                {message.body}
              </div>
              <span className="px-1 font-secondary text-[8px] uppercase text-ink/40">
                {relativeTime(message.created_at).toUpperCase()}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 border-t border-line bg-black py-4">
        {error && (
          <p className="mb-2 font-secondary text-[9px] text-warn">[ {error} ]</p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            className="min-h-11 flex-1 resize-none rounded-lg border border-line bg-panel px-4 py-3 text-[14px] outline-none transition-colors placeholder:text-ink/30 focus:border-accent"
            maxLength={2000}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder="Write a message…"
            rows={1}
            value={draft}
          />
          <button
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            disabled={sending || draft.trim().length === 0}
            onClick={() => void send()}
            type="button"
          >
            <Send className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
