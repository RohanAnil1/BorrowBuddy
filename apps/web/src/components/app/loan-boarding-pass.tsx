"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type BoardingPassLoan = {
  id: string;
  title: string;
  status: string;
  statusLabel: string;
  ownerName: string;
  borrowerName: string;
  /** "borrowing" when the viewer is the borrower. */
  role: "borrowing" | "lending";
  pickupSpot: string | null;
  startDate: string;
  dueDate: string;
};

type Tone = "calm" | "soon" | "late" | "done";

/** Due at 23:59 campus time (IST) on the due date. */
function dueInstant(dueDate: string) {
  return new Date(`${dueDate}T23:59:00+05:30`).getTime();
}

function countdown(dueDate: string, status: string, now: number): { text: string; tone: Tone } {
  if (["returned", "cancelled", "lost"].includes(status)) return { text: "Closed", tone: "done" };
  const ms = dueInstant(dueDate) - now;
  if (status === "overdue" || ms < 0) {
    const days = Math.max(1, Math.ceil(-ms / 86_400_000));
    return { text: `${days}d overdue`, tone: "late" };
  }
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  const text = days > 0 ? `${days}d ${hours % 24}h left` : hours > 0 ? `${hours}h left` : `${Math.max(1, Math.floor(ms / 60_000))}m left`;
  return { text, tone: hours < 24 ? "soon" : "calm" };
}

const TONE: Record<Tone, string> = {
  calm: "text-[#0b6b3a]",
  soon: "text-[#b25e00]",
  late: "text-[#c0261a]",
  done: "text-black/50",
};

function shortDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${iso}T00:00:00Z`))
    .toUpperCase();
}

function shortName(name: string) {
  const [first, last] = name.trim().split(/\s+/);
  return (last ? `${first} ${last[0]}.` : first ?? "Student").toUpperCase();
}

/**
 * A loan as a thermal-paper boarding pass: route (owner → borrower), pickup
 * gate, due date with a live countdown, status stamp and a QR to the loan.
 * Pass `stamp` to play the "COLLECTED"/"RETURNED" stamp after a handover.
 */
export function LoanBoardingPass({
  loan,
  stamp,
  className,
}: {
  loan: BoardingPassLoan;
  stamp?: "COLLECTED" | "RETURNED";
  className?: string;
}) {
  const reduce = useReducedMotion() ?? false;
  const [now, setNow] = useState<number | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(`${window.location.origin}/loans/${loan.id}`, { margin: 0, scale: 4, errorCorrectionLevel: "M" })
      .then((url) => !cancelled && setQr(url))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loan.id]);

  const due = now === null ? null : countdown(loan.dueDate, loan.status, now);
  const code = loan.id.replace(/-/g, "").slice(0, 6).toUpperCase();

  return (
    <article
      aria-label={`Boarding pass for ${loan.title}, ${loan.statusLabel}, due ${shortDate(loan.dueDate)}`}
      className={cn("boarding-pass relative w-[19rem] shrink-0 snap-start text-black", className)}
    >
      <Link className="block focus-visible:outline-offset-4" href={`/loans/${loan.id}`}>
        {/* stub: route + item */}
        <div className="rounded-t-lg bg-paper px-4 pb-3 pt-3">
          <div className="flex items-center justify-between font-secondary text-[10px] tracking-[0.14em] text-black/55">
            <span>BOARDING PASS</span>
            <span>BB-{code}</span>
          </div>
          <div className="mt-2 flex items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="font-secondary text-[10px] text-black/50">FROM</p>
              <p className="truncate font-ticket text-[19px] leading-none">{shortName(loan.ownerName)}</p>
            </div>
            <span aria-hidden className="pb-0.5 font-ticket text-[18px] text-accent">✈</span>
            <div className="min-w-0 text-right">
              <p className="font-secondary text-[10px] text-black/50">TO</p>
              <p className="truncate font-ticket text-[19px] leading-none">{shortName(loan.borrowerName)}</p>
            </div>
          </div>
          <p className="mt-3 line-clamp-1 font-strong text-[14px] uppercase">{loan.title}</p>
        </div>

        {/* perforation */}
        <div aria-hidden className="boarding-pass-perf relative h-4 bg-paper">
          <span className="absolute inset-x-4 top-1/2 border-t-2 border-dashed border-black/20" />
        </div>

        {/* details */}
        <div className="grid grid-cols-[1fr_auto] gap-3 rounded-b-lg bg-paper px-4 pb-4 pt-2">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
            <div>
              <dt className="font-secondary text-[10px] text-black/50">GATE</dt>
              <dd className="truncate font-strong text-[12px] uppercase">{loan.pickupSpot ?? "In chat"}</dd>
            </div>
            <div>
              <dt className="font-secondary text-[10px] text-black/50">DUE</dt>
              <dd className="font-strong text-[12px]">{shortDate(loan.dueDate)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="font-secondary text-[10px] text-black/50">STATUS</dt>
              <dd className="flex items-center gap-2 font-strong text-[12px] uppercase">
                {loan.statusLabel}
                {due && <span className={cn("font-secondary text-[11px] normal-case", TONE[due.tone])}>· {due.text}</span>}
              </dd>
            </div>
          </dl>
          <div className="flex size-[4.25rem] items-center justify-center bg-white p-1">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" className="size-full [image-rendering:pixelated]" src={qr} />
            ) : (
              <span className="size-full bg-black/5" />
            )}
          </div>
        </div>
      </Link>

      <AnimatePresence>
        {stamp && (
          <motion.span
            animate={{ opacity: 1, scale: 1, rotate: -14 }}
            aria-hidden
            className="pointer-events-none absolute right-6 top-14 rounded-md border-[3px] border-[#c0261a] px-3 py-1 font-ticket text-[24px] tracking-[0.08em] text-[#c0261a] mix-blend-multiply"
            initial={reduce ? { opacity: 1, scale: 1, rotate: -14 } : { opacity: 0, scale: 2.4, rotate: -24 }}
            transition={{ type: "spring", stiffness: 520, damping: 22, delay: reduce ? 0 : 0.25 }}
          >
            {stamp}
          </motion.span>
        )}
      </AnimatePresence>
    </article>
  );
}
