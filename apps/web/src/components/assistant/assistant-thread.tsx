"use client";

import { ArrowDown, ArrowUp, Check, RotateCcw, Square } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ASSISTANT_LIMITS } from "@/lib/assistant/types";
import { cn } from "@/lib/utils";
import { AssistantCardView } from "./assistant-cards";
import { buddy, useActiveConversation, useBuddy, type BuddyMessage } from "./buddy-store";
import { Parcel } from "./mascot/parcel";

export function suggestionsFor(path: string): string[] {
  if (path.startsWith("/items/")) return ["How do deposits work?", "How do handovers work?", "What if I return it late?"];
  if (path.startsWith("/fines")) return ["Do I owe anything?", "How do fines work?", "How is my trust score worked out?"];
  if (path.startsWith("/my") || path.startsWith("/dashboard") || path.startsWith("/loans")) {
    return ["When are my loans due?", "Any requests waiting on me?", "Do I owe any fines?"];
  }
  if (path.startsWith("/map")) return ["Where are the pickup spots?", "How do handovers work?"];
  if (path.startsWith("/campus")) return ["How do giveaways work?", "How does Lost & Found work?", "How do appointments work?"];
  return ["Find a calculator for this weekend", "When are my loans due?", "How do fines work?", "Take me to the map"];
}

