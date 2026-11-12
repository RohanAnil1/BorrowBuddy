"use client";

import { Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import type { Category, ItemCondition, PickupLocation } from "@borrowbuddy/shared";
import { ITEM_CONDITION_LABELS } from "@borrowbuddy/shared";

const fieldClass =
  "flex items-center gap-2 rounded-lg border border-line bg-black px-3 py-1.5 transition-colors focus-within:border-accent";
const selectClass = "bg-transparent py-0.5 text-[13px] text-ink outline-none [&>option]:bg-black";
const captionClass = "font-secondary text-[9px] text-ink/40";

const SORT_LABELS = { newest: "Newest", deposit_low: "Lowest deposit", trust: "Most trusted owner" } as const;

export function FilterBar({
  categories,
  locations,
  basePath = "/home",
}: {
  categories: Category[];
  locations: PickupLocation[];
  basePath?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  const hasFilters = ["q", "category", "condition", "spot", "from", "to", "sort"].some((key) =>
    searchParams.get(key),
  );

  function apply(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page"); // any change starts the list from the top
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    startTransition(() => {
      router.push(`${basePath}${params.toString() ? `?${params.toString()}` : ""}`);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          apply({ q: query.trim() || null });
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink/40" />
          <input
            className="w-full rounded-lg border border-line bg-black py-3 pl-11 pr-4 text-[14px] text-ink outline-none transition-colors placeholder:text-ink/30 focus:border-accent"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projectors, cameras, fans…"
            value={query}
          />
        </div>
        <button
          className="rounded-lg bg-accent px-4 py-3 font-strong text-[12px] uppercase text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          SEARCH
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <label className={fieldClass}>
          <span className={captionClass}>CATEGORY</span>
          <select
            className={selectClass}
            onChange={(event) => apply({ category: event.target.value || null })}
            value={searchParams.get("category") ?? ""}
          >
            <option value="">All</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <label className={fieldClass}>
          <span className={captionClass}>CONDITION</span>
          <select
            className={selectClass}
            onChange={(event) => apply({ condition: event.target.value || null })}
            value={searchParams.get("condition") ?? ""}
          >
            <option value="">Any</option>
            {(Object.keys(ITEM_CONDITION_LABELS) as ItemCondition[]).map((condition) => (
              <option key={condition} value={condition}>
                {ITEM_CONDITION_LABELS[condition]}
              </option>
            ))}
          </select>
        </label>

        <label className={fieldClass}>
          <span className={captionClass}>PICKUP</span>
          <select
            className={selectClass}
            onChange={(event) => apply({ spot: event.target.value || null })}
            value={searchParams.get("spot") ?? ""}
          >
            <option value="">Any spot</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>

        <label className={fieldClass}>
          <span className={captionClass}>SORT</span>
          <select
            className={selectClass}
            onChange={(event) => apply({ sort: event.target.value === "newest" ? null : event.target.value })}
            value={searchParams.get("sort") ?? "newest"}
          >
            {(Object.keys(SORT_LABELS) as (keyof typeof SORT_LABELS)[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>

        <label className={fieldClass}>
          <span className={captionClass}>FROM</span>
          <input
            className="bg-transparent text-[13px] text-ink outline-none"
            onChange={(event) => apply({ from: event.target.value || null })}
            type="date"
            value={searchParams.get("from") ?? ""}
          />
        </label>

        <label className={fieldClass}>
          <span className={captionClass}>TO</span>
          <input
            className="bg-transparent text-[13px] text-ink outline-none"
            onChange={(event) => apply({ to: event.target.value || null })}
            type="date"
            value={searchParams.get("to") ?? ""}
          />
        </label>

        {hasFilters && (
          <button
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 font-secondary text-[9px] text-ink/50 transition-colors hover:border-accent hover:text-accent"
            onClick={() => {
              setQuery("");
              startTransition(() => router.push(basePath));
            }}
            type="button"
          >
            <X className="size-3" />
            CLEAR
          </button>
        )}
      </div>
    </div>
  );
}
