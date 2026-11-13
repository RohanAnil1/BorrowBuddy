"use client";

import { Maximize2, Plus, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AssistantThread } from "./assistant-thread";
import { buddy, useBuddy } from "./buddy-store";
import { Parcel } from "./mascot/parcel";

const NUDGES: { match: (path: string) => boolean; text: string }[] = [
  { match: (p) => p.startsWith("/items/"), text: "Want me to explain deposits or handovers?" },
  { match: (p) => p.startsWith("/fines"), text: "I can tell you exactly what you owe." },
  { match: (p) => p.startsWith("/map"), text: "Lost? I know every pickup spot." },
  { match: (p) => p.startsWith("/campus"), text: "Ask me how giveaways or Lost & Found work." },
  { match: () => true, text: "Need something? I can search the shelf for you." },
];

function statusLine(mood: string, mode: string | null, online: boolean): string {
  if (!online) return "OFFLINE";
  if (mood === "thinking") return "SCANNING";
  if (mood === "talking") return "REPLYING";
  if (mood === "sleepy") return "ON A BREAK";
  return mode === "local" ? "ONLINE · QUICK MODE" : "ONLINE";
}

export function AssistantPanelHeader({ onClose, compact = false }: { onClose?: () => void; compact?: boolean }) {
  const state = useBuddy();
  return (
    <header className="buddy-header">
      <span className="buddy-header-mascot">
        <Parcel mood={state.mood} size={compact ? 46 : 54} track />
      </span>
      <div className="buddy-header-copy">
        <h2 className="buddy-header-title" id="buddy-title">
          Buddy
        </h2>
        <p className="buddy-header-status">
          <span aria-hidden className="buddy-live" data-online={state.online} />[ {statusLine(state.mood, state.mode, state.online)} ]
        </p>
      </div>
      <div className="buddy-header-actions">
        <button aria-label="New conversation" className="buddy-icon" onClick={() => buddy.newConversation()} type="button">
          <Plus aria-hidden className="size-4" />
        </button>
        {onClose && (
          <>
            <Link aria-label="Open full Buddy page" className="buddy-icon" href="/assistant" onClick={onClose}>
              <Maximize2 aria-hidden className="size-3.5" />
            </Link>
            <button aria-label="Close Buddy" className="buddy-icon" onClick={onClose} type="button">
              <X aria-hidden className="size-4" />
            </button>
          </>
        )}
      </div>
      <span aria-hidden className="buddy-header-belt" />
    </header>
  );
}

export function AssistantLauncher({ userId, firstName }: { userId: string; firstName: string }) {
  const path = usePathname() ?? "/";
  const state = useBuddy();
  const reduce = useReducedMotion() ?? false;
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [nudge, setNudge] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);

  useEffect(() => buddy.init(userId), [userId]);

  const onPage = path.startsWith("/assistant");
  const lifted = path.startsWith("/items/") || path.startsWith("/chat") || path.startsWith("/campus/collections");

  // One friendly nudge per session, a few seconds after arriving.
  useEffect(() => {
    if (onPage) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem("borrowbuddy.buddy.nudged") === "1";
    } catch {
      seen = true;
    }
    if (seen) return;
    const show = window.setTimeout(() => {
      if (buddy.get().open) return;
      setFresh(true);
      setNudge(NUDGES.find((n) => n.match(path))!.text);
      buddy.poke("wave", 2200);
      try {
        sessionStorage.setItem("borrowbuddy.buddy.nudged", "1");
      } catch {
        // ignore
      }
    }, 3500);
    const hide = window.setTimeout(() => setNudge(null), 13000);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [path, onPage]);

  const restoreFocus = useRef(false);
  const close = useCallback(() => {
    restoreFocus.current = true;
    buddy.setOpen(false);
  }, []);

  // Escape closes; Tab stays inside the dialog on mobile sheet + desktop panel.
  useEffect(() => {
    if (!state.open) return;
    const focusInput = window.setTimeout(() => {
      panel.current?.querySelector<HTMLTextAreaElement>("[data-buddy-input]")?.focus();
    }, 60);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "Tab" && panel.current) {
        const focusable = panel.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusInput);
      document.removeEventListener("keydown", onKey);
    };
  }, [state.open, close]);

  // Leaving for the full page closes the floating panel.
  useEffect(() => {
    if (onPage && buddy.get().open) buddy.setOpen(false);
  }, [onPage]);

  if (onPage) return null;

  return (
    <div className={cn("buddy-dock", lifted && "buddy-dock-lifted", !state.open && "hide-on-keyboard")} data-open={state.open}>
      <AnimatePresence
        onExitComplete={() => {
          // The launcher is hidden behind the mobile sheet until the exit ends.
          if (restoreFocus.current) launcher.current?.focus();
          restoreFocus.current = false;
        }}
      >
        {state.open && (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            aria-labelledby="buddy-title"
            aria-modal="true"
            className="buddy-panel"
            exit={{ opacity: 0, y: reduce ? 0 : 24, scale: reduce ? 1 : 0.96 }}
            initial={{ opacity: 0, y: reduce ? 0 : 32, scale: reduce ? 1 : 0.94 }}
            key="panel"
            ref={panel}
            role="dialog"
            style={{ originX: 1, originY: 1 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
          >
            <AssistantPanelHeader onClose={close} />
            <AssistantThread firstName={firstName} onNavigate={close} variant="panel" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {nudge && !state.open && (
          <motion.div
            animate={{ opacity: 1, x: 0, scale: 1 }}
            className="buddy-nudge"
            exit={{ opacity: 0, x: 8, scale: 0.9 }}
            initial={{ opacity: 0, x: 12, scale: 0.9 }}
            role="status"
            style={{ originX: 1, originY: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 24 }}
          >
            <button
              className="buddy-nudge-text"
              onClick={() => {
                setNudge(null);
                setFresh(false);
                buddy.setOpen(true);
              }}
              type="button"
            >
              {nudge}
            </button>
            <button aria-label="Dismiss tip" className="buddy-nudge-x" onClick={() => setNudge(null)} type="button">
              <X aria-hidden className="size-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        animate={{ y: 0, opacity: 1 }}
        aria-expanded={state.open}
        aria-haspopup="dialog"
        aria-label={state.open ? "Close Buddy assistant" : "Open Buddy assistant"}
        className="buddy-launcher"
        data-open={state.open}
        initial={reduce ? false : { y: 90, opacity: 0 }}
        onClick={() => {
          setNudge(null);
          setFresh(false);
          if (state.open) close();
          else buddy.setOpen(true);
        }}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        ref={launcher}
        transition={{ type: "spring", stiffness: 200, damping: 16, delay: 0.6 }}
        type="button"
        whileTap={reduce ? undefined : { scale: 0.92 }}
      >
        <span aria-hidden className="buddy-launcher-pad" />
        <Parcel mood={state.open ? "happy" : hover && state.mood === "idle" ? "happy" : state.mood} peek={hover} size={74} track />
        {(fresh || (state.busy && !state.open)) && <span aria-hidden className="buddy-launcher-dot" />}
      </motion.button>
    </div>
  );
}