/** Tiny, safe formatter: paragraphs, "- " lists and **bold**. No HTML. */
function RichText({ text }: { text: string }) {
  // Models sometimes write markdown links; real links only come from cards.
  const plain = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*\[([^\]]+)\]\*\*/g, "**$1**");
  const blocks = plain.trim().split(/\n{2,}/);
  const inline = (line: string, key: number) => (
    <Fragment key={key}>
      {line.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
        part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : part,
      )}
    </Fragment>
  );
  return (
    <>
      {blocks.map((block, b) => {
        const lines = block.split("\n");
        if (lines.every((line) => /^\s*([-*•]|\d+\.)\s+/.test(line))) {
          return (
            <ul key={b}>
              {lines.map((line, i) => (
                <li key={i}>{inline(line.replace(/^\s*([-*•]|\d+\.)\s+/, ""), i)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={b}>
            {lines.map((line, i) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                {inline(line, i)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}

function ToolTrail({ tools, live }: { tools: string[]; live: boolean }) {
  if (!tools.length) return null;
  return (
    <ul className="buddy-tools">
      {tools.map((label, index) => {
        const running = live && index === tools.length - 1;
        return (
          <li data-running={running} key={`${label}-${index}`}>
            {running ? <span aria-hidden className="buddy-tool-dot" /> : <Check aria-hidden className="size-3" />}
            [ {label.toUpperCase()} ]
          </li>
        );
      })}
    </ul>
  );
}

function Message({ message, onNavigate, onRetry }: { message: BuddyMessage; onNavigate?: () => void; onRetry: () => void }) {
  if (message.role === "user") {
    return (
      <motion.li
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="buddy-msg buddy-msg-user"
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
      >
        <div className="buddy-ticket">{message.text}</div>
      </motion.li>
    );
  }

  const streaming = message.state === "streaming";
  return (
    <motion.li
      animate={{ opacity: 1, y: 0 }}
      className="buddy-msg buddy-msg-bot"
      initial={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.25 }}
    >
      <span aria-hidden className="buddy-avatar">
        <Parcel mood={streaming ? (message.text ? "talking" : "thinking") : message.state === "error" ? (message.errorMood ?? "confused") : "idle"} size={30} />
      </span>
      <div className="buddy-msg-stack">
        <ToolTrail live={streaming} tools={message.tools} />
        {(message.text || (streaming && !message.tools.length)) && (
          <div className="buddy-bubble">
            {message.text ? <RichText text={message.text} /> : <TypingDots />}
            {streaming && message.text && <span aria-hidden className="buddy-caret" />}
          </div>
        )}
        {message.cards.map((card, index) => (
          <AssistantCardView card={card} key={index} onNavigate={onNavigate} />
        ))}
        {message.state === "error" && (
          <div className="buddy-error" role="alert">
            <span>{message.error ?? "Something went wrong."}</span>
            <button className="buddy-chip" onClick={onRetry} type="button">
              <RotateCcw aria-hidden className="size-3" /> Try again
            </button>
          </div>
        )}
      </div>
    </motion.li>
  );
}

function TypingDots() {
  return (
    <span aria-label="Buddy is typing" className="buddy-typing" role="status">
      <span />
      <span />
      <span />
    </span>
  );
}

export function AssistantThread({
  firstName,
  variant,
  onNavigate,
  hero,
}: {
  firstName: string;
  variant: "panel" | "page";
  onNavigate?: () => void;
  /** Optional replacement for the empty state (the page uses a big hero). */
  hero?: ReactNode;
}) {
  const path = usePathname() ?? "/";
  const state = useBuddy();
  const conversation = useActiveConversation();
  const messages = conversation?.messages ?? [];
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [pinned, setPinned] = useState(true);
  const [now, setNow] = useState(0);

  const cooling = state.cooldownUntil > now;
  const last = messages.at(-1);
  const contentKey = `${messages.length}:${last?.text.length ?? 0}:${last?.cards.length ?? 0}:${last?.tools.length ?? 0}`;

  // Follow the stream while the reader is at the bottom.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned) el.scrollTop = el.scrollHeight;
  }, [contentKey, pinned]);

  useEffect(() => {
    if (!state.cooldownUntil) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [state.cooldownUntil]);

  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [draft]);

  const submit = (text = draft) => {
    if (!text.trim() || state.busy) return;
    setPinned(true);
    void buddy.send(text, path);
    setDraft("");
    input.current?.focus();
  };

  const remaining = ASSISTANT_LIMITS.maxMessageChars - draft.length;

  return (
    <div className={cn("buddy-thread", variant === "page" && "buddy-thread-page")}>
      <div
        aria-busy={state.busy}
        aria-label="Conversation with Buddy"
        aria-live="polite"
        className="buddy-scroll"
        onScroll={(event) => {
          const el = event.currentTarget;
          setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
        }}
        ref={scroller}
        role="log"
      >
        {messages.length === 0 ? (
          hero ?? (
            <div className="buddy-empty">
              <Parcel mood={state.mood === "idle" ? "wave" : state.mood} size={variant === "page" ? 150 : 112} track />
              <h2 className="buddy-empty-title">
                Hey{firstName ? ` ${firstName}` : ""}, I&apos;m Buddy.
              </h2>
              <p className="buddy-empty-copy">
                Your campus cargo assistant. I can find things to borrow, check your loans and fines, and explain how
                everything works.
              </p>
            </div>
          )
        ) : (
          <ul className="buddy-messages">
            {messages.map((message) => (
              <Message key={message.id} message={message} onNavigate={onNavigate} onRetry={() => buddy.retry(path)} />
            ))}
          </ul>
        )}
      </div>

      <AnimatePresence>
        {!pinned && messages.length > 0 && (
          <motion.button
            animate={{ opacity: 1, y: 0 }}
            className="buddy-jump"
            exit={{ opacity: 0, y: 6 }}
            initial={{ opacity: 0, y: 6 }}
            onClick={() => {
              setPinned(true);
              scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
            }}
            type="button"
          >
            <ArrowDown aria-hidden className="size-3.5" /> Latest
          </motion.button>
        )}
      </AnimatePresence>

      <div className="buddy-composer">
        {(messages.length === 0 || (!state.busy && last?.role === "assistant" && messages.length < 3)) && (
          <div aria-label="Suggestions" className="buddy-suggestions" role="group">
            {suggestionsFor(path).map((suggestion) => (
              <button className="buddy-chip" disabled={state.busy} key={suggestion} onClick={() => submit(suggestion)} type="button">
                {suggestion}
              </button>
            ))}
          </div>
        )}
        <form
          className="buddy-compose-row"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label className="sr-only" htmlFor={`buddy-input-${variant}`}>
            Message Buddy
          </label>
          <textarea
            autoComplete="off"
            data-buddy-input
            id={`buddy-input-${variant}`}
            maxLength={ASSISTANT_LIMITS.maxMessageChars}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={cooling ? "Buddy is catching a breather…" : "Ask Buddy anything…"}
            ref={input}
            rows={1}
            value={draft}
          />
          {state.busy ? (
            <button aria-label="Stop answering" className="buddy-send buddy-stop" onClick={() => buddy.stop()} type="button">
              <Square aria-hidden className="size-3.5" fill="currentColor" />
            </button>
          ) : (
            <button aria-label="Send message" className="buddy-send" disabled={!draft.trim() || cooling} type="submit">
              <ArrowUp aria-hidden className="size-4" strokeWidth={2.6} />
            </button>
          )}
        </form>
        <p className="buddy-footnote">
          {remaining < 200 ? (
            <span className={cn(remaining < 50 && "text-warn")}>{remaining} characters left</span>
          ) : state.mode === "local" ? (
            <span>Quick mode · live catalog and account lookups</span>
          ) : (
            <span>Buddy can slip up. It only sees your own loans and fines.</span>
          )}
        </p>
      </div>
    </div>
  );
}
