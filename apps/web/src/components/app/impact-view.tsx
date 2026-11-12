"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useId, useState } from "react";
import type { ImpactCategory } from "@/lib/data/impact";
import { cn } from "@/lib/utils";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function formatImpact(value: number, kind: "money" | "count") {
  return kind === "money" ? `₹${inr.format(value)}` : inr.format(value);
}

/** Counts up to the value once on mount; static under reduced motion. */
export function CountUp({ value, kind = "count" }: { value: number; kind?: "money" | "count" }) {
  const reduce = useReducedMotion() ?? false;
  const motionValue = useMotionValue(reduce ? value : 0);
  const text = useTransform(motionValue, (latest) => formatImpact(Math.round(latest), kind));

  useEffect(() => {
    if (reduce) {
      motionValue.set(value);
      return;
    }
    const controls = animate(motionValue, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [motionValue, reduce, value]);

  return (
    <>
      <motion.span aria-hidden>{text}</motion.span>
      <span className="sr-only">{formatImpact(value, kind)}</span>
    </>
  );
}

/** One headline number. `hero` marks the figure the page is about. */
export function StatTile({
  label,
  value,
  kind = "count",
  hint,
  hero = false,
}: {
  label: string;
  value: number;
  kind?: "money" | "count";
  hint?: string;
  hero?: boolean;
}) {
  return (
    <div className={cn("flex h-full flex-col gap-2 border bg-panel p-5", hero ? "justify-center border-accent/60" : "border-line")}>
      <span className="font-secondary text-[11px] uppercase text-ink/70">{label}</span>
      <span
        className={cn("type-title leading-none", hero ? "text-accent" : "text-ink")}
        style={{ fontSize: hero ? "2.6rem" : "2rem" }}
      >
        <CountUp kind={kind} value={value} />
      </span>
      {hint && <span className="text-[12px] normal-case leading-5 text-ink/60">{hint}</span>}
    </div>
  );
}

/**
 * Estimated savings per category: one series, so one hue, no legend; value
 * at the bar tip, loans and days in the hover/focus tooltip and the table.
 */
export function CategoryBars({ categories, caption }: { categories: ImpactCategory[]; caption: string }) {
  const reduce = useReducedMotion() ?? false;
  const [active, setActive] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();
  const max = Math.max(1, ...categories.map((category) => category.saved));

  return (
    <figure className="border border-line bg-panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <figcaption className="text-[13px] normal-case text-ink/75">{caption}</figcaption>
        <button
          aria-controls={tableId}
          aria-expanded={showTable}
          className="font-secondary text-[10px] uppercase text-accent hover:underline"
          onClick={() => setShowTable((value) => !value)}
          type="button"
        >
          {showTable ? "Show chart" : "Show as table"}
        </button>
      </div>

      {showTable ? (
        <table className="mt-4 w-full text-left text-[13px] normal-case" id={tableId}>
          <thead>
            <tr className="font-secondary text-[10px] uppercase text-ink/55">
              <th className="py-2 font-normal">Category</th>
              <th className="py-2 text-right font-normal">Loans</th>
              <th className="py-2 text-right font-normal">Days</th>
              <th className="py-2 text-right font-normal">Est. saved</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr className="border-t border-line" key={category.slug}>
                <td className="py-2">{category.name}</td>
                <td className="py-2 text-right tabular-nums">{inr.format(category.loans)}</td>
                <td className="py-2 text-right tabular-nums">{inr.format(category.days)}</td>
                <td className="py-2 text-right tabular-nums">{formatImpact(category.saved, "money")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="mt-5 flex flex-col gap-1" id={tableId}>
          {categories.map((category, index) => {
            const width = Math.max(1.5, (category.saved / max) * 100);
            const isActive = active === category.slug;
            const detail = `${category.name}: ${category.loans} ${category.loans === 1 ? "loan" : "loans"}, ${category.days} ${category.days === 1 ? "day" : "days"}, about ${formatImpact(category.saved, "money")} saved`;
            return (
              <li key={category.slug}>
                {/* The whole row is the hit target; the tooltip also opens on focus. */}
                <button
                  aria-label={detail}
                  className="group relative grid w-full grid-cols-[7.5rem_1fr] items-center gap-3 rounded-md py-1.5 text-left sm:grid-cols-[10rem_1fr]"
                  onBlur={() => setActive(null)}
                  onFocus={() => setActive(category.slug)}
                  onMouseEnter={() => setActive(category.slug)}
                  onMouseLeave={() => setActive(null)}
                  type="button"
                >
                  <span className="truncate text-[12px] normal-case text-ink/80">{category.name}</span>
                  {/* Bars scale to the track; the right padding keeps room for the tip value. */}
                  <span className="flex min-w-0 items-center gap-2 pr-24">
                    <motion.span
                      animate={{ width: `${width}%` }}
                      className={cn(
                        "block h-5 shrink-0 rounded-r-[4px] bg-accent transition-opacity",
                        active && !isActive ? "opacity-40" : "opacity-100",
                      )}
                      initial={{ width: reduce ? `${width}%` : "0%" }}
                      transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : 0.08 * index, ease: [0.16, 1, 0.3, 1] }}
                    />
                    <span className="-mr-24 shrink-0 text-[12px] tabular-nums text-ink/80">{formatImpact(category.saved, "money")}</span>
                  </span>
                  {isActive && (
                    <span
                      className="pointer-events-none absolute -top-9 left-[7.5rem] z-10 whitespace-nowrap border border-line bg-black px-2.5 py-1.5 text-[11px] normal-case text-ink shadow-lg sm:left-[10rem]"
                      role="tooltip"
                    >
                      {category.loans} {category.loans === 1 ? "loan" : "loans"} · {category.days} {category.days === 1 ? "day" : "days"}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </figure>
  );
}
