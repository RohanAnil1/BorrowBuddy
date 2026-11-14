"use client";

import { ArrowDown, Check, Copy, CornerUpLeft, MoreHorizontal, Pencil, Search, Send, Trash2, X } from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MESSAGE_REACTIONS, type Message } from "@borrowbuddy/shared";
import { createClient } from "@/lib/supabase/client";
import type { ThreadMessage } from "@/lib/data/chat";
import { cn } from "@/lib/utils";

const messageFields = "*, sender:profiles!messages_sender_id_fkey(id, full_name, avatar_path)";
const dayFormat = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });

type SearchHit = { id: string; sender_id: string; sender_name: string | null; body: string; created_at: string };
type QuotedMessage = { id: string; body: string; deleted_at: string | null; sender_id: string; sender: { full_name: string } | null };

/** Adds new rows and replaces edited ones (keeping a known sender), oldest first. */
function mergeMessages(current: ThreadMessage[], incoming: ThreadMessage[]) {
  if (!incoming.length) return current;
  const rows = new Map(current.map((message) => [message.id, message]));
  let changed = false;
  for (const row of incoming) {
    const known = rows.get(row.id);
    if (known && known.edited_at === row.edited_at && known.deleted_at === row.deleted_at &&
        JSON.stringify(known.reactions) === JSON.stringify(row.reactions)) continue;
    rows.set(row.id, { ...row, reactions: row.reactions ?? {}, sender: row.sender ?? known?.sender ?? null });
    changed = true;
  }
  if (!changed) return current;
  return [...rows.values()].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id),
  );
}

function snippet(text: string, length = 90) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}

