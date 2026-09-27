"use client";

import { motion } from "motion/react";
import { CloudOff } from "lucide-react";
import { EASE } from "@/lib/motion/variants";
import { TicketTopBar } from "@/components/landing/hero";

export function OfflinePanel() {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="flex w-full max-w-md flex-col items-center border border-line bg-black p-10 text-center"
      initial={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      <TicketTopBar />
      <span className="status-bracket mt-8 text-[11px]">[ SIGNAL LOST ]</span>

      <motion.span
        animate={{ opacity: [0.4, 1, 0.4] }}
        className="mt-6 text-accent"
        transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
      >
        <CloudOff className="size-10" />
      </motion.span>

      <p className="type-body mt-6 text-[13px] leading-6 text-ink/60 uppercase">
        You are offline. Anything you already opened is still here. New items, chats and
        handover codes need a connection.
      </p>

      <a
        className="mt-8 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-strong text-[12px] uppercase text-white transition-opacity hover:opacity-90"
        href="/home"
      >
        <CloudOff className="size-4" />
        Try again
      </a>
    </motion.div>
  );
}
