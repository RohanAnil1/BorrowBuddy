"use client";

import { Heart } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useOptimistic, useTransition } from "react";
import { toggleSavedItem } from "@/app/(app)/items/actions";
import { cn } from "@/lib/utils";

/**
 * Heart toggle for saving an item. Flips instantly (optimistic) and rolls back
 * if the server action fails. `variant="overlay"` sits on an item card photo.
 */
export function SaveButton({
  itemId,
  saved,
  title,
  variant = "overlay",
}: {
  itemId: string;
  saved: boolean;
  title: string;
  variant?: "overlay" | "inline";
}) {
  const reduce = useReducedMotion() ?? false;
  const [optimistic, setOptimistic] = useOptimistic(saved);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !optimistic;
    startTransition(async () => {
      setOptimistic(next);
      const form = new FormData();
      form.set("item_id", itemId);
      form.set("save", next ? "1" : "0");
      await toggleSavedItem(form);
    });
  }

  const label = optimistic ? `Remove ${title} from saved` : `Save ${title} for later`;

  return (
    <button
      aria-label={label}
      aria-pressed={optimistic}
      className={cn(
        "flex items-center justify-center gap-2 transition-colors focus-visible:outline-offset-2",
        variant === "overlay"
          ? "size-10 rounded-full bg-black/70 text-ink backdrop-blur hover:bg-black"
          : "rounded-lg border border-line px-4 py-2 font-strong text-[11px] uppercase hover:border-accent",
      )}
      onClick={(event) => {
        // Cards are links; keep the tap on the heart.
        event.preventDefault();
        event.stopPropagation();
        toggle();
      }}
      title={label}
      type="button"
    >
      <motion.span
        animate={optimistic && !reduce ? { scale: [1, 1.3, 1] } : { scale: 1 }}
        className="flex"
        key={optimistic ? "on" : "off"}
        transition={{ duration: 0.3 }}
      >
        <Heart className={cn("size-[18px]", optimistic ? "fill-accent text-accent" : "text-ink")} />
      </motion.span>
      {variant === "inline" && <span>{optimistic ? "Saved" : "Save"}</span>}
    </button>
  );
}
