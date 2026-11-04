"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";

/** Signed private photos stay in this view; no public image proxy or cache. */
export function CampusGallery({
  paths,
  urls,
  title,
}: {
  paths: string[];
  urls: Record<string, string>;
  title: string;
}) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const path = paths[index];
  const move = (direction: number) =>
    setIndex((index + direction + paths.length) % paths.length);
  return (
    <div className="space-y-3" role="region" aria-label={`${title} photos`}>
      <div
        className="relative overflow-hidden border border-line bg-black"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            move(event.key === "ArrowRight" ? 1 : -1);
          }
        }}
      >
        {urls[path] &&
        !failed.includes(
          path,
        ) /* eslint-disable-next-line @next/next/no-img-element */ ? (
          <img
            src={urls[path]}
            alt={`${title}, photo ${index + 1}`}
            className="aspect-[4/3] w-full object-contain"
            onError={() => setFailed([...failed, path])}
          />
        ) : (
          <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 p-6 text-center text-sm text-ink/60">
            <ImageOff />
            Photo unavailable. Refresh to request a new preview.
          </div>
        )}
        {paths.length > 1 && (
          <div className="absolute inset-x-3 bottom-3 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous photo"
              className="border border-line bg-black/90 p-3"
              onClick={() => move(-1)}
            >
              <ChevronLeft className="size-5" />
            </button>
            <p
              className="bg-black/90 px-3 py-2 font-secondary text-xs"
              aria-live="polite"
            >
              {index + 1} / {paths.length}
            </p>
            <button
              type="button"
              aria-label="Next photo"
              className="border border-line bg-black/90 p-3"
              onClick={() => move(1)}
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
        )}
      </div>
      {paths.length > 1 && (
        <div className="grid grid-cols-6 gap-2">
          {paths.map((photo, n) => (
            <button
              key={photo}
              type="button"
              aria-label={`Show photo ${n + 1}`}
              aria-pressed={n === index}
              className={`aspect-square overflow-hidden border-2 bg-black ${n === index ? "border-accent" : "border-line"}`}
              onClick={() => setIndex(n)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={urls[photo]}
                alt=""
                className="size-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
      <p className="text-xs normal-case text-ink/50">
        {paths.length > 1
          ? "Select a thumbnail or use the left and right arrow keys."
          : "Photo shared with verified campus members."}
      </p>
    </div>
  );
}
