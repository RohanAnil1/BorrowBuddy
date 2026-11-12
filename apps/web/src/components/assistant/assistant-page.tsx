"use client";

import { MessageSquareText, Package, Receipt, ScrollText, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AssistantPanelHeader } from "./assistant-launcher";
import { AssistantThread } from "./assistant-thread";
import { buddy, useBuddy } from "./buddy-store";
import { Parcel, type ParcelMood } from "./mascot/parcel";

const STARTERS = [
  { icon: Package, label: "Find gear", prompt: "Find a calculator for this weekend" },
  { icon: MessageSquareText, label: "My loans", prompt: "When are my loans due?" },
  { icon: Receipt, label: "My ledger", prompt: "Do I owe any fines?" },
  { icon: ScrollText, label: "The rules", prompt: "How does the trust score work?" },
];

const MOODS: ParcelMood[] = ["idle", "wave", "thinking", "talking", "happy", "found", "confused", "sleepy", "offline"];

function Hero({ firstName }: { firstName: string }) {
  const state = useBuddy();
  const path = usePathname() ?? "/assistant";
  return (
    <div className="buddy-hero">
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="buddy-hero-stage"
        initial={{ opacity: 0, y: 24 }}
        transition={{ type: "spring", stiffness: 160, damping: 18 }}
      >
        <span aria-hidden className="buddy-hero-ring" />
        <Parcel mood={state.mood === "idle" ? "wave" : state.mood} size={210} title="Parcel, Buddy's mascot" track />
      </motion.div>
      <p className="status-bracket text-[10px]">[ CARGO DESK OPEN ]</p>
      <h1 className="type-title buddy-hero-title">
        Hey{firstName ? ` ${firstName}` : ""}, what do you need?
      </h1>
      <p className="buddy-empty-copy">
        I&apos;m Buddy. I search the live shelf, keep an eye on your loans and fines, and know every rule by heart.
      </p>
      <div className="buddy-starters">
        {STARTERS.map(({ icon: Icon, label, prompt }, index) => (
          <motion.button
            animate={{ opacity: 1, y: 0 }}
            className="buddy-starter"
            disabled={state.busy}
            initial={{ opacity: 0, y: 12 }}
            key={label}
            onClick={() => void buddy.send(prompt, path)}
            onPointerEnter={() => buddy.poke("happy", 900)}
            transition={{ delay: 0.15 + index * 0.06 }}
            type="button"
          >
            <Icon aria-hidden className="size-4 text-accent" />
            <span className="buddy-starter-label">{label}</span>
            <span className="buddy-starter-prompt">{prompt}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

export function AssistantPage({ firstName, showSheet }: { firstName: string; showSheet: boolean }) {
  const state = useBuddy();

  if (showSheet) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 dt:px-10">
        <p className="status-bracket text-[10px]">[ PARCEL · MOOD SHEET ]</p>
        <div className="buddy-sheet">
          {MOODS.map((mood) => (
            <figure key={mood}>
              <Parcel mood={mood} size={150} track />
              <figcaption>{mood}</figcaption>
              <div className="buddy-sheet-small">
                <Parcel mood={mood} size={28} />
                <Parcel mood={mood} size={54} />
              </div>
            </figure>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="buddy-page">
      <aside aria-label="Past conversations" className="buddy-history">
        <button className="buddy-history-new" onClick={() => buddy.newConversation()} type="button">
          + New conversation
        </button>
        <p className="buddy-card-label">[ HISTORY ]</p>
        {state.hydrated && state.conversations.length === 0 && (
          <p className="buddy-history-empty">Your chats with Buddy stay on this device.</p>
        )}
        <ul>
          {state.conversations.map((conversation) => (
            <li key={conversation.id}>
              <button
                aria-current={conversation.id === state.activeId}
                className={cn("buddy-history-item", conversation.id === state.activeId && "is-active")}
                onClick={() => buddy.select(conversation.id)}
                type="button"
              >
                <span className="buddy-history-title">{conversation.title || "New conversation"}</span>
                <span className="buddy-history-time">{relativeTime(new Date(conversation.updatedAt).toISOString())}</span>
              </button>
              <button
                aria-label={`Delete conversation: ${conversation.title}`}
                className="buddy-history-delete"
                onClick={() => buddy.remove(conversation.id)}
                type="button"
              >
                <Trash2 aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section aria-labelledby="buddy-title" className="buddy-page-main">
        <AssistantPanelHeader compact />
        <AssistantThread firstName={firstName} hero={<Hero firstName={firstName} />} variant="page" />
      </section>
    </div>
  );
}
