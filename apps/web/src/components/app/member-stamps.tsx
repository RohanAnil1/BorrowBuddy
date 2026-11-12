"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { STAMP_DESIGNS, type ProfileStamp } from "@/lib/stamps";

/** Speckled ink: a turbulence mask knocks small gaps out of every pressed stamp. */
const INK_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' seed='7'/><feComponentTransfer><feFuncA type='discrete' tableValues='1 1 1 1 1 0 1 1'/></feComponentTransfer></filter><rect width='120' height='120' fill='#000' filter='url(#n)'/></svg>",
)}")`;

/**
 * Achievement stamps inked onto the member ID card.
 * `owner` shows every stamp, locked ones greyed with a short hint; `public`
 * shows earned stamps only. Earned stamps press in once when scrolled into
 * view, unless reduced motion is requested or they were already on screen.
 */
export function MemberStamps({ stamps, view }: { stamps: ProfileStamp[]; view: "owner" | "public" }) {
  const root = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"static" | "armed" | "pressed">("static");
  const shown = view === "owner" ? stamps : stamps.filter((stamp) => stamp.earned);
  const earned = stamps.filter((stamp) => stamp.earned).length;

  useEffect(() => {
    const node = root.current;
    if (!node || !earned || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = node.getBoundingClientRect();
    // Already visible on load: leave the ink where it is rather than re-stamping.
    if (box.top < window.innerHeight && box.bottom > 0) return;
    setPhase("armed");
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setPhase("pressed"); observer.disconnect(); }
    }, { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [earned]);

  return (
    <div ref={root} className="border-t border-line px-5 py-5" data-testid="member-stamps" data-view={view} data-phase={phase}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-secondary text-[11px] text-ink/60">[ STAMPS ]</h3>
        <p className="font-secondary text-[9px] text-accent">
          {view === "owner" ? `${earned} / ${stamps.length} EARNED` : earned ? `${earned} EARNED` : ""}
        </p>
      </div>
      {shown.length === 0 ? (
        <p className="font-secondary mt-4 text-[9px] text-ink/40">NO STAMPS YET. THEY ARRIVE WITH COMPLETED LOANS AND HANDOVERS.</p>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3" aria-label={view === "owner" ? "Your achievement stamps" : "Achievement stamps"}>
          {shown.map((stamp, index) => (
            <Stamp key={stamp.key} stamp={stamp} index={index} phase={phase} showHint={view === "owner"} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Stamp({ stamp, index, phase, showHint }: { stamp: ProfileStamp; index: number; phase: string; showHint: boolean }) {
  const design = STAMP_DESIGNS[stamp.key];
  const round = design.shape === "round";
  const ink: CSSProperties = stamp.earned
    ? {
        rotate: `${design.tilt}deg`,
        maskImage: INK_MASK,
        WebkitMaskImage: INK_MASK,
        maskSize: "120px 120px",
        WebkitMaskSize: "120px 120px",
        animationDelay: `${index * 110}ms`,
      }
    : {};
  const motion = stamp.earned && phase === "armed" ? "opacity-0" : stamp.earned && phase === "pressed" ? "stamp-press" : "";
  return (
    <li className="flex flex-col items-center text-center" data-stamp={stamp.key} data-earned={stamp.earned}>
      <div
        className={`flex flex-col items-center justify-center gap-1 border-2 p-1 ${round ? "size-24 rounded-full" : "h-20 w-28 rounded-md"} ${
          stamp.earned ? "border-accent text-accent" : "border-dashed border-ink/20 text-ink/30"
        } ${motion}`}
        style={ink}
        role="img"
        aria-label={stamp.earned ? `${design.label} stamp earned` : `${design.label} stamp locked, ${stamp.progress} of ${stamp.goal}. ${design.hint}`}
      >
        <div
          className={`flex size-full flex-col items-center justify-center gap-0.5 border ${round ? "rounded-full" : "rounded-sm"} ${
            stamp.earned ? "border-accent/70" : "border-dashed border-ink/15"
          } px-1`}
        >
          <span className="font-secondary text-[7px] leading-none tracking-[0.12em]">{design.rim}</span>
          <span className="font-title text-[15px] uppercase leading-[0.95]">{design.label}</span>
          <span className="font-secondary text-[7px] leading-none">{stamp.earned ? "★ EARNED ★" : `${stamp.progress} / ${stamp.goal}`}</span>
        </div>
      </div>
      {showHint && !stamp.earned && (
        <p className="font-secondary mt-3 max-w-[18ch] text-[8px] leading-[1.5] text-ink/45 uppercase" aria-hidden="true">
          {design.hint}
        </p>
      )}
    </li>
  );
}
