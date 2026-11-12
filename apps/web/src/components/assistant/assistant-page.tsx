"use client";

import { MessageSquareText, Package, Receipt, ScrollText, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AssistantPanelHeader } from "./assistant-launcher";
import { AssistantThread } from "./assistant-thread";
import { buddy, useBuddy } from "./buddy-store";
import { LoanBoardingPass, type BoardingPassLoan } from "@/components/app/loan-boarding-pass";
import { Parcel, type ParcelMood } from "./mascot/parcel";

const STARTERS = [
  { icon: Package, label: "Find gear", prompt: "Find a calculator for this weekend" },
  { icon: MessageSquareText, label: "My loans", prompt: "When are my loans due?" },
  { icon: Receipt, label: "My ledger", prompt: "Do I owe any fines?" },
  { icon: ScrollText, label: "The rules", prompt: "How does the trust score work?" },
];

/** Fake loans for the design sheet only (never real data). */
const SAMPLE_PASSES: BoardingPassLoan[] = [
  { id: "00000000-0000-4000-8000-00000000a001", title: "Scientific calculator", status: "active", statusLabel: "Borrowed", ownerName: "Ishita Rao", borrowerName: "You", role: "borrowing", pickupSpot: "Maggi Hotspot", startDate: new Date(Date.now() + -3 * 86_400_000).toISOString().slice(0, 10), dueDate: new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10) },
  { id: "00000000-0000-4000-8000-00000000a002", title: "Cricket bat", status: "active", statusLabel: "Borrowed", ownerName: "Aryan Mehta", borrowerName: "You", role: "borrowing", pickupSpot: "Sports Complex", startDate: new Date(Date.now() + -1 * 86_400_000).toISOString().slice(0, 10), dueDate: new Date(Date.now() + 0 * 86_400_000).toISOString().slice(0, 10) },
  { id: "00000000-0000-4000-8000-00000000a003", title: "Drafting kit", status: "overdue", statusLabel: "Overdue", ownerName: "You", borrowerName: "Kabir Shah", role: "lending", pickupSpot: "D5 Stage", startDate: new Date(Date.now() + -6 * 86_400_000).toISOString().slice(0, 10), dueDate: new Date(Date.now() + -2 * 86_400_000).toISOString().slice(0, 10) },
  { id: "00000000-0000-4000-8000-00000000a004", title: "Phone tripod", status: "active", statusLabel: "Borrowed", ownerName: "Mira Iyer", borrowerName: "You", role: "borrowing", pickupSpot: null, startDate: new Date(Date.now() + 0 * 86_400_000).toISOString().slice(0, 10), dueDate: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10) },
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
        <p className="status-bracket text-[10px]">[ DESIGN SHEET · BOARDING PASSES ]</p>
        <div className="rail-scroll mb-10 mt-4 flex gap-4 overflow-x-auto pb-4">
          {SAMPLE_PASSES.map((pass, index) => (
            <LoanBoardingPass key={pass.id} loan={pass} stamp={index === 3 ? "COLLECTED" : undefined} />
          ))}
        </div>
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
