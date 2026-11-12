"use client";

import { CalendarPlus, Check, Clock, X } from "lucide-react";
import { useActionState, useState } from "react";
import { cancelExtension, requestExtension, respondExtension } from "@/app/(app)/loans/actions";
import { idleState } from "@/lib/action-state";
import type { LoanExtension } from "@/lib/data/extensions";
import { SubmitButton } from "./submit-button";

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function prettyDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function Notice({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  return (
    <p
      className={
        tone === "error"
          ? "border border-warn/50 bg-warn/10 px-4 py-3 text-[12px] normal-case text-warn"
          : "border border-accent/50 bg-accent/10 px-4 py-3 text-[12px] normal-case text-accent"
      }
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}

/**
 * Loan extensions on the loan page. The borrower asks for more days (or
 * withdraws a pending ask); the owner approves or declines. The database
 * re-checks every rule, so the date limits here are only a convenience.
 */
export function ExtensionPanel({
  role,
  loanId,
  startDate,
  dueDate,
  maxLoanDays,
  canExtend,
  pending,
  lastAnswered,
  otherName,
}: {
  role: "borrower" | "owner";
  loanId: string;
  startDate: string;
  dueDate: string;
  maxLoanDays: number;
  canExtend: boolean;
  pending: LoanExtension | null;
  lastAnswered: LoanExtension | null;
  otherName: string;
}) {
  const firstName = otherName.split(" ")[0];

  if (pending && role === "owner") {
    return <OwnerDecision extension={pending} firstName={firstName} loanId={loanId} />;
  }
  if (pending) {
    return <BorrowerWaiting extension={pending} firstName={firstName} loanId={loanId} />;
  }
  if (role === "borrower" && canExtend) {
    return (
      <BorrowerAsk
        dueDate={dueDate}
        firstName={firstName}
        lastAnswered={lastAnswered}
        loanId={loanId}
        maxLoanDays={maxLoanDays}
        startDate={startDate}
      />
    );
  }
  if (lastAnswered && lastAnswered.status !== "cancelled") {
    return (
      <section className="border border-line bg-panel p-6">
        <p className="font-secondary text-[11px] uppercase text-ink/60">[ EXTENSION ]</p>
        <p className="mt-2 text-[13px] normal-case text-ink/75">
          {lastAnswered.status === "approved"
            ? `Extended to ${prettyDate(lastAnswered.new_due_date)}.`
            : `A request for ${prettyDate(lastAnswered.new_due_date)} was declined.`}
        </p>
      </section>
    );
  }
  return null;
}

function BorrowerAsk({
  loanId,
  startDate,
  dueDate,
  maxLoanDays,
  firstName,
  lastAnswered,
}: {
  loanId: string;
  startDate: string;
  dueDate: string;
  maxLoanDays: number;
  firstName: string;
  lastAnswered: LoanExtension | null;
}) {
  const [state, formAction] = useActionState(requestExtension, idleState);
  const [open, setOpen] = useState(false);
  const min = addDays(dueDate, 1);
  const max = addDays(startDate, maxLoanDays - 1);
  const [value, setValue] = useState(min);
  const atLimit = min > max;
  const quick = [1, 2, 3, 7].map((days) => addDays(dueDate, days)).filter((date) => date <= max);

  return (
    <section aria-labelledby="extension-heading" className="border border-line bg-panel p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-secondary text-[11px] uppercase text-ink" id="extension-heading">
            <CalendarPlus className="size-4 text-accent" /> [ NEED MORE DAYS? ]
          </h2>
          <p className="mt-2 max-w-md text-[13px] normal-case leading-6 text-ink/70">
            {atLimit
              ? `This loan is already at the item's ${maxLoanDays}-day maximum.`
              : `Ask ${firstName} to keep it longer. Due now: ${prettyDate(dueDate)}.`}
          </p>
          {lastAnswered?.status === "declined" && (
            <p className="mt-1 text-[12px] normal-case text-ink/55">
              Your last request ({prettyDate(lastAnswered.new_due_date)}) was declined.
            </p>
          )}
        </div>
        {!atLimit && !open && state.status !== "success" && (
          <button
            className="rounded-lg border border-line px-4 py-2.5 font-strong text-[12px] uppercase transition-colors hover:border-accent hover:text-accent"
            onClick={() => setOpen(true)}
            type="button"
          >
            Ask for more days
          </button>
        )}
      </div>

      {state.status === "success" && (
        <div className="mt-4">
          <Notice tone="success">{state.message}</Notice>
        </div>
      )}

      {open && !atLimit && state.status !== "success" && (
        <form action={formAction} className="mt-5 flex flex-col gap-4">
          <input name="loan_id" type="hidden" value={loanId} />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Quick picks">
            {quick.map((date) => (
              <button
                aria-pressed={value === date}
                className={
                  value === date
                    ? "rounded-full border border-accent bg-accent/15 px-3 py-1.5 text-[12px] text-accent"
                    : "rounded-full border border-line px-3 py-1.5 text-[12px] text-ink/75 hover:border-accent"
                }
                key={date}
                onClick={() => setValue(date)}
                type="button"
              >
                +{daysBetween(dueDate, date)} {daysBetween(dueDate, date) === 1 ? "day" : "days"}
              </button>
            ))}
          </div>
          <label className="flex w-fit items-center gap-3 rounded-lg border border-line bg-black px-3 py-2 focus-within:border-accent">
            <span className="font-secondary text-[9px] text-ink/50">NEW DUE DATE</span>
            <input
              className="bg-transparent text-[14px] text-ink outline-none"
              max={max}
              min={min}
              name="new_due_date"
              onChange={(event) => setValue(event.target.value)}
              required
              type="date"
              value={value}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="font-secondary text-[9px] text-ink/50">NOTE FOR {firstName.toUpperCase()} (OPTIONAL)</span>
            <textarea
              className="min-h-16 w-full max-w-lg rounded-lg border border-line bg-black px-4 py-3 text-[14px] normal-case outline-none placeholder:text-ink/30 focus:border-accent"
              maxLength={300}
              name="message"
              placeholder="Why you need it a bit longer"
            />
          </label>
          {state.status === "error" && <Notice tone="error">{state.message}</Notice>}
          <div className="flex flex-wrap gap-2">
            <SubmitButton pendingLabel="SENDING…">Send request</SubmitButton>
            <button
              className="rounded-lg px-4 py-2.5 font-strong text-[12px] uppercase text-ink/60 hover:text-ink"
              onClick={() => setOpen(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function BorrowerWaiting({ extension, loanId, firstName }: { extension: LoanExtension; loanId: string; firstName: string }) {
  const [state, formAction] = useActionState(cancelExtension, idleState);
  if (state.status === "success") {
    return (
      <section className="border border-line bg-panel p-6">
        <Notice tone="success">{state.message}</Notice>
      </section>
    );
  }
  return (
    <section className="border border-accent/40 bg-accent/5 p-6">
      <p className="flex items-center gap-2 font-secondary text-[11px] uppercase text-accent">
        <Clock className="size-4" /> [ EXTENSION PENDING ]
      </p>
      <p className="mt-2 text-[13px] normal-case leading-6 text-ink/80">
        You asked {firstName} to keep it until <strong>{prettyDate(extension.new_due_date)}</strong> (+
        {daysBetween(extension.previous_due_date, extension.new_due_date)} days). Until they answer, it&apos;s still due{" "}
        {prettyDate(extension.previous_due_date)}.
      </p>
      <form action={formAction} className="mt-4 flex flex-col gap-3">
        <input name="extension_id" type="hidden" value={extension.id} />
        <input name="loan_id" type="hidden" value={loanId} />
        {state.status === "error" && <Notice tone="error">{state.message}</Notice>}
        <div>
          <SubmitButton pendingLabel="WITHDRAWING…" variant="secondary">
            Withdraw request
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}

function OwnerDecision({ extension, loanId, firstName }: { extension: LoanExtension; loanId: string; firstName: string }) {
  const [state, formAction] = useActionState(respondExtension, idleState);
  if (state.status === "success") {
    return (
      <section className="border border-line bg-panel p-6">
        <Notice tone="success">{state.message}</Notice>
      </section>
    );
  }
  const extra = daysBetween(extension.previous_due_date, extension.new_due_date);
  return (
    <section aria-labelledby="extension-decision" className="border border-accent/60 bg-accent/5 p-6">
      <h2 className="flex items-center gap-2 font-secondary text-[11px] uppercase text-accent" id="extension-decision">
        <CalendarPlus className="size-4" /> [ {firstName.toUpperCase()} WANTS MORE DAYS ]
      </h2>
      <p className="mt-2 text-[13px] normal-case leading-6 text-ink/80">
        Keep it until <strong>{prettyDate(extension.new_due_date)}</strong> instead of {prettyDate(extension.previous_due_date)} (+
        {extra} {extra === 1 ? "day" : "days"}).
      </p>
      {extension.message && (
        <p className="mt-3 max-w-xl border border-line bg-black px-4 py-3 text-[13px] normal-case leading-6 text-ink/75">
          “{extension.message}”
        </p>
      )}
      <form action={formAction} className="mt-4 flex flex-col gap-3">
        <input name="extension_id" type="hidden" value={extension.id} />
        <input name="loan_id" type="hidden" value={loanId} />
        {state.status === "error" && <Notice tone="error">{state.message}</Notice>}
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-strong text-[13px] uppercase text-white hover:opacity-90"
            name="decision"
            type="submit"
            value="approve"
          >
            <Check className="size-4" /> Approve
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 font-strong text-[13px] uppercase hover:border-warn hover:text-warn"
            name="decision"
            type="submit"
            value="decline"
          >
            <X className="size-4" /> Decline
          </button>
        </div>
      </form>
    </section>
  );
}
