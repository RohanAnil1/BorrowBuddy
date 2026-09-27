"use client";

import { motion } from "motion/react";
import { EASE } from "@/lib/motion/variants";

/**
 * Animated success sequence fired when a handover state transitions
 * (Accepted → Handed Over / Handed Over → Returned).
 * SVG checkmark draws itself, an accent ring expands, bracket status lands.
 */
export function HandoverSuccess({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center border border-accent/40 bg-accent/5 px-6 py-10 text-center">
      <div className="relative flex items-center justify-center">
        <motion.span
          animate={{ scale: [0.4, 1.15, 1], opacity: [0, 1, 0.25] }}
          className="absolute inset-[-14px] rounded-full border-2 border-accent"
          transition={{ duration: 0.7, ease: EASE, times: [0, 0.7, 1] }}
        />
        <svg className="size-12" fill="none" viewBox="0 0 24 24">
          <motion.path
            animate={{ pathLength: 1, opacity: 1 }}
            d="M4 12.5l5.5 5.5L20 6.5"
            fill="none"
            initial={{ pathLength: 0, opacity: 1 }}
            stroke="#cb840e"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
          />
        </svg>
      </div>

      <p className="status-bracket mt-6 text-[11px]">[ {message} ]</p>
      <p className="font-secondary mt-2 text-[9px] text-ink/50">
        CUSTODY CHAIN UPDATED · SCAN LOGGED
      </p>
    </div>
  );
}
