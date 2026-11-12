"use client";

import { motion, useReducedMotion } from "motion/react";
import { Parcel } from "@/components/assistant/mascot/parcel";
import { EASE } from "@/lib/motion/variants";

/**
 * Plays when a handover is confirmed: Parcel celebrates while an ink stamp
 * ("COLLECTED" / "RETURNED") lands on a paper slip. Reduced motion shows the
 * final state without the thump.
 */
export function HandoverSuccess({ message, kind = "pickup" }: { message: string; kind?: "pickup" | "return" }) {
  const reduce = useReducedMotion() ?? false;
  const stamp = kind === "return" ? "RETURNED" : "COLLECTED";

  return (
    <div className="flex flex-col items-center gap-5 border border-accent/40 bg-accent/5 px-6 py-8 text-center sm:flex-row sm:text-left">
      <Parcel mood="happy" size={110} title="Parcel celebrating" />

      <div className="flex flex-1 flex-col items-center sm:items-start">
        <div className="relative w-full max-w-xs overflow-hidden rounded-md bg-paper px-5 py-4 text-left text-black">
          <p className="font-secondary text-[10px] tracking-[0.14em] text-black/55">CUSTODY RECEIPT</p>
          <p className="mt-1 font-ticket text-[20px] leading-tight">{kind === "return" ? "Item back home" : "Item handed over"}</p>
          <p className="mt-1 font-secondary text-[10px] text-black/55">CHAIN UPDATED · SCAN LOGGED</p>
          <motion.span
            animate={{ opacity: 1, scale: 1, rotate: -12 }}
            aria-hidden
            className="pointer-events-none absolute right-3 top-3 rounded-md border-[3px] border-[#c0261a] px-2.5 py-0.5 font-ticket text-[22px] tracking-[0.08em] text-[#c0261a] mix-blend-multiply"
            initial={reduce ? { opacity: 1, scale: 1, rotate: -12 } : { opacity: 0, scale: 2.6, rotate: -26 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 20, delay: 0.35 }}
          >
            {stamp}
          </motion.span>
        </div>
        <motion.p
          animate={{ opacity: 1, y: 0 }}
          className="status-bracket mt-4 text-[11px]"
          initial={reduce ? false : { opacity: 0, y: 6 }}
          transition={{ delay: 0.6, duration: 0.3, ease: EASE }}
        >
          [ {message} ]
        </motion.p>
      </div>
    </div>
  );
}
