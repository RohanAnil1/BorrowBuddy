"use client";

import {
  ArrowDown, BarChart3, Check, ChevronDown, Copy, CornerUpLeft, ImagePlus, Lock, MoreHorizontal, Pencil, Pin, PinOff, Plus,
  Search, Send, Trash2, Unlock, X,
} from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  CHAT_IMAGE_MAX_BYTES, CHAT_IMAGE_TYPES, MESSAGE_REACTIONS, POLL_OPTIONS_MAX, type Message, type Poll,
} from "@borrowbuddy/shared";
import { createClient } from "@/lib/supabase/client";
import type { PinnedMessage, ThreadMessage } from "@/lib/data/chat";
import { BUCKETS } from "@/lib/storage";
import { cn } from "@/lib/utils";

const messageFields = "*, sender:profiles!messages_sender_id_fkey(id, full_name, avatar_path)";
const dayFormat = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const TYPING_SEND_MS = 2500;
const TYPING_SHOW_MS = 6000;

type SearchHit = { id: string; sender_id: string; sender_name: string | null; body: string; created_at: string };
type QuotedMessage = { id: string; body: string; deleted_at: string | null; sender_id: string; image_path: string | null; poll: Poll | null; sender: { full_name: string } | null };
type Mentionable = { id: string; name: string };

