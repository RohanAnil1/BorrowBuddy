"use client";

import { Check, Map as MapIcon, MessageCircle, PackagePlus, Search, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { buddy } from "@/components/assistant/buddy-store";
import { Parcel, type ParcelMood } from "@/components/assistant/mascot/parcel";
import { cn } from "@/lib/utils";

/** Parcel waving from the dashboard header with one contextual line. */
export function ParcelGreeting({ line, mood }: { line: string; mood: ParcelMood }) {
  return (
    <div className="flex items-end gap-2">
      <button
        aria-label="Ask Buddy"
        className="shrink-0 rounded-2xl focus-visible:outline-offset-2"
        onClick={() => buddy.setOpen(true)}
        type="button"
      >
        <Parcel mood={mood} size={84} track />
      </button>
      <motion.p
        animate={{ opacity: 1, x: 0 }}
        className="relative mb-6 max-w-[15rem] rounded-2xl rounded-bl-sm bg-paper px-4 py-3 text-left font-body text-[14px] normal-case leading-snug text-black"
        initial={{ opacity: 0, x: -8 }}
        transition={{ delay: 0.3, duration: 0.3 }}
      >
        {line}
      </motion.p>
    </div>
  );
}

const ACTION_CLASS =
  "group flex min-h-[5.5rem] flex-col justify-between gap-3 border border-line bg-panel p-4 text-left transition-colors hover:border-accent focus-visible:border-accent";

/** Four one-tap shortcuts; "Ask Buddy" opens the assistant panel. */
export function QuickActions() {
  const items = [
    { href: "/items/new", label: "List an item", hint: "Lend something you own", icon: PackagePlus },
    { href: "/home", label: "Browse", hint: "See what's on the shelf", icon: Search },
    { href: "/map", label: "Campus map", hint: "Find pickup spots", icon: MapIcon },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(({ href, label, hint, icon: Icon }) => (
        <Link className={ACTION_CLASS} href={href} key={href}>
          <Icon className="size-5 text-accent" />
          <span>
            <span className="block font-strong text-[13px] uppercase">{label}</span>
            <span className="mt-0.5 block text-[12px] normal-case text-ink/65">{hint}</span>
          </span>
        </Link>
      ))}
      <button className={ACTION_CLASS} onClick={() => buddy.setOpen(true)} type="button">
        <MessageCircle className="size-5 text-accent" />
        <span>
          <span className="block font-strong text-[13px] uppercase">Ask Buddy</span>
          <span className="mt-0.5 block text-[12px] normal-case text-ink/65">Rules, loans, anything</span>
        </span>
      </button>
    </div>
  );
}

type Step = { key: string; label: string; href?: string; done: boolean };

function subscribeToStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/**
 * First-week checklist for new students. Derived from data the server already
 * has; "Try Buddy" checks this device's Buddy history. Dismissible per device.
 */
export function GettingStarted({
  userId,
  hasListing,
  hasBorrowed,
  hasAvatar,
}: {
  userId: string;
  hasListing: boolean;
  hasBorrowed: boolean;
  hasAvatar: boolean;
}) {
  const storeKey = `borrowbuddy.onboarding.dismissed.${userId}`;
  // "d|b": dismissed flag and tried-Buddy flag from this device's storage.
  // The server snapshot is null, so nothing renders until the client knows.
  const snapshot = useSyncExternalStore(
    subscribeToStorage,
    () => {
      try {
        const dismissed = localStorage.getItem(storeKey) === "1";
        const history = JSON.parse(localStorage.getItem(`borrowbuddy.buddy.v1.${userId}`) ?? "{}");
        const tried = Array.isArray(history.conversations) && history.conversations.length > 0;
        return `${dismissed ? 1 : 0}|${tried ? 1 : 0}`;
      } catch {
        return "0|0"; // Storage blocked: show the checklist, nothing to remember.
      }
    },
    () => null,
  );
  const [dismissedNow, setDismissedNow] = useState(false);
  const ready = snapshot !== null;
  const dismissed = dismissedNow || snapshot?.startsWith("1|") === true;
  const triedBuddy = snapshot?.endsWith("|1") === true;

  const steps: Step[] = [
    { key: "verified", label: "Get your student ID verified", done: true },
    { key: "borrow", label: "Borrow something", href: "/home", done: hasBorrowed },
    { key: "lend", label: "List your first item", href: "/items/new", done: hasListing },
    { key: "buddy", label: "Ask Buddy a question", done: triedBuddy },
    { key: "avatar", label: "Add a profile photo", href: "/me", done: hasAvatar },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  const complete = doneCount === steps.length;

  const dismiss = () => {
    setDismissedNow(true);
    try {
      localStorage.setItem(storeKey, "1");
    } catch {
      // ignore
    }
  };

  if (!ready || dismissed || complete) return null;

  return (
    <AnimatePresence>
      <motion.section
        animate={{ opacity: 1, y: 0 }}
        aria-labelledby="getting-started"
        className="border border-accent/40 bg-black p-5"
        exit={{ opacity: 0, y: -8 }}
        initial={{ opacity: 0, y: 8 }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="status-bracket flex items-center gap-2 text-[11px]">
              <Sparkles className="size-3.5" /> [ GETTING STARTED ]
            </p>
            <h2 className="type-title mt-2" id="getting-started" style={{ fontSize: "1.6rem" }}>
              {doneCount} of {steps.length} done
            </h2>
          </div>
          <button aria-label="Hide checklist" className="rounded-lg p-2 text-ink/60 hover:bg-ink/5 hover:text-ink" onClick={dismiss} type="button">
            <X className="size-4" />
          </button>
        </div>
        <div aria-hidden className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10">
          <motion.div
            animate={{ width: `${(doneCount / steps.length) * 100}%` }}
            className="h-full rounded-full bg-accent"
            initial={{ width: 0 }}
            transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          />
        </div>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((step) => {
            const body = (
              <>
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border",
                    step.done ? "border-accent bg-accent text-black" : "border-ink/40",
                  )}
                >
                  {step.done && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className={cn("text-[13px] normal-case", step.done ? "text-ink/55 line-through" : "text-ink")}>
                  {step.label}
                </span>
              </>
            );
            const row = "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2";
            return (
              <li key={step.key}>
                {step.done ? (
                  <div className={row}>{body}</div>
                ) : step.key === "buddy" ? (
                  <button className={cn(row, "w-full text-left hover:bg-ink/5")} onClick={() => buddy.setOpen(true)} type="button">
                    {body}
                  </button>
                ) : (
                  <Link className={cn(row, "hover:bg-ink/5")} href={step.href!}>
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </motion.section>
    </AnimatePresence>
  );
}
