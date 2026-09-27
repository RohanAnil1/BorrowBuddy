"use client";

import Link from "next/link";
import { motion } from "motion/react";

export type TickerLoan = {
  id: string;
  title: string;
  party: string;
  dueDate: string;
  status: string;
  tone: "info" | "active" | "warn" | "danger";
};

const TONE_LABELS: Record<TickerLoan["tone"], string> = {
  info: "[ PICKUP READY ]",
  active: "[ RETURN ]",
  warn: "[ DUE TODAY ]",
  danger: "[ OVERDUE ]",
};

const TONE_CLASS: Record<TickerLoan["tone"], string> = {
  info: "border-ink/50 bg-black text-ink",
  active: "border-accent/60 text-accent",
  warn: "border-warn/60 bg-warn/10 text-warn",
  danger: "border-warn bg-warn/20 text-warn",
};

export function LoansTicker({ loans }: { loans: TickerLoan[] }) {
  if (loans.length === 0) {
    return (
      <div className="border border-line bg-panel px-4 py-5">
        <p className="font-secondary text-[10px] text-ink/50">
          [ NOTHING MOVING RIGHT NOW — BROWSE THE CATALOG ]
        </p>
      </div>
    );
  }

  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1">
      {loans.map((loan) => (
        <Link
          className="w-64 shrink-0 snap-start border border-line bg-panel p-4 transition-colors hover:border-accent"
          href={`/loans/${loan.id}`}
          key={loan.id}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="type-body-alt truncate text-[13px] uppercase">{loan.title}</p>
            <motion.span
              animate={loan.tone === "danger" ? { opacity: [1, 0.45, 1] } : {}}
              className={`border px-1.5 py-0.5 font-secondary text-[8px] uppercase ${TONE_CLASS[loan.tone]}`}
              transition={loan.tone === "danger" ? { repeat: Infinity, duration: 1.6 } : {}}
            >
              {TONE_LABELS[loan.tone]}
            </motion.span>
          </div>
          <p className="font-secondary mt-2 text-[9px] text-ink/50">
            {loan.party.toUpperCase()} · {loan.dueDate}
          </p>
        </Link>
      ))}
    </div>
  );
}
