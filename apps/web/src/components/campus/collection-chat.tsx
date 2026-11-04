"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExchangeMessage } from "@borrowbuddy/shared";
import { campusDate } from "@borrowbuddy/shared";
import { createClient } from "@/lib/supabase/client";
import { buttonClass, fieldClass, secondaryClass } from "./campus-ui";

export function CollectionChat({
  transferId,
  userId,
  initialMessages,
  active,
}: {
  transferId: string;
  userId: string;
  initialMessages: ExchangeMessage[];
  active: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState("CONNECTING");
  const [older, setOlder] = useState(initialMessages.length === 50);
  const requestId = useRef<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    const db = createClient();
    let disposed = false;
    let syncing = false;
    const read = () => {
      if (document.visibilityState === "visible")
        void db.rpc("campus_api", {
          p_action: "read_thread",
          p_data: { id: transferId },
        });
    };
    read();
    const sync = async () => {
      if (disposed || syncing || document.visibilityState !== "visible") return;
      syncing = true;
      try {
        const [history, transfer] = await Promise.all([
          db
            .from("campus_messages")
            .select("*")
            .eq("transfer_id", transferId)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(50),
          db
            .from("campus_transfers")
            .select("status,expires_at")
            .eq("id", transferId)
            .maybeSingle(),
        ]);
        if (disposed) return;
        if (!history.error)
          setMessages((rows) =>
            [
              ...new Map(
                [...rows, ...(history.data ?? [])].map((m) => [m.id, m]),
              ).values(),
            ].sort(
              (a, b) =>
                a.created_at.localeCompare(b.created_at) ||
                a.id.localeCompare(b.id),
            ),
          );
        const row = transfer.data;
        if (
          row &&
          (row.status === "active" &&
            (!row.expires_at ||
              new Date(row.expires_at).getTime() > Date.now())) !== active
        )
          router.refresh();
        if (!history.error) read();
      } catch {
        if (!disposed) setConnection("RECONNECTING");
      } finally {
        syncing = false;
      }
    };
    document.addEventListener("visibilitychange", read);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("online", sync);
    // A reconnect sweep also covers networks which block WebSockets. No data
    // or drafts are stored outside this authenticated page.
    const timer = setInterval(() => {
      void sync();
    }, 10000);
    const channel = db
      // Each effect owns its channel. The SDK reuses equal topic names while an
      // old async unsubscribe is still pending (including Strict Mode remounts).
      .channel(`campus-collection-${transferId}-${crypto.randomUUID()}`)
      .on("system", {}, (payload) => {
        if (disposed || payload.extension !== "postgres_changes") return;
        setConnection(payload.status === "ok" ? "LIVE" : "RECONNECTING");
        // The socket can join before the replication listener is ready. Sweep
        // again at readiness to recover writes made inside that initial gap.
        if (payload.status === "ok") void sync();
      })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "campus_messages",
          filter: `transfer_id=eq.${transferId}`,
        },
        (payload) => {
          if (disposed) return;
          const message = payload.new as ExchangeMessage;
          setMessages((rows) =>
            rows.some((r) => r.id === message.id) ? rows : [...rows, message],
          );
          read();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "campus_transfers",
          filter: `id=eq.${transferId}`,
        },
        () => {
          if (!disposed) router.refresh();
        },
      );
    void (async () => {
      try {
        // Bootstrap Realtime with the cookie session before joining. Joining
        // with the anonymous key cannot validate filters on these private tables.
        const { data } = await db.auth.getSession();
        if (disposed) return;
        if (!data.session) {
          setConnection("RECONNECTING");
          return;
        }
        await db.realtime.setAuth(data.session.access_token);
        if (disposed) return;
        channel.subscribe((status) => {
          if (disposed) return;
          if (status !== "SUBSCRIBED") setConnection(status);
          if (status === "SUBSCRIBED") void sync();
        });
      } catch {
        if (!disposed) setConnection("RECONNECTING");
      }
    })();
    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", read);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("online", sync);
      void db.removeChannel(channel);
    };
  }, [transferId, router, active]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (sending || !draft.trim() || !active) return;
    setSending(true);
    setError("");
    requestId.current ??= crypto.randomUUID();
    try {
      const db = createClient();
      const { data, error } = await db.rpc("campus_api", {
        p_action: "send_message",
        p_data: { id: transferId, body: draft, client_id: requestId.current },
      });
      if (error || data?.ok === false) {
        const message = error?.message ?? data.error;
        setError(
          /fetch|network|connection/i.test(message)
            ? "Connection lost. Your draft is retained; retry when you reconnect."
            : message,
        );
        if (data?.ok === false) router.refresh();
        return;
      }
      const result = await db
        .from("campus_messages")
        .select("*")
        .eq("transfer_id", transferId)
        .eq("client_id", requestId.current)
        .eq("sender_id", userId)
        .single();
      if (result.error) {
        setError("Message may have been sent. Retry to confirm safely.");
        return;
      }
      setMessages((rows) =>
        rows.some((r) => r.id === result.data.id)
          ? rows
          : [...rows, result.data as ExchangeMessage],
      );
      setDraft("");
      requestId.current = null;
      bottom.current?.scrollIntoView({ block: "nearest" });
    } catch {
      setError(
        "Connection lost. Your draft is retained; retry to confirm safely.",
      );
    } finally {
      setSending(false);
    }
  }
  async function loadOlder() {
    const first = messages[0];
    if (!first) return;
    const { data, error } = await createClient()
      .from("campus_messages")
      .select("*")
      .eq("transfer_id", transferId)
      .or(
        `created_at.lt.${first.created_at},and(created_at.eq.${first.created_at},id.lt.${first.id})`,
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(50);
    if (error) {
      setError("Could not load older messages. Please retry.");
      return;
    }
    setMessages((rows) => [
      ...((data ?? []) as ExchangeMessage[]).reverse(),
      ...rows,
    ]);
    setOlder(data.length === 50);
  }
  return (
    <section
      aria-label="Private collection conversation"
      className="border border-line bg-black"
    >
      <div className="border-b border-line p-5">
        <p className="font-secondary text-[10px] text-accent">
          [ PRIVATE COLLECTION CHANNEL ]
        </p>
        <h2 className="type-title mt-2 text-2xl">Work out the details</h2>
        <p
          className="mt-3 font-secondary text-[9px] text-ink/45"
          data-testid="collection-connection"
          data-connection={connection}
        >
          {connection === "LIVE"
            ? "LIVE UPDATES CONNECTED"
            : "RECONNECTING · CHECKING FOR NEW MESSAGES"}
        </p>
        <p className="mt-2 text-xs normal-case text-ink/55">
          Only you and your collection partner can read this conversation.
          Ownership evidence stays in the admin claim review.
        </p>
      </div>
      <div
        className="max-h-[32rem] space-y-3 overflow-y-auto p-4 sm:p-5"
        role="log"
        aria-label="Collection messages"
        aria-live="polite"
      >
        {older && (
          <button
            className={secondaryClass}
            type="button"
            onClick={() => void loadOlder()}
          >
            LOAD OLDER MESSAGES
          </button>
        )}
        {!messages.length && (
          <p className="py-8 text-center text-sm normal-case text-ink/45">
            Start with a pickup location or a time that works for you.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.sender_id === userId ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[90%] border p-3 sm:max-w-[80%] ${m.sender_id === userId ? "border-accent/40 bg-accent/10" : "border-line bg-deep/50"}`}
            >
              <p className="whitespace-pre-wrap break-words text-sm normal-case leading-6">
                {m.body}
              </p>
              <p className="mt-2 text-[9px] text-ink/40">
                {m.sender_id === userId ? "YOU" : "PARTNER"} ·{" "}
                {campusDate(m.created_at)}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form className="space-y-3 border-t border-line p-4" onSubmit={send}>
        {error && (
          <p role="alert" className="text-xs normal-case text-warn">
            {error}
          </p>
        )}
        <label className="sr-only" htmlFor={`message-${transferId}`}>
          Collection message
        </label>
        <textarea
          id={`message-${transferId}`}
          className={fieldClass}
          placeholder={
            active
              ? "Write to your collection partner…"
              : "This collection is closed. Conversation is read-only."
          }
          rows={3}
          maxLength={2000}
          disabled={!active || sending}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            requestId.current = null;
          }}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-secondary text-[9px] text-ink/40">
            {draft.length}/2000 · SHIFT + ENTER FOR A NEW LINE
          </p>
          <button
            className={buttonClass}
            disabled={!active || sending || !draft.trim()}
          >
            {sending ? "SENDING…" : "SEND MESSAGE"}
          </button>
        </div>
      </form>
    </section>
  );
}
