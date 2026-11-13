"use client";

import { AlertTriangle, Check, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import type { Flash } from "@/lib/flash";

const SHOW_MS = 4500;

/**
 * Shows the toast a server action queued with flash(). Each flash shows once:
 * the cookie is cleared as soon as it renders, and dismissed ids are remembered.
 */
export function ActionToaster({ flash }: { flash: Flash | null }) {
  const reduce = useReducedMotion() ?? false;
  const [dismissed, setDismissed] = useState<string[]>([]);
  const visible = flash && !dismissed.includes(flash.id) ? flash : null;

  useEffect(() => {
    if (!flash) return;
    document.cookie = "bb-flash=; Max-Age=0; path=/; SameSite=Lax";
    const id = flash.id;
    const timer = window.setTimeout(() => setDismissed((list) => [...list, id]), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [flash]);

  return (
    <div
      aria-live={visible?.tone === "error" ? "assertive" : "polite"}
      className="hide-on-keyboard pointer-events-none fixed inset-x-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-50 flex justify-center sm:bottom-[calc(2rem+env(safe-area-inset-bottom))] sm:left-[calc(2rem+env(safe-area-inset-left))] sm:right-auto sm:justify-start"
    >
      <AnimatePresence>
        {visible && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className={
              visible.tone === "error"
                ? "pointer-events-auto flex max-w-sm items-start gap-3 border border-warn/60 bg-black/95 px-4 py-3 shadow-2xl backdrop-blur"
                : "pointer-events-auto flex max-w-sm items-start gap-3 border border-accent/60 bg-black/95 px-4 py-3 shadow-2xl backdrop-blur"
            }
            exit={{ opacity: 0, y: reduce ? 0 : 12 }}
            initial={{ opacity: 0, y: reduce ? 0 : 12 }}
            key={visible.id}
            role={visible.tone === "error" ? "alert" : "status"}
          >
            {visible.tone === "error" ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
            ) : (
              <Check className="mt-0.5 size-4 shrink-0 text-accent" />
            )}
            <p className="text-[13px] normal-case leading-5 text-ink">{visible.message}</p>
            <button
              aria-label="Dismiss"
              className="-mr-1 rounded p-1 text-ink/50 hover:text-ink"
              onClick={() => setDismissed((list) => [...list, visible.id])}
              type="button"
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
