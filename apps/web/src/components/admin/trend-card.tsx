"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

const dayLabel = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const shortDay = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

function asDate(day: string) {
  return new Date(`${day}T00:00:00Z`);
}

/**
 * One measure over the last 14 days: the 7-day total, the change against the
 * 7 days before, and a column per day (the earlier week de-emphasised, this
 * week in the accent). One series, so no legend; hover or arrow keys show a
 * day's value, and the same numbers are one click away as a table.
 */
export function TrendCard({
  label,
  unit,
  points,
  upIsGood = true,
}: {
  label: string;
  unit: [singular: string, plural: string];
  points: { day: string; value: number }[];
  upIsGood?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const tableId = useId();

  const recent = points.slice(-7).reduce((sum, point) => sum + point.value, 0);
  const previous = points.slice(0, -7).reduce((sum, point) => sum + point.value, 0);
  const delta = recent - previous;
  const max = Math.max(1, ...points.map((point) => point.value));
  const words = (value: number) => `${value} ${value === 1 ? unit[0] : unit[1]}`;
  const good = delta === 0 ? null : delta > 0 === upIsGood;
  const DeltaIcon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : ArrowRight;
  const focused = active === null ? null : points[active];

  return (
    <figure className="flex min-w-0 flex-col border border-line bg-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <figcaption className="min-w-0">
          <span className="font-secondary block text-[11px] text-ink/70">{label}</span>
          <span className="type-title mt-2 block leading-none tabular-nums" style={{ fontSize: "2.25rem" }}>
            {recent}
          </span>
          <span className="mt-1 block text-[12px] normal-case text-ink/60">in the last 7 days</span>
        </figcaption>
        <span
          className={cn(
            "font-secondary inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] tabular-nums",
            good === null ? "border-line text-ink/60" : good ? "border-accent/50 text-accent" : "border-warn/50 text-warn",
          )}
          title="Compared with the 7 days before"
        >
          <DeltaIcon aria-hidden className="size-3.5" />
          {delta > 0 ? "+" : ""}
          {delta}
          <span className="sr-only"> compared with the 7 days before</span>
        </span>
      </div>

      {asTable ? (
        <table className="mt-4 w-full text-left text-[13px] normal-case" id={tableId}>
          <thead>
            <tr className="font-secondary text-[11px] text-ink/55">
              <th className="py-1.5 font-normal">Day</th>
              <th className="py-1.5 text-right font-normal">{unit[1]}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr className="border-t border-line" key={point.day}>
                <td className="py-1.5">{dayLabel.format(asDate(point.day))}</td>
                <td className="py-1.5 text-right tabular-nums">{point.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="mt-5">
          <div
            aria-label={`${label}, last 14 days. Use the arrow keys to read each day.`}
            className="relative flex h-24 items-end gap-[2px] border-b border-ink/15 outline-none focus-visible:outline-2 focus-visible:outline-offset-4"
            onBlur={() => setActive(null)}
            onFocus={() => setActive(points.length - 1)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") setActive((index) => Math.max(0, (index ?? points.length) - 1));
              if (event.key === "ArrowRight") setActive((index) => Math.min(points.length - 1, (index ?? -1) + 1));
            }}
            onPointerLeave={() => setActive(null)}
            aria-roledescription="chart"
            role="group"
            tabIndex={0}
          >
            {points.map((point, index) => {
              const thisWeek = index >= points.length - 7;
              const height = point.value === 0 ? 0 : Math.max(6, (point.value / max) * 100);
              return (
                <div
                  className="flex h-full min-w-0 flex-1 items-end justify-center"
                  key={point.day}
                  onPointerEnter={() => setActive(index)}
                >
                  {point.value === 0 ? (
                    <span className="block h-0.5 w-full max-w-6 bg-ink/15" />
                  ) : (
                    <span
                      className={cn(
                        "block w-full max-w-6 rounded-t-[4px] transition-opacity",
                        thisWeek ? "bg-accent" : "bg-ink/30",
                        active !== null && active !== index && "opacity-45",
                      )}
                      style={{ height: `${height}%` }}
                    />
                  )}
                </div>
              );
            })}
            {focused && active !== null && (
              <span
                aria-live="polite"
                className="pointer-events-none absolute bottom-full z-10 mb-2 -translate-x-1/2 whitespace-nowrap border border-line bg-black px-2.5 py-1.5 text-[12px] normal-case text-ink"
                style={{ left: `clamp(4.5rem, ${((active + 0.5) / points.length) * 100}%, calc(100% - 4.5rem))` }}
              >
                <span className="text-ink/60">{dayLabel.format(asDate(focused.day))}</span> · {words(focused.value)}
              </span>
            )}
          </div>
          {points.length > 0 && (
            <div className="font-secondary mt-1.5 flex justify-between text-[11px] text-ink/50">
              <span>{shortDay.format(asDate(points[0].day))}</span>
              <span>Today</span>
            </div>
          )}
        </div>
      )}

      <button
        aria-controls={asTable ? tableId : undefined}
        aria-expanded={asTable}
        className="font-secondary mt-3 self-start text-[11px] text-accent hover:underline"
        onClick={() => setAsTable((value) => !value)}
        type="button"
      >
        {asTable ? "Show chart" : "Show as table"}
      </button>
    </figure>
  );
}
