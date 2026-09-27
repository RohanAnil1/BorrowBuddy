"use client";

import { Plane } from "lucide-react";

const BLURBS = [
  "MIRA'S CAMERA IS BACK ON THE SHELF.",
  "DEV IS PICKING UP A PROJECTOR AT THE SAC.",
  "SANA'S SPEAKER IS ON STAGE TONIGHT.",
  "ROHAN'S CATAN NIGHT IS A GO.",
  "KABIR'S LENS FOUND A NEW OWNER.",
  "ISHITA'S HOTPLATE CAME BACK SPOTLESS.",
  "ARYAN'S TRUST SCORE JUST HIT 92.",
  "CAMPUS HANDOVERS RUN BY QR — EVERY TIME.",
];

/** The running yellow tag — full-width thermochrome marquee in the
 *  reference's signature style: black thermal print on signal yellow,
 *  plane marks between blurbs, seamless infinite loop, pauses on hover. */
export function StatusTicker() {
  return (
    <div
      aria-label="Live campus lending ticker"
      className="status-ticker relative z-[70] w-full overflow-hidden bg-warn"
      role="marquee"
    >
      <div className="ticker-run flex w-max items-center">
        {[0, 1].map((copy) => (
          <div aria-hidden className="flex items-center py-2" key={copy}>
            {BLURBS.map((blurb) => (
              <span
                className="flex items-center gap-4 px-8 font-ticket text-[15px] whitespace-nowrap text-black"
                key={blurb}
              >
                {blurb}
                <Plane className="size-4 shrink-0 fill-black text-black" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
