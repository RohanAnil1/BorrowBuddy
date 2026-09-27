"use client";

import { useMemo, useState } from "react";
import {
  addDays,
  eachDateInRange,
  formatDateString,
  parseDateString,
  todayString,
  type AvailabilityWindow,
} from "@borrowbuddy/shared";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function monthMatrix(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month, 1));
  const startWeekday = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(formatDateString(new Date(Date.UTC(year, month, day))));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function AvailabilityCalendar({
  windows,
  maxLoanDays,
  start,
  end,
  onChange,
  verified,
}: {
  windows: AvailabilityWindow[];
  maxLoanDays: number;
  start: string | null;
  end: string | null;
  onChange: (next: { start: string | null; end: string | null }) => void;
  verified: "idle" | "checking" | "ok" | "fail";
}) {
  const [error, setError] = useState<string | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);

  const blocked = useMemo(() => {
    const set = new Set<string>();
    for (const window of windows) {
      for (const date of eachDateInRange(window.start_date, window.end_date)) set.add(date);
    }
    return set;
  }, [windows]);

  const today = todayString();
  const base = parseDateString(today);
  const view = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + monthOffset, 1));
  const monthLabel = new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(view);

  const cells = monthMatrix(view.getUTCFullYear(), view.getUTCMonth());

  function select(date: string) {
    setError(null);

    if (blocked.has(date) || date < today) return;

    if (!start || (start && end)) {
      onChange({ start: date, end: null });
      return;
    }

    if (date < start) {
      onChange({ start: date, end: null });
      return;
    }

    const span = eachDateInRange(start, date);
    if (span.length > maxLoanDays) {
      setError(`This item can be borrowed for at most ${maxLoanDays} days.`);
      onChange({ start: date, end: null });
      return;
    }
    if (span.some((day) => blocked.has(day))) {
      setError("That range crosses dates the item is already booked for.");
      onChange({ start: date, end: null });
      return;
    }

    onChange({ start, end: date });
  }

  const inRange = (date: string) => start && end && date >= start && date <= end;
  const isEdge = (date: string) => date === start || date === end;

  return (
    <div className="border border-line bg-panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <button
          className="rounded-lg border border-line px-3 py-1.5 font-secondary text-[9px] text-ink/60 transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
          disabled={monthOffset === 0}
          onClick={() => setMonthOffset((value) => Math.max(0, value - 1))}
          type="button"
        >
          ← PREV
        </button>
        <p className="font-secondary text-[11px] uppercase text-ink">{monthLabel}</p>
        <button
          className="rounded-lg border border-line px-3 py-1.5 font-secondary text-[9px] text-ink/60 transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
          disabled={monthOffset >= 2}
          onClick={() => setMonthOffset((value) => Math.min(2, value + 1))}
          type="button"
        >
          NEXT →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((day) => (
          <span
            className="pb-2 font-secondary text-[8px] text-ink/40"
            key={day}
          >
            {day.toUpperCase()}
          </span>
        ))}

        {cells.map((date, index) => {
          if (!date) return <span key={`empty-${index}`} />;

          const isBlocked = blocked.has(date);
          const isPast = date < today;

          return (
            <button
              className={cn(
                "aspect-square rounded-xs text-[13px] transition-colors",
                isPast && "cursor-not-allowed text-ink/20",
                isBlocked && !isPast && "cursor-not-allowed bg-ink/10 text-ink/30 line-through",
                !isPast && !isBlocked && "hover:bg-accent/15 text-ink",
                inRange(date) && !isBlocked && "bg-accent/15",
                isEdge(date) && "bg-accent text-white hover:bg-accent",
              )}
              disabled={isBlocked || isPast}
              key={date}
              onClick={() => select(date)}
              type="button"
            >
              {Number(date.slice(-2))}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-line pt-4 font-secondary text-[9px] text-ink/50">
        <span className="flex items-center gap-1.5">
          <span className="size-3 bg-ink/15" /> BOOKED
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 bg-accent" /> YOUR DATES
        </span>
        <span className="ml-auto font-secondary text-[9px] uppercase">
          {start
            ? end
              ? `${start} → ${end}`
              : `${start} → PICK AN END DATE`
            : "PICK A START DATE"}
        </span>
      </div>

      <div className="mt-4 flex min-h-8 items-center">
        {verified === "checking" && (
          <p className="font-secondary text-[10px] text-warn">[ CHECKING THE SHELF CALENDAR… ]</p>
        )}
        {verified === "ok" && (
          <p className="font-secondary text-[10px] text-accent">[ SLOT CLEAR — READY TO DISPATCH ]</p>
        )}
        {verified === "fail" && (
          <p className="font-secondary text-[10px] text-warn">[ RANGE CROSSES A BOOKED DATE ]</p>
        )}
        {verified === "idle" && (
          <p className="font-secondary text-[10px] text-ink/40">
            [ PICK A RANGE TO ARM THE REQUEST ]
          </p>
        )}
      </div>

      {error && (
        <p className="mt-2 border border-warn/50 bg-warn/10 px-3 py-2 font-secondary text-[9px] leading-5 text-warn">
          [ {error} ]
        </p>
      )}

      <p className="type-body mt-3 text-[11px] uppercase text-ink/50">
        LONGEST LOAN FOR THIS ITEM: {maxLoanDays} DAYS. BOOK ANY FREE RANGE UP TO{" "}
        {addDays(today, 90)}.
      </p>
    </div>
  );
}
