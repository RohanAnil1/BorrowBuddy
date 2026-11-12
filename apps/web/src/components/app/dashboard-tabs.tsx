"use client";

import { EmptyState } from "./empty-state";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { StatusBadge, loanTone } from "./status-badge";
import { formatDateRange, loanStatusLabel } from "@/lib/format";
import type { LoanWithParties } from "@borrowbuddy/shared";

type LoanRow = {
  id: string;
  title: string;
  partyName: string;
  partyRole: "FROM" | "TO";
  status: string;
  range: string;
};

function toRow(loan: LoanWithParties, view: "borrowing" | "lending"): LoanRow {
  return {
    id: loan.id,
    title: loan.item.title,
    partyName:
      view === "borrowing" ? loan.owner.full_name : loan.borrower.full_name,
    partyRole: view === "borrowing" ? "FROM" : "TO",
    status: loan.status,
    range: formatDateRange(loan.start_date, loan.due_date),
  };
}

export function DashboardTabs({
  borrowing,
  lending,
}: {
  borrowing: LoanWithParties[];
  lending: LoanWithParties[];
}) {
  const [tab, setTab] = useState<"borrowing" | "lending">("borrowing");
  const rows = (tab === "borrowing" ? borrowing : lending).map((loan) => toRow(loan, tab));

  return (
    <section>
      <div className="relative flex border-b border-line">
        {(
          [
            ["borrowing", `BORROWING (${borrowing.length})`],
            ["lending", `LENDING (${lending.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            className="relative flex-1 px-4 py-3 font-secondary text-[11px] uppercase transition-colors"
            key={key}
            onClick={() => setTab(key)}
            type="button"
          >
            <span className={tab === key ? "text-accent" : "text-ink/50"}>{label}</span>
            {tab === key && (
              <motion.span
                className="absolute inset-x-0 bottom-[-1px] h-0.5 bg-accent"
                layoutId="dash-tab-line"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence initial={false} mode="wait">
        <motion.div
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: tab === "borrowing" ? -16 : 16 }}
          initial={{ opacity: 0, x: tab === "borrowing" ? 16 : -16 }}
          key={tab}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        >
          {rows.length === 0 ? (
            <EmptyState
              body={
                tab === "borrowing"
                  ? "Things you borrow show up here until they're back with their owner."
                  : "When someone borrows from you, you'll track it here."
              }
              className="border-t-0"
              code={tab === "borrowing" ? "NOTHING BORROWED" : "NOTHING LENT"}
              compact
              mood="idle"
              title={tab === "borrowing" ? "Your hands are free" : "Your shelf is all yours"}
            />
          ) : (
            <ul className="border-x border-b border-line">
              {rows.map((row) => (
                <li className="border-b border-line last:border-b-0" key={row.id}>
                  <Link
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 transition-colors hover:bg-ink/5"
                    href={`/loans/${row.id}`}
                  >
                    <div className="min-w-0">
                      <p className="type-body-alt truncate text-[14px] uppercase">{row.title}</p>
                      <p className="font-secondary mt-1 text-[9px] text-ink/50">
                        {row.partyRole} {row.partyName.toUpperCase()} · {row.range}
                      </p>
                    </div>
                    <StatusBadge tone={loanTone(row.status)}>
                      {loanStatusLabel(row.status as never)}
                    </StatusBadge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
