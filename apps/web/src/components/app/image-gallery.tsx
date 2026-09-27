"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { BUCKETS, publicUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

export function ImageGallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0);
  const urls = images.map((path) => publicUrl(BUCKETS.itemImages, path));
  const current = urls[active];

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] overflow-hidden border border-line bg-black">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={title} className="size-full object-cover" src={current} />
        ) : (
          <span className="flex size-full items-center justify-center text-ink/40">
            <ImageOff className="size-10" />
          </span>
        )}
        <span className="absolute left-3 top-3 bg-black px-2 py-1 font-secondary text-[9px] uppercase text-accent">
          PHOTO {active + 1}/{Math.max(1, urls.length)}
        </span>
      </div>

      {urls.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {urls.map((url, index) => (
            <button
              aria-label={`Photo ${index + 1}`}
              className={cn(
                "size-20 shrink-0 overflow-hidden border transition-colors",
                index === active ? "border-accent" : "border-line hover:border-ink/40",
              )}
              key={index}
              onClick={() => setActive(index)}
              type="button"
            >
              {url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" className="size-full object-cover" src={url} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
