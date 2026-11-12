"use client";

import { ArrowDown, Check, Copy, Search, Send, X } from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Message } from "@borrowbuddy/shared";
import { createClient } from "@/lib/supabase/client";
import type { ThreadMessage } from "@/lib/data/chat";
import { cn } from "@/lib/utils";

const messageFields = "*, sender:profiles!messages_sender_id_fkey(id, full_name, avatar_path)";
const dayFormat = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });

function mergeMessages(current: ThreadMessage[], incoming: ThreadMessage[]) {
  const known = new Set(current.map((message) => message.id));
  const added = incoming.filter((message) => !known.has(message.id));
  if (!added.length) return current;
  return [...current, ...added].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id),
  );
}

export function MessageThread({
  conversationId,
  currentUserId,
  initialMessages,
  isCommunity,
  identity,
  loanContext,
}: {
  conversationId: string;
  currentUserId: string;
  initialMessages: ThreadMessage[];
  isCommunity: boolean;
  identity: ReactNode;
  loanContext?: ReactNode;
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showLatest, setShowLatest] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(initialMessages.length >= 100);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const following = useRef(true);
  const sendingRef = useRef(false);
  const draftRef = useRef("");
  const anchor = useRef<{ top: number; height: number } | null>(null);
  const draftKey = `borrowbuddy.chat.draft.${currentUserId}.${conversationId}`;
  const term = query.trim().toLowerCase();
  const visibleMessages = term ? messages.filter((message) =>
    `${message.body} ${message.sender?.full_name ?? ""}`.toLowerCase().includes(term)) : messages;

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = sessionStorage.getItem(draftKey)?.slice(0, 2000);
        if (saved && !draftRef.current) {
          draftRef.current = saved;
          setDraft(saved);
        }
      } catch { /* The draft still works without browser storage. */ }
    });
    return () => cancelAnimationFrame(frame);
  }, [draftKey]);

  function updateDraft(value: string) {
    draftRef.current = value;
    setDraft(value);
    try {
      if (value) sessionStorage.setItem(draftKey, value);
      else sessionStorage.removeItem(draftKey);
    } catch { /* Keep the current draft in memory. */ }
  }

  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    let syncing = false;
    let readThrough = 0;

    function markRead() {
      if (!disposed && document.visibilityState === "visible") {
        void supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
      }
    }

    async function sync() {
      if (disposed || syncing || document.visibilityState !== "visible") return;
      syncing = true;
      try {
        const { data, error } = await supabase
          .from("messages")
          .select(messageFields)
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(50);
        if (disposed || error || !data?.length) return;
        setMessages((current) => mergeMessages(current, data as ThreadMessage[]));
        const newest = Date.parse(data[0].created_at);
        if (newest > readThrough && document.visibilityState === "visible") {
          readThrough = newest;
          markRead();
        }
      } catch {
        // The next foreground sweep retries after a connection failure.
      } finally {
        syncing = false;
      }
    }

    markRead();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("online", sync);
    const timer = window.setInterval(sync, 10000);

    const channel = supabase
      .channel(`conversation-${conversationId}-${crypto.randomUUID()}`)
      .on("system", {}, (payload) => {
        if (payload.extension === "postgres_changes" && payload.status === "ok") {
          void sync();
        }
      })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          if (disposed) return;
          const row = payload.new as Message;
          const { data: sender } = await supabase
            .from("profiles")
            .select("id, full_name, avatar_path")
            .eq("id", row.sender_id)
            .maybeSingle();

          if (disposed) return;
          setMessages((current) => mergeMessages(current, [{ ...row, sender }]));

          if (document.visibilityState === "visible") {
            readThrough = Math.max(readThrough, Date.parse(row.created_at));
            markRead();
          }
        },
      );

    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (disposed || !data.session) return;
        await supabase.realtime.setAuth(data.session.access_token);
        if (disposed) return;
        channel.subscribe((status) => {
          if (disposed) return;
          setLive(status === "SUBSCRIBED");
          if (status === "SUBSCRIBED") void sync();
        });
      } catch {
        void sync();
      }
    })();

    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("online", sync);
      void supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (anchor.current) {
      list.scrollTop = anchor.current.top + list.scrollHeight - anchor.current.height;
      anchor.current = null;
    } else if (following.current && !term) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages, term]);

  function jumpToLatest() {
    following.current = true;
    setShowLatest(false);
    setQuery("");
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }

  async function loadOlder() {
    const first = messages[0];
    if (loadingOlder || !first) return;
    setLoadingOlder(true);
    setError(null);
    try {
      const { data, error: failure } = await createClient().from("messages")
        .select(messageFields).eq("conversation_id", conversationId)
        .or(`created_at.lt.${first.created_at},and(created_at.eq.${first.created_at},id.lt.${first.id})`)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100);
      if (failure) throw failure;
      if (data.length) {
        const list = listRef.current;
        if (list && !term) anchor.current = { top: list.scrollTop, height: list.scrollHeight };
        following.current = false;
        setMessages((current) => mergeMessages(current, data as ThreadMessage[]));
      }
      setHasOlder(data.length === 100);
    } catch {
      setError("Couldn’t load earlier messages. Try again.");
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send() {
    const original = draftRef.current;
    const body = original.trim();
    if (!body || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      const { data, error: failure } = await createClient().from("messages")
        .insert({ conversation_id: conversationId, sender_id: currentUserId, body })
        .select(messageFields).single();
      if (failure) throw failure;
      if (draftRef.current === original) updateDraft("");
      jumpToLatest();
      setMessages((current) => mergeMessages(current, [data as ThreadMessage]));
    } catch {
      setError("Couldn’t send the message. Your draft is still here.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function copyMessage(message: ThreadMessage) {
    try {
      await navigator.clipboard.writeText(message.body);
      setCopiedId(message.id);
    } catch { setError("Clipboard unavailable. You can select and copy the message."); }
  }

  function closeSearch() {
    setSearchOpen(false);
    jumpToLatest();
    searchButtonRef.current?.focus();
  }

  return (
    <div className="chat-thread-shell">
      <header className="chat-thread-header">
        {identity}
        <button type="button" ref={searchButtonRef} className="chat-icon-button" aria-label="Find messages" title="Find messages" aria-expanded={searchOpen} onClick={() => {
          if (searchOpen) closeSearch();
          else setSearchOpen(true);
        }}><Search size={19} aria-hidden="true" /></button>
      </header>
      {loanContext}
      {!live && <p className="chat-connection" role="status">Connecting to chat…</p>}
      {searchOpen && (
        <div className="chat-thread-search">
          <label className="chat-search">
            <Search size={16} aria-hidden="true" />
            <input type="search" aria-label="Search loaded messages" placeholder="Search loaded messages" value={query}
              autoFocus
              onChange={(event) => { setQuery(event.target.value); if (listRef.current) listRef.current.scrollTop = 0; }}
              onKeyDown={(event) => { if (event.key === "Escape") closeSearch(); }} />
          </label>
          <button className="chat-icon-button" type="button" aria-label="Close message search" onClick={closeSearch}><X size={17} /></button>
          {term && <p aria-live="polite">{visibleMessages.length} {visibleMessages.length === 1 ? "match" : "matches"} in loaded messages</p>}
        </div>
      )}
      <div className="chat-history-wrap">
        <div className="chat-history" ref={listRef} role="region" aria-label="Messages" tabIndex={0} onScroll={(event) => {
          if (term) return;
          const list = event.currentTarget;
          const atBottom = list.scrollHeight - list.clientHeight - list.scrollTop < 80;
          following.current = atBottom;
          setShowLatest(!atBottom);
        }}>
          {hasOlder && <button type="button" className="chat-older chat-text-button" disabled={loadingOlder} onClick={() => void loadOlder()}>
            {loadingOlder ? "Loading earlier messages…" : "Load older messages"}
          </button>}
          {!messages.length && (
            <div className="chat-empty" data-testid="chat-empty-thread">
              <strong>{isCommunity ? "Start the conversation" : "Plan your handover"}</strong>
              <p>{isCommunity ? "Every verified student can read and post here." : "Agree on a pickup spot and time with your loan partner."}</p>
            </div>
          )}
          {term && !visibleMessages.length && <div className="chat-empty"><strong>No matching messages</strong><p>Try another term or load earlier messages.</p></div>}
          {visibleMessages.map((message, index) => {
            const mine = message.sender_id === currentUserId;
            const date = new Date(message.created_at);
            const day = dayFormat.format(date);
            const previous = visibleMessages[index - 1];
            const next = visibleMessages[index + 1];
            const startsDay = !previous || dayFormat.format(new Date(previous.created_at)) !== day;
            const startsGroup = startsDay || previous.sender_id !== message.sender_id ||
              Date.parse(message.created_at) - Date.parse(previous.created_at) > 5 * 60_000;
            const endsGroup = !next || next.sender_id !== message.sender_id ||
              dayFormat.format(new Date(next.created_at)) !== day ||
              Date.parse(next.created_at) - Date.parse(message.created_at) > 5 * 60_000;
            return (
              <Fragment key={message.id}>
                {startsDay && <div className="chat-day font-secondary"><time dateTime={message.created_at}>{day}</time></div>}
                <div className={cn("chat-message", mine && "chat-message-own", startsGroup && "chat-message-group")} data-message-id={message.id} data-own={mine}>
                  {!mine && startsGroup && <span className="chat-sender">{message.sender?.full_name ?? "Campus member"}</span>}
                  <div className="chat-message-body">
                    <div className="chat-bubble">{message.body}</div>
                    <button type="button" className="chat-copy" onClick={() => void copyMessage(message)}
                      title={copiedId === message.id ? "Copied" : "Copy message"}
                      aria-label={copiedId === message.id ? "Copied" : "Copy message"}>
                      {copiedId === message.id ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                    </button>
                  </div>
                  {endsGroup && <time className="chat-message-time" dateTime={message.created_at}>{timeFormat.format(date)}</time>}
                </div>
              </Fragment>
            );
          })}
        </div>
        {!term && showLatest && <button type="button" className="chat-jump" onClick={jumpToLatest}><ArrowDown size={14} /> Latest messages</button>}
      </div>

      <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
        {error && <p className="chat-error" role="alert">{error}</p>}
        <div className="chat-compose-row">
          <textarea
            aria-label="Write a message"
            maxLength={2000}
            ref={inputRef}
            onChange={(event) => updateDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder="Write a message…"
            rows={1}
            value={draft}
          />
          <button aria-label="Send message" className="chat-send" disabled={sending || !draft.trim()} type="submit">
            <Send size={18} aria-hidden="true" />
          </button>
        </div>
        {!isCommunity && !draft && <div className="chat-quick-replies" aria-label="Suggested replies">
          {[
            ["Plan pickup", "When and where works for pickup?"],
            ["Plan return", "When and where works for the return?"],
          ].map(([label, value]) => (
            <button key={label} type="button" onClick={() => { updateDraft(value); inputRef.current?.focus(); }}>{label}</button>
          ))}
        </div>}
        {draft.length >= 1800 && <p className="chat-composer-meta">{draft.length} / 2000</p>}
      </form>
    </div>
  );
}