export function MessageThread({
  conversationId,
  currentUserId,
  initialMessages,
  isCommunity,
  isAdmin = false,
  canPost = true,
  trackRead = true,
  identity,
  loanContext,
  groupInfo,
  closedComposer,
}: {
  conversationId: string;
  currentUserId: string;
  initialMessages: ThreadMessage[];
  isCommunity: boolean;
  isAdmin?: boolean;
  /** False for a group you haven't joined or an archived group. */
  canPost?: boolean;
  /** Only members keep a read cursor. */
  trackRead?: boolean;
  identity: ReactNode;
  loanContext?: ReactNode;
  groupInfo?: ReactNode;
  /** Shown instead of the composer when you can't post. */
  closedComposer?: ReactNode;
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const [quoted, setQuoted] = useState<Record<string, QuotedMessage>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [showLatest, setShowLatest] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ThreadMessage | null>(null);
  const [editing, setEditing] = useState<ThreadMessage | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(initialMessages.length >= 100);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const following = useRef(true);
  const sendingRef = useRef(false);
  const draftRef = useRef("");
  const messagesRef = useRef(initialMessages);
  const requestedQuotes = useRef(new Set<string>());
  /** The unsent new-message draft, put back after an edit. */
  const draftBeforeEdit = useRef("");
  const anchor = useRef<{ top: number; height: number } | null>(null);
  const draftKey = `borrowbuddy.chat.draft.${currentUserId}.${conversationId}`;
  const term = query.trim();
  const byId = new Map(messages.map((message) => [message.id, message]));

  useEffect(() => { messagesRef.current = messages; }, [messages]);

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

  function updateDraft(value: string, persist = true) {
    draftRef.current = value;
    setDraft(value);
    if (!persist) return;
    try {
      if (value) sessionStorage.setItem(draftKey, value);
      else sessionStorage.removeItem(draftKey);
    } catch { /* Keep the current draft in memory. */ }
  }

  // Replies to messages older than the loaded page: fetch just the quoted rows.
  useEffect(() => {
    const loaded = new Set(messages.map((message) => message.id));
    const requested = requestedQuotes.current;
    const missing = [...new Set(messages.flatMap((message) => message.reply_to_id ? [message.reply_to_id] : []))]
      .filter((id) => !loaded.has(id) && !requested.has(id));
    if (!missing.length) return;
    missing.forEach((id) => requested.add(id));
    let cancelled = false;
    let done = false;
    void (async () => {
      const { data } = await createClient().from("messages")
        .select("id, body, deleted_at, sender_id, sender:profiles!messages_sender_id_fkey(full_name)")
        .in("id", missing.slice(0, 50));
      if (cancelled || !data) return;
      done = true;
      setQuoted((current) => {
        const next = { ...current };
        for (const row of data as unknown as QuotedMessage[]) next[row.id] = row;
        return next;
      });
    })();
    return () => {
      cancelled = true;
      if (!done) missing.forEach((id) => requested.delete(id));
    };
  }, [messages]);

  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    let syncing = false;
    let readThrough = 0;

    function markRead() {
      if (!disposed && trackRead && document.visibilityState === "visible") {
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
    const filter = `conversation_id=eq.${conversationId}`;

    const channel = supabase
      .channel(`conversation-${conversationId}-${crypto.randomUUID()}`)
      .on("system", {}, (payload) => {
        if (payload.extension === "postgres_changes" && payload.status === "ok") {
          void sync();
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter }, async (payload) => {
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
      })
      // Edits, deletes and reactions all update the row.
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter }, (payload) => {
        if (disposed) return;
        const row = payload.new as Message;
        setMessages((current) => current.some((message) => message.id === row.id)
          ? mergeMessages(current, [{ ...row, sender: null }])
          : current);
      });

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
  }, [conversationId, trackRead]);

  // Server-side search across the whole chat, not just the loaded page.
  useEffect(() => {
    if (!searchOpen || term.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      const { data, error: failure } = await createClient().rpc("search_conversation_messages", {
        p_conversation_id: conversationId, p_query: term, p_limit: 30,
      });
      if (cancelled) return;
      setSearching(false);
      if (failure) setError("Search isn’t available right now. Try again.");
      else setHits((data as SearchHit[] | null) ?? []);
    }, 280);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [conversationId, searchOpen, term]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (anchor.current) {
      list.scrollTop = anchor.current.top + list.scrollHeight - anchor.current.height;
      anchor.current = null;
    } else if (following.current) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages]);

  function jumpToLatest() {
    following.current = true;
    setShowLatest(false);
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }

  async function fetchOlder(): Promise<ThreadMessage[] | null> {
    const first = messagesRef.current[0];
    if (!first) return null;
    const { data, error: failure } = await createClient().from("messages")
      .select(messageFields).eq("conversation_id", conversationId)
      .or(`created_at.lt.${first.created_at},and(created_at.eq.${first.created_at},id.lt.${first.id})`)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100);
    if (failure) throw failure;
    const rows = data as ThreadMessage[];
    if (rows.length) {
      const list = listRef.current;
      if (list) anchor.current = { top: list.scrollTop, height: list.scrollHeight };
      following.current = false;
      messagesRef.current = mergeMessages(messagesRef.current, rows);
      setMessages(messagesRef.current);
    }
    setHasOlder(rows.length === 100);
    return rows;
  }

  async function loadOlder() {
    if (loadingOlder) return;
    setLoadingOlder(true);
    setError(null);
    try { await fetchOlder(); }
    catch { setError("Couldn’t load earlier messages. Try again."); }
    finally { setLoadingOlder(false); }
  }

  function revealMessage(id: string) {
    following.current = false;
    setHighlight(id);
    requestAnimationFrame(() => {
      listRef.current?.querySelector(`[data-message-id="${id}"]`)?.scrollIntoView({ block: "center" });
    });
    window.setTimeout(() => setHighlight((current) => (current === id ? null : current)), 2400);
  }

  /** Scrolls to a message, loading earlier pages (up to 1,000 messages back) to reach it. */
  async function goToMessage(id: string) {
    setSearchOpen(false);
    setQuery("");
    setHits(null);
    if (messagesRef.current.some((message) => message.id === id)) return revealMessage(id);
    setLoadingOlder(true);
    try {
      for (let page = 0; page < 10; page += 1) {
        const rows = await fetchOlder();
        if (!rows?.length) break;
        if (rows.some((row) => row.id === id)) return revealMessage(id);
      }
      setError("That message is too far back to show here.");
    } catch {
      setError("Couldn’t load earlier messages. Try again.");
    } finally {
      setLoadingOlder(false);
    }
  }

  function cancelCompose() {
    if (editing) updateDraft(draftBeforeEdit.current, false);
    setEditing(null);
    setReplyTo(null);
  }

  function startReply(message: ThreadMessage) {
    if (editing) updateDraft(draftBeforeEdit.current, false);
    setEditing(null);
    setReplyTo(message);
    setActiveId(null);
    inputRef.current?.focus();
  }

  function startEdit(message: ThreadMessage) {
    if (!editing) draftBeforeEdit.current = draftRef.current;
    setReplyTo(null);
    setEditing(message);
    updateDraft(message.body, false);
    setActiveId(null);
    inputRef.current?.focus();
  }

  async function send() {
    const original = draftRef.current;
    const body = original.trim();
    if (!body || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    const supabase = createClient();
    try {
      if (editing) {
        const { data, error: failure } = await supabase.rpc("edit_message", { p_message_id: editing.id, p_body: body });
        if (failure) throw failure;
        setMessages((current) => mergeMessages(current, [{ ...(data as Message), sender: editing.sender }]));
        setEditing(null);
        updateDraft(draftBeforeEdit.current, false);
        return;
      }
      const { data, error: failure } = await supabase.from("messages")
        .insert({ conversation_id: conversationId, sender_id: currentUserId, body, reply_to_id: replyTo?.id ?? null })
        .select(messageFields).single();
      if (failure) throw failure;
      if (draftRef.current === original) updateDraft("");
      setReplyTo(null);
      jumpToLatest();
      setMessages((current) => mergeMessages(current, [data as ThreadMessage]));
    } catch {
      setError(editing ? "Couldn’t save your edit. Try again." : "Couldn’t send the message. Your draft is still here.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function react(message: ThreadMessage, emoji: string) {
    const mine = message.reactions?.[emoji]?.includes(currentUserId);
    const users = message.reactions?.[emoji] ?? [];
    const optimistic = { ...message.reactions };
    if (mine) {
      const rest = users.filter((id) => id !== currentUserId);
      if (rest.length) optimistic[emoji] = rest;
      else delete optimistic[emoji];
    } else {
      optimistic[emoji] = [...users, currentUserId];
    }
    setMessages((current) => current.map((row) => (row.id === message.id ? { ...row, reactions: optimistic } : row)));
    const { data, error: failure } = await createClient().rpc("toggle_message_reaction", { p_message_id: message.id, p_emoji: emoji });
    setMessages((current) => current.map((row) => (row.id === message.id
      ? { ...row, reactions: failure ? message.reactions : (data as Record<string, string[]>) }
      : row)));
    if (failure) setError(failure.message.includes("Join") ? "Join this chat to react." : "Couldn’t add that reaction.");
  }

  async function remove(message: ThreadMessage) {
    setConfirmDelete(null);
    setActiveId(null);
    const { error: failure } = await createClient().rpc("delete_message", { p_message_id: message.id });
    if (failure) return setError("Couldn’t delete the message.");
    setMessages((current) => current.map((row) => (row.id === message.id
      ? { ...row, body: "", image_path: null, reactions: {}, deleted_at: new Date().toISOString() }
      : row)));
    if (editing?.id === message.id) cancelCompose();
    if (replyTo?.id === message.id) setReplyTo(null);
  }

  async function copyMessage(message: ThreadMessage) {
    try {
      await navigator.clipboard.writeText(message.body);
      setCopiedId(message.id);
    } catch { setError("Clipboard unavailable. You can select and copy the message."); }
  }

  function closeSearch() {
    setSearchOpen(false);
    setQuery("");
    setHits(null);
    searchButtonRef.current?.focus();
  }

  function quoteFor(id: string): { name: string; text: string } | null {
    const loaded = byId.get(id);
    const row = loaded ?? quoted[id];
    if (!row) return null;
    const name = row.sender_id === currentUserId ? "You" : row.sender?.full_name ?? "Campus member";
    return { name, text: row.deleted_at ? "Message deleted" : snippet(row.body || "Photo", 120) };
  }

  const composeContext = editing ? { label: "Editing your message", text: snippet(editing.body) }
    : replyTo ? { label: `Replying to ${replyTo.sender_id === currentUserId ? "yourself" : replyTo.sender?.full_name ?? "Campus member"}`, text: snippet(replyTo.body) }
    : null;

  return (
    <div className="chat-thread-shell">
      <header className="chat-thread-header">
        {identity}
        <button type="button" ref={searchButtonRef} className="chat-icon-button" aria-label="Search this chat" title="Search this chat" aria-expanded={searchOpen} onClick={() => {
          if (searchOpen) closeSearch();
          else setSearchOpen(true);
        }}><Search size={19} aria-hidden="true" /></button>
      </header>
      {groupInfo}
      {loanContext}
      {!live && <p className="chat-connection" role="status">Connecting to chat…</p>}
      {searchOpen && (
        <div className="chat-thread-search">
          <label className="chat-search">
            <Search size={16} aria-hidden="true" />
            <input type="search" aria-label="Search this chat" placeholder="Search this chat" value={query}
              autoFocus
              onChange={(event) => { setQuery(event.target.value); if (event.target.value.trim().length < 2) setHits(null); }}
              onKeyDown={(event) => { if (event.key === "Escape") closeSearch(); }} />
          </label>
          <button className="chat-icon-button" type="button" aria-label="Close search" onClick={closeSearch}><X size={17} /></button>
          {term.length >= 2 && (
            <div className="chat-search-results">
              <p aria-live="polite">{searching ? "Searching…" : hits ? `${hits.length === 30 ? "30+" : hits.length} ${hits.length === 1 ? "match" : "matches"}` : ""}</p>
              {hits && hits.length > 0 && (
                <ol>
                  {hits.map((hit) => (
                    <li key={hit.id}>
                      <button type="button" onClick={() => void goToMessage(hit.id)}>
                        <span className="chat-search-hit-meta">{hit.sender_id === currentUserId ? "You" : hit.sender_name ?? "Campus member"} · {dayFormat.format(new Date(hit.created_at))}</span>
                        <span className="chat-search-hit-body">{snippet(hit.body, 140)}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      )}
      <div className="chat-history-wrap">
        <div className="chat-history" ref={listRef} role="region" aria-label="Messages" tabIndex={0} onScroll={(event) => {
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
              <p>{isCommunity ? "Every member of this group can read and post here." : "Agree on a pickup spot and time with your loan partner."}</p>
            </div>
          )}
          {messages.map((message, index) => {
            const mine = message.sender_id === currentUserId;
            const deleted = Boolean(message.deleted_at);
            const date = new Date(message.created_at);
            const day = dayFormat.format(date);
            const previous = messages[index - 1];
            const next = messages[index + 1];
            const startsDay = !previous || dayFormat.format(new Date(previous.created_at)) !== day;
            const startsGroup = startsDay || previous.sender_id !== message.sender_id ||
              Date.parse(message.created_at) - Date.parse(previous.created_at) > 5 * 60_000;
            const endsGroup = !next || next.sender_id !== message.sender_id ||
              dayFormat.format(new Date(next.created_at)) !== day ||
              Date.parse(next.created_at) - Date.parse(message.created_at) > 5 * 60_000;
            const quote = message.reply_to_id ? quoteFor(message.reply_to_id) : null;
            const reactions = Object.entries(message.reactions ?? {}).filter(([, users]) => users.length > 0);
            const open = activeId === message.id;
            const canDelete = mine || isAdmin;
            return (
              <Fragment key={message.id}>
                {startsDay && <div className="chat-day font-secondary"><time dateTime={message.created_at}>{day}</time></div>}
                <div className={cn("chat-message", mine && "chat-message-own", startsGroup && "chat-message-group", highlight === message.id && "chat-message-highlight")}
                  data-message-id={message.id} data-own={mine}>
                  {!mine && startsGroup && <span className="chat-sender">{message.sender?.full_name ?? "Campus member"}</span>}
                  {message.reply_to_id && (
                    <button type="button" className="chat-quote" onClick={() => message.reply_to_id && void goToMessage(message.reply_to_id)}
                      aria-label={quote ? `Reply to ${quote.name}: ${quote.text}` : "Reply to an earlier message"}>
                      <CornerUpLeft size={12} aria-hidden="true" />
                      <span><strong>{quote?.name ?? "Earlier message"}</strong> {quote?.text ?? ""}</span>
                    </button>
                  )}
                  <div className="chat-message-body">
                    <div className={cn("chat-bubble", deleted && "chat-bubble-deleted")}>
                      {deleted ? "Message deleted" : message.body || "Photo"}
                      {message.edited_at && !deleted && <span className="chat-edited"> (edited)</span>}
                    </div>
                    {!deleted && (
                      <button type="button" className="chat-copy" aria-expanded={open} aria-label="Message actions" title="Reply, react and more"
                        onClick={() => { setActiveId(open ? null : message.id); setConfirmDelete(null); }}>
                        <MoreHorizontal size={16} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {reactions.length > 0 && (
                    <div className="chat-reactions" role="group" aria-label="Reactions">
                      {reactions.map(([emoji, users]) => {
                        const reacted = users.includes(currentUserId);
                        return (
                          <button key={emoji} type="button" aria-pressed={reacted} disabled={!canPost}
                            aria-label={`${emoji} ${users.length}${reacted ? ", including you" : ""}`}
                            onClick={() => void react(message, emoji)}>
                            <span aria-hidden="true">{emoji}</span> {users.length}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {open && !deleted && (
                    <div className="chat-actions" role="group" aria-label="Message actions">
                      {canPost && (
                        <div className="chat-reaction-picker" role="group" aria-label="Add a reaction">
                          {MESSAGE_REACTIONS.map((emoji) => (
                            <button key={emoji} type="button" aria-pressed={message.reactions?.[emoji]?.includes(currentUserId) ?? false}
                              aria-label={`React ${emoji}`} onClick={() => void react(message, emoji)}>{emoji}</button>
                          ))}
                        </div>
                      )}
                      <div className="chat-action-buttons">
                        {canPost && <button type="button" onClick={() => startReply(message)}><CornerUpLeft size={14} aria-hidden="true" /> Reply</button>}
                        <button type="button" onClick={() => void copyMessage(message)}>
                          {copiedId === message.id ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                          {copiedId === message.id ? "Copied" : "Copy"}
                        </button>
                        {mine && canPost && <button type="button" onClick={() => startEdit(message)}><Pencil size={14} aria-hidden="true" /> Edit</button>}
                        {canDelete && (confirmDelete === message.id ? (
                          <span className="chat-confirm">
                            {mine ? "Delete for everyone?" : "Delete as admin?"}
                            <button type="button" className="chat-danger" onClick={() => void remove(message)}>Delete</button>
                            <button type="button" onClick={() => setConfirmDelete(null)}>Cancel</button>
                          </span>
                        ) : (
                          <button type="button" className="chat-danger" onClick={() => setConfirmDelete(message.id)}><Trash2 size={14} aria-hidden="true" /> Delete</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {endsGroup && <time className="chat-message-time" dateTime={message.created_at}>{timeFormat.format(date)}</time>}
                </div>
              </Fragment>
            );
          })}
        </div>
        {showLatest && <button type="button" className="chat-jump" onClick={jumpToLatest}><ArrowDown size={14} /> Latest messages</button>}
      </div>

      {canPost ? (
        <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
          {error && <p className="chat-error" role="alert">{error}</p>}
          {composeContext && (
            <div className="chat-compose-context">
              {editing ? <Pencil size={14} aria-hidden="true" /> : <CornerUpLeft size={14} aria-hidden="true" />}
              <span><strong>{composeContext.label}</strong> {composeContext.text}</span>
              <button type="button" className="chat-icon-button" aria-label={editing ? "Cancel editing" : "Cancel reply"} onClick={cancelCompose}><X size={15} /></button>
            </div>
          )}
          <div className="chat-compose-row">
            <textarea
              aria-label={editing ? "Edit your message" : "Write a message"}
              maxLength={2000}
              ref={inputRef}
              onChange={(event) => updateDraft(event.target.value, !editing)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && composeContext) {
                  event.preventDefault();
                  cancelCompose();
                } else if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder={editing ? "Edit your message…" : "Write a message…"}
              rows={1}
              value={draft}
            />
            <button aria-label={editing ? "Save edit" : "Send message"} className="chat-send" disabled={sending || !draft.trim()} type="submit">
              {editing ? <Check size={18} aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
            </button>
          </div>
          {!isCommunity && !draft && !composeContext && <div className="chat-quick-replies" aria-label="Suggested replies">
            {[
              ["Plan pickup", "When and where works for pickup?"],
              ["Plan return", "When and where works for the return?"],
            ].map(([label, value]) => (
              <button key={label} type="button" onClick={() => { updateDraft(value); inputRef.current?.focus(); }}>{label}</button>
            ))}
          </div>}
          {draft.length >= 1800 && <p className="chat-composer-meta">{draft.length} / 2000</p>}
        </form>
      ) : (
        <div className="chat-composer chat-composer-closed">
          {error && <p className="chat-error" role="alert">{error}</p>}
          {closedComposer}
        </div>
      )}
    </div>
  );
}