/** Adds new rows and replaces changed ones (keeping a known sender), oldest first. */
function mergeMessages(current: ThreadMessage[], incoming: ThreadMessage[]) {
  if (!incoming.length) return current;
  const rows = new Map(current.map((message) => [message.id, message]));
  let changed = false;
  for (const row of incoming) {
    const known = rows.get(row.id);
    if (known && known.edited_at === row.edited_at && known.deleted_at === row.deleted_at && known.pinned_at === row.pinned_at &&
        JSON.stringify(known.reactions) === JSON.stringify(row.reactions) &&
        JSON.stringify(known.poll ?? null) === JSON.stringify(row.poll ?? null)) continue;
    rows.set(row.id, {
      ...row, reactions: row.reactions ?? {}, mentions: row.mentions ?? [], poll: row.poll ?? null,
      sender: row.sender ?? known?.sender ?? null,
    });
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

function summary(row: { body: string; image_path: string | null; poll: Poll | null; deleted_at?: string | null }, length = 90) {
  if (row.deleted_at) return "Message deleted";
  if (row.poll) return `Poll: ${snippet(row.poll.question, length - 6)}`;
  return row.body ? snippet(row.body, length) : row.image_path ? "Photo" : "Message";
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function typingLabel(names: string[]) {
  if (!names.length) return "";
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return "Several people are typing…";
}

function PollCard({ poll, userId, canVote, canClose, vote, close }: {
  poll: Poll; userId: string; canVote: boolean; canClose: boolean;
  vote: (option: number) => void; close: (closed: boolean) => void;
}) {
  const counts = poll.options.map((_, index) => poll.votes?.[String(index)]?.length ?? 0);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const mine = poll.options.findIndex((_, index) => poll.votes?.[String(index)]?.includes(userId));
  return (
    <div className="chat-poll" role="group" aria-label={`Poll: ${poll.question}`}>
      <p className="chat-poll-question"><BarChart3 size={14} aria-hidden="true" /> {poll.question}</p>
      <ol>
        {poll.options.map((option, index) => {
          const share = total ? Math.round((counts[index] / total) * 100) : 0;
          return (
            <li key={index}>
              <button type="button" disabled={!canVote || poll.closed} aria-pressed={mine === index} onClick={() => vote(index)}
                aria-label={`${option}: ${counts[index]} ${counts[index] === 1 ? "vote" : "votes"}${mine === index ? ", your vote" : ""}`}>
                <span className="chat-poll-bar" style={{ width: `${share}%` }} aria-hidden="true" />
                <span className="chat-poll-option">{mine === index && <Check size={13} aria-hidden="true" />}{option}</span>
                <span className="chat-poll-count">{counts[index]}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="chat-poll-meta">
        {total} {total === 1 ? "vote" : "votes"}
        {poll.closed ? " · Closed" : canVote ? (mine >= 0 ? " · Tap your choice again to take it back" : " · One vote each") : ""}
        {canClose && (
          <button type="button" onClick={() => close(!poll.closed)}>
            {poll.closed ? <><Unlock size={12} aria-hidden="true" /> Reopen</> : <><Lock size={12} aria-hidden="true" /> Close poll</>}
          </button>
        )}
      </p>
    </div>
  );
}

export function MessageThread({
  conversationId,
  currentUserId,
  currentUserName = "",
  initialMessages,
  initialPinned = [],
  isCommunity,
  isAdmin = false,
  canPost = true,
  canReact = canPost,
  canPin = false,
  canPoll = false,
  trackRead = true,
  mentionables = [],
  identity,
  loanContext,
  groupInfo,
  closedComposer,
}: {
  conversationId: string;
  currentUserId: string;
  currentUserName?: string;
  initialMessages: ThreadMessage[];
  initialPinned?: PinnedMessage[];
  isCommunity: boolean;
  isAdmin?: boolean;
  /** False for a group you haven't joined, an archived group, or an announcement group if you aren't an admin. */
  canPost?: boolean;
  /** Reacting and voting: members of a chat that isn't archived. */
  canReact?: boolean;
  canPin?: boolean;
  canPoll?: boolean;
  /** Only members keep a read cursor. */
  trackRead?: boolean;
  /** Students you can @mention here. */
  mentionables?: Mentionable[];
  identity: ReactNode;
  loanContext?: ReactNode;
  groupInfo?: ReactNode;
  /** Shown instead of the composer when you can't post. */
  closedComposer?: ReactNode;
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const [pinned, setPinned] = useState<PinnedMessage[]>(initialPinned);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [quoted, setQuoted] = useState<Record<string, QuotedMessage>>({});
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
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
  const [mention, setMention] = useState<{ query: string; start: number; index: number } | null>(null);
  const [typers, setTypers] = useState<Record<string, { name: string; at: number }>>({});
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const following = useRef(true);
  const sendingRef = useRef(false);
  const draftRef = useRef("");
  const messagesRef = useRef(initialMessages);
  const requestedQuotes = useRef(new Set<string>());
  const requestedImages = useRef(new Set<string>());
  /** The unsent new-message draft, put back after an edit. */
  const draftBeforeEdit = useRef("");
  const typingChannel = useRef<RealtimeChannel | null>(null);
  const typingSentAt = useRef(0);
  const anchor = useRef<{ top: number; height: number } | null>(null);
  const draftKey = `borrowbuddy.chat.draft.${currentUserId}.${conversationId}`;
  const term = query.trim();
  const byId = new Map(messages.map((message) => [message.id, message]));
  const firstName = currentUserName.split(" ")[0] || "Someone";
  const mentionNames = [...mentionables.map((row) => row.name), currentUserName].filter(Boolean).sort((a, b) => b.length - a.length);
  const mentionPattern = mentionNames.length ? new RegExp(`(@(?:${mentionNames.map(escapeRegExp).join("|")}))`, "g") : null;
  const suggestions = mention
    ? mentionables.filter((row) => row.name.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 6)
    : [];

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

  /** Tells the others you're typing, at most every few seconds. */
  function announceTyping() {
    const channel = typingChannel.current;
    const now = Date.now();
    if (!channel || !canPost || now - typingSentAt.current < TYPING_SEND_MS) return;
    typingSentAt.current = now;
    void channel.send({ type: "broadcast", event: "typing", payload: { user_id: currentUserId, name: firstName } }).catch(() => {});
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
        .select("id, body, deleted_at, sender_id, image_path, poll, sender:profiles!messages_sender_id_fkey(full_name)")
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

  // Signed links for photos (the bucket is private).
  useEffect(() => {
    const requested = requestedImages.current;
    const paths = [...new Set(messages.flatMap((message) => message.image_path && !message.deleted_at ? [message.image_path] : []))]
      .filter((path) => !requested.has(path));
    if (!paths.length) return;
    paths.forEach((path) => requested.add(path));
    void (async () => {
      const { data } = await createClient().storage.from(BUCKETS.chatImages).createSignedUrls(paths, 60 * 60);
      const next: Record<string, string> = {};
      for (const row of data ?? []) if (row.path && row.signedUrl) next[row.path] = row.signedUrl;
      if (Object.keys(next).length) setImageUrls((current) => ({ ...current, ...next }));
    })();
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
        setTypers((current) => {
          if (!current[row.sender_id]) return current;
          const next = { ...current };
          delete next[row.sender_id];
          return next;
        });
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
      // Edits, deletes, reactions, pins and poll votes all update the row.
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter }, (payload) => {
        if (disposed) return;
        const row = payload.new as Message;
        setMessages((current) => current.some((message) => message.id === row.id)
          ? mergeMessages(current, [{ ...row, sender: null }])
          : current);
        setPinned((current) => {
          const without = current.filter((pin) => pin.id !== row.id);
          if (!row.pinned_at || row.deleted_at) return without.length === current.length ? current : without;
          const sender = messagesRef.current.find((message) => message.id === row.id)?.sender ?? current.find((pin) => pin.id === row.id)?.sender ?? null;
          return [{ id: row.id, body: row.body, sender_id: row.sender_id, pinned_at: row.pinned_at, image_path: row.image_path, poll: row.poll, sender }, ...without]
            .sort((a, b) => (b.pinned_at ?? "").localeCompare(a.pinned_at ?? ""));
        });
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

  // Typing: a private broadcast channel the database authorises per chat.
  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    const channel = supabase.channel(`typing:${conversationId}`, { config: { private: true, broadcast: { self: false } } });
    channel.on("broadcast", { event: "typing" }, ({ payload }) => {
      const typer = payload as { user_id?: unknown; name?: unknown };
      if (disposed || typeof typer.user_id !== "string" || typer.user_id === currentUserId) return;
      const name = typeof typer.name === "string" && typer.name.trim() ? typer.name.trim().slice(0, 40) : "Someone";
      setTypers((current) => ({ ...current, [typer.user_id as string]: { name, at: Date.now() } }));
    });
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (disposed || !data.session) return;
        await supabase.realtime.setAuth(data.session.access_token);
        if (disposed) return;
        channel.subscribe((status) => { if (!disposed && status === "SUBSCRIBED") typingChannel.current = channel; });
      } catch { /* Typing is optional; chat keeps working without it. */ }
    })();
    const sweep = window.setInterval(() => {
      setTypers((current) => {
        const cutoff = Date.now() - TYPING_SHOW_MS;
        const entries = Object.entries(current).filter(([, typer]) => typer.at > cutoff);
        return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
      });
    }, 1500);
    return () => {
      disposed = true;
      typingChannel.current = null;
      window.clearInterval(sweep);
      void supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId]);

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
    setPinsOpen(false);
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

  /** Finds an "@name" being typed just before the caret. */
  function trackMention(value: string, caret: number) {
    if (!mentionables.length) return setMention(null);
    const match = /(?:^|\s)@([^\s@]{0,30})$/u.exec(value.slice(0, caret));
    setMention(match ? { query: match[1], start: caret - match[1].length - 1, index: 0 } : null);
  }

  function pickMention(row: Mentionable) {
    if (!mention) return;
    const value = draftRef.current;
    const caret = mention.start + 1 + mention.query.length;
    const next = `${value.slice(0, mention.start)}@${row.name} ${value.slice(caret)}`;
    updateDraft(next, !editing);
    setMention(null);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      const position = mention.start + row.name.length + 2;
      input.focus();
      input.setSelectionRange(position, position);
    });
  }

  /** Students whose "@Full Name" is in the text. */
  function mentionsIn(body: string) {
    return mentionables.filter((row) => row.name && body.includes(`@${row.name}`)).map((row) => row.id);
  }

  async function send() {
    const original = draftRef.current;
    const body = original.trim();
    if (!body || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    setMention(null);
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
        .insert({ conversation_id: conversationId, sender_id: currentUserId, body, reply_to_id: replyTo?.id ?? null, mentions: mentionsIn(body) })
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

  /** Uploads a photo to your own folder, then sends it with the draft as its caption. */
  async function sendPhoto(file: File) {
    if (!CHAT_IMAGE_TYPES.includes(file.type as (typeof CHAT_IMAGE_TYPES)[number])) return setError("Send a JPEG, PNG or WebP photo.");
    if (file.size > CHAT_IMAGE_MAX_BYTES) return setError("Photos can be up to 5 MB.");
    setUploading(true);
    setError(null);
    const supabase = createClient();
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${currentUserId}/${conversationId}/${crypto.randomUUID()}.${extension}`;
    try {
      const { error: upload } = await supabase.storage.from(BUCKETS.chatImages).upload(path, file, { contentType: file.type, upsert: false });
      if (upload) throw upload;
      const caption = draftRef.current.trim();
      const { data, error: failure } = await supabase.from("messages")
        .insert({ conversation_id: conversationId, sender_id: currentUserId, body: caption, image_path: path, reply_to_id: replyTo?.id ?? null, mentions: mentionsIn(caption) })
        .select(messageFields).single();
      if (failure) {
        void supabase.storage.from(BUCKETS.chatImages).remove([path]);
        throw failure;
      }
      const url = URL.createObjectURL(file);
      requestedImages.current.add(path);
      setImageUrls((current) => ({ ...current, [path]: url }));
      if (caption) updateDraft("");
      setReplyTo(null);
      jumpToLatest();
      setMessages((current) => mergeMessages(current, [data as ThreadMessage]));
    } catch {
      setError("Couldn’t send the photo. Try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function createPoll() {
    const question = pollQuestion.trim();
    const options = pollOptions.map((option) => option.trim()).filter(Boolean);
    if (!question) return setError("Ask a question for the poll.");
    if (new Set(options).size < 2) return setError("Give at least two different options.");
    setSending(true);
    setError(null);
    const { error: failure } = await createClient().rpc("create_poll", { p_conversation_id: conversationId, p_question: question, p_options: options });
    setSending(false);
    if (failure) return setError(failure.message);
    setPollOpen(false);
    setPollQuestion("");
    setPollOptions(["", ""]);
    jumpToLatest();
  }

  async function vote(message: ThreadMessage, option: number) {
    const { data, error: failure } = await createClient().rpc("vote_poll", { p_message_id: message.id, p_option: option });
    if (failure) return setError(failure.message);
    setMessages((current) => current.map((row) => (row.id === message.id ? { ...row, poll: data as Poll } : row)));
  }

  async function closePoll(message: ThreadMessage, closed: boolean) {
    const { error: failure } = await createClient().rpc("close_poll", { p_message_id: message.id, p_closed: closed });
    if (failure) return setError(failure.message);
    setMessages((current) => current.map((row) => (row.id === message.id && row.poll ? { ...row, poll: { ...row.poll, closed } } : row)));
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

  async function pin(message: { id: string }, pinnedNow: boolean) {
    setActiveId(null);
    const { error: failure } = await createClient().rpc("pin_message", { p_message_id: message.id, p_pinned: pinnedNow });
    if (failure) return setError(failure.message);
    const stamp = pinnedNow ? new Date().toISOString() : null;
    setMessages((current) => current.map((row) => (row.id === message.id ? { ...row, pinned_at: stamp, pinned_by: pinnedNow ? currentUserId : null } : row)));
    setPinned((current) => {
      const without = current.filter((row) => row.id !== message.id);
      const row = messagesRef.current.find((item) => item.id === message.id);
      if (!pinnedNow || !row) return without;
      return [{ id: row.id, body: row.body, sender_id: row.sender_id, pinned_at: stamp, image_path: row.image_path, poll: row.poll, sender: row.sender }, ...without];
    });
  }

  async function remove(message: ThreadMessage) {
    setConfirmDelete(null);
    setActiveId(null);
    const { error: failure } = await createClient().rpc("delete_message", { p_message_id: message.id });
    if (failure) return setError("Couldn’t delete the message.");
    setMessages((current) => current.map((row) => (row.id === message.id
      ? { ...row, body: "", image_path: null, reactions: {}, poll: null, pinned_at: null, deleted_at: new Date().toISOString() }
      : row)));
    setPinned((current) => current.filter((row) => row.id !== message.id));
    if (editing?.id === message.id) cancelCompose();
    if (replyTo?.id === message.id) setReplyTo(null);
  }

  async function copyMessage(message: ThreadMessage) {
    try {
      await navigator.clipboard.writeText(message.poll ? message.poll.question : message.body);
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
    const row = byId.get(id) ?? quoted[id];
    if (!row) return null;
    const name = row.sender_id === currentUserId ? "You" : row.sender?.full_name ?? "Campus member";
    return { name, text: summary(row, 120) };
  }

  /** Message text with known @mentions picked out. */
  function renderBody(text: string) {
    if (!mentionPattern || !text.includes("@")) return text;
    return text.split(mentionPattern).map((part, index) => (index % 2 === 1
      ? <strong key={index} className={cn("chat-mention", part === `@${currentUserName}` && "chat-mention-me")}>{part}</strong>
      : part));
  }

  const composeContext = editing ? { label: "Editing your message", text: summary(editing) }
    : replyTo ? { label: `Replying to ${replyTo.sender_id === currentUserId ? "yourself" : replyTo.sender?.full_name ?? "Campus member"}`, text: summary(replyTo) }
    : null;
  const typing = typingLabel(Object.values(typers).map((typer) => typer.name));
  const topPin = pinned[0];

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
      {topPin && (
        <div className="chat-pins">
          <button type="button" className="chat-pin-bar" aria-expanded={pinsOpen} onClick={() => (pinned.length > 1 ? setPinsOpen(!pinsOpen) : void goToMessage(topPin.id))}>
            <Pin size={14} aria-hidden="true" />
            <span className="chat-pin-text"><strong>Pinned</strong> {summary(topPin, 110)}</span>
            {pinned.length > 1 && <span className="chat-pin-count">{pinned.length} <ChevronDown size={13} aria-hidden="true" /></span>}
          </button>
          {pinsOpen && (
            <ol className="chat-pin-list">
              {pinned.map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => void goToMessage(row.id)}>
                    <span className="chat-search-hit-meta">{row.sender_id === currentUserId ? "You" : row.sender?.full_name ?? "Campus member"}</span>
                    <span className="chat-search-hit-body">{summary(row, 140)}</span>
                  </button>
                  {canPin && <button type="button" className="chat-icon-button" aria-label="Unpin" title="Unpin" onClick={() => void pin(row, false)}><PinOff size={15} /></button>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
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
              <p>{isCommunity ? "Members of this group can read and post here." : "Agree on a pickup spot and time with your loan partner."}</p>
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
            const mentioned = !mine && (message.mentions ?? []).includes(currentUserId);
            const imageUrl = message.image_path ? imageUrls[message.image_path] : undefined;
            return (
              <Fragment key={message.id}>
                {startsDay && <div className="chat-day font-secondary"><time dateTime={message.created_at}>{day}</time></div>}
                <div className={cn("chat-message", mine && "chat-message-own", startsGroup && "chat-message-group",
                  highlight === message.id && "chat-message-highlight", mentioned && "chat-message-mentioned")}
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
                    <div className={cn("chat-bubble", deleted && "chat-bubble-deleted", message.poll && "chat-bubble-poll")}>
                      {message.pinned_at && !deleted && <Pin className="chat-pinned-mark" size={12} aria-label="Pinned" />}
                      {deleted ? "Message deleted" : message.poll ? (
                        <PollCard poll={message.poll} userId={currentUserId} canVote={canReact}
                          canClose={mine || isAdmin} vote={(option) => void vote(message, option)} close={(closed) => void closePoll(message, closed)} />
                      ) : (
                        <>
                          {message.image_path && (imageUrl ? (
                            <a className="chat-image-link" href={imageUrl} target="_blank" rel="noreferrer">
                              {/* Signed, private storage links can't go through the image optimizer. */}
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img className="chat-image" src={imageUrl} alt={message.body ? `Photo: ${snippet(message.body, 60)}` : "Photo"} loading="lazy" />
                            </a>
                          ) : <span className="chat-image chat-image-loading">Loading photo…</span>)}
                          {message.body && <span>{renderBody(message.body)}</span>}
                        </>
                      )}
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
                          <button key={emoji} type="button" aria-pressed={reacted} disabled={!canReact}
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
                      {canReact && (
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
                        {canPin && (message.pinned_at
                          ? <button type="button" onClick={() => void pin(message, false)}><PinOff size={14} aria-hidden="true" /> Unpin</button>
                          : <button type="button" onClick={() => void pin(message, true)}><Pin size={14} aria-hidden="true" /> Pin</button>)}
                        {mine && canPost && !message.poll && <button type="button" onClick={() => startEdit(message)}><Pencil size={14} aria-hidden="true" /> Edit</button>}
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
      <p className="chat-typing" aria-live="polite">{typing}</p>

      {canPost ? (
        <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
          {error && <p className="chat-error" role="alert">{error}</p>}
          {pollOpen && (
            <fieldset className="chat-poll-form">
              <legend>New poll</legend>
              <input aria-label="Poll question" maxLength={300} placeholder="Ask a question" value={pollQuestion} onChange={(event) => setPollQuestion(event.target.value)} />
              {pollOptions.map((option, index) => (
                <div className="chat-poll-form-row" key={index}>
                  <input aria-label={`Option ${index + 1}`} maxLength={100} placeholder={`Option ${index + 1}`} value={option}
                    onChange={(event) => setPollOptions((current) => current.map((value, i) => (i === index ? event.target.value : value)))} />
                  {pollOptions.length > 2 && (
                    <button type="button" className="chat-icon-button" aria-label={`Remove option ${index + 1}`}
                      onClick={() => setPollOptions((current) => current.filter((_, i) => i !== index))}><X size={15} /></button>
                  )}
                </div>
              ))}
              <div className="chat-poll-form-actions">
                {pollOptions.length < POLL_OPTIONS_MAX && (
                  <button type="button" className="chat-text-action" onClick={() => setPollOptions((current) => [...current, ""])}><Plus size={13} aria-hidden="true" /> Add option</button>
                )}
                <span className="chat-poll-form-spacer" />
                <button type="button" className="chat-text-action" onClick={() => setPollOpen(false)}>Cancel</button>
                <button type="button" className="chat-poll-submit" disabled={sending} onClick={() => void createPoll()}>Post poll</button>
              </div>
            </fieldset>
          )}
          {composeContext && (
            <div className="chat-compose-context">
              {editing ? <Pencil size={14} aria-hidden="true" /> : <CornerUpLeft size={14} aria-hidden="true" />}
              <span><strong>{composeContext.label}</strong> {composeContext.text}</span>
              <button type="button" className="chat-icon-button" aria-label={editing ? "Cancel editing" : "Cancel reply"} onClick={cancelCompose}><X size={15} /></button>
            </div>
          )}
          {mention && suggestions.length > 0 && (
            <ul className="chat-mention-list" role="listbox" aria-label="Mention someone">
              {suggestions.map((row, index) => (
                <li key={row.id} role="option" aria-selected={index === mention.index}>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => pickMention(row)}>@{row.name}</button>
                </li>
              ))}
            </ul>
          )}
          <div className="chat-compose-row">
            {!editing && (
              <>
                <input ref={fileRef} className="sr-only" type="file" accept={CHAT_IMAGE_TYPES.join(",")} tabIndex={-1} aria-hidden="true"
                  onChange={(event) => { const file = event.target.files?.[0]; if (file) void sendPhoto(file); }} />
                <button type="button" className="chat-icon-button" aria-label="Send a photo" title="Send a photo (uses your draft as the caption)"
                  disabled={uploading} onClick={() => fileRef.current?.click()}><ImagePlus size={18} aria-hidden="true" /></button>
                {canPoll && (
                  <button type="button" className="chat-icon-button" aria-label="Create a poll" title="Create a poll" aria-expanded={pollOpen}
                    onClick={() => setPollOpen(!pollOpen)}><BarChart3 size={18} aria-hidden="true" /></button>
                )}
              </>
            )}
            <textarea
              aria-label={editing ? "Edit your message" : "Write a message"}
              aria-autocomplete={mentionables.length ? "list" : undefined}
              maxLength={2000}
              ref={inputRef}
              onChange={(event) => {
                updateDraft(event.target.value, !editing);
                trackMention(event.target.value, event.target.selectionStart ?? event.target.value.length);
                if (!editing && event.target.value) announceTyping();
              }}
              onKeyDown={(event) => {
                if (mention && suggestions.length) {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    const step = event.key === "ArrowDown" ? 1 : -1;
                    setMention({ ...mention, index: (mention.index + step + suggestions.length) % suggestions.length });
                    return;
                  }
                  if (event.key === "Enter" || event.key === "Tab") {
                    event.preventDefault();
                    pickMention(suggestions[mention.index] ?? suggestions[0]);
                    return;
                  }
                  if (event.key === "Escape") { event.preventDefault(); setMention(null); return; }
                }
                if (event.key === "Escape" && composeContext) {
                  event.preventDefault();
                  cancelCompose();
                } else if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder={editing ? "Edit your message…" : uploading ? "Sending photo…" : mentionables.length ? "Write a message… (@ to mention)" : "Write a message…"}
              rows={1}
              value={draft}
            />
            <button aria-label={editing ? "Save edit" : "Send message"} className="chat-send" disabled={sending || uploading || !draft.trim()} type="submit">
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
