"use client";

import { Star } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function StarRatingInput({
  name = "rating",
  defaultValue = 0,
}: {
  name?: string;
  defaultValue?: number;
}) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div className="flex items-center gap-1.5">
      <input name={name} type="hidden" value={value} />
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          aria-label={`${star} star${star > 1 ? "s" : ""}`}
          className="transition-transform hover:scale-110"
          key={star}
          onClick={() => setValue(star)}
          type="button"
        >
          <Star
            className={cn(
              "size-7",
              star <= value ? "fill-accent text-accent" : "text-ink/25",
            )}
          />
        </button>
      ))}
      <span className="font-secondary ml-2 text-[10px] uppercase text-ink/50">
        {value > 0 ? `${value}/5` : "TAP TO RATE"}
      </span>
    </div>
  );
}

export function StarRating({ value, size = "sm" }: { value: number; size?: "sm" | "md" }) {
  const dimension = size === "md" ? "size-5" : "size-3.5";

  return (
    <span className="inline-flex items-center gap-0.5" title={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          className={cn(
            dimension,
            star <= Math.round(value) ? "fill-accent text-accent" : "text-ink/20",
          )}
          key={star}
        />
      ))}
    </span>
  );
}
