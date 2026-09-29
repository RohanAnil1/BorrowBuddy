"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { EASE } from "@/lib/motion/variants";
import { GATE_1, IMAGE, routePath, type MapSpot } from "@/lib/campus-map";

/* ---------------------------------------------------------------------------
   The campus board — the printed Bennett University master plan as a
   photographed board inside the dark matte frame. Pins sit on the print;
   selecting one dims the photo, draws the dashed walk in from Gate 1 and
   opens the spot card. The photo renders through next/image; pins, route and
   gate anchor are DOM + one SVG overlay in the photo's own 4:3 units
   (viewBox 1000 × 750).

   Shared by the landing page ("Where you pick up") and the in-app pickup
   map. variant="landing" keeps the marketing card (queue open / open in
   catalog); variant="app" shows the live availability count and links to the
   filtered browse at /home?spot=<id>.
   --------------------------------------------------------------------------- */

const GATE_X = GATE_1.xp * 10;
const GATE_Y = GATE_1.yp * 7.5;

export function CampusBoard({
  spots,
  variant = "landing",
}: {
  spots: MapSpot[];
  variant?: "landing" | "app";
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<MapSpot | null>(null);
  const [cardTop, setCardTop] = useState<number | null>(null);
  const [reduced, setReduced] = useState(false);
  const isApp = variant === "app";

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  const select = useCallback((spot: MapSpot) => {
    setActive((current) => (current?.id === spot.id ? null : spot));
  }, []);

  // Dismiss the spot card on any click that lands outside it (pins toggle themselves).
  useEffect(() => {
    if (!active) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (cardRef.current?.contains(target)) return;
      if (target.closest?.("[data-pin]")) return;
      setActive(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [active]);

  // Escape closes the card from anywhere on the page.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActive(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active]);

  const route = active ? routePath(active) : null;
  const cardX = active ? Math.min(Math.max(active.xp, 14), 86) : 50;

  // Keep the (now photo-sized) desktop card inside the board frame: measure
  // the card and pick a side with room, then clamp to the frame edges.
  useLayoutEffect(() => {
    if (!active) return;

    const measure = () => {
      const frame = frameRef.current;
      const image = imageRef.current;
      const card = cardRef.current;
      if (!frame || !image || !card) return;

      const gap = 22;
      const pinY = image.offsetTop + (active.yp / 100) * image.clientHeight;
      const frameH = frame.clientHeight;
      const cardH = card.offsetHeight;
      const above = pinY - gap - cardH;
      const below = pinY + gap;
      const spaceAbove = pinY - gap;
      const spaceBelow = frameH - pinY - gap;

      let top: number;
      if (cardH <= spaceBelow) top = below;
      else if (cardH <= spaceAbove) top = above;
      else top = spaceBelow >= spaceAbove ? below : above;

      setCardTop(Math.max(8, Math.min(top, Math.max(8, frameH - cardH - 8))));
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active]);

  return (
    <div
      className="relative mx-auto w-full max-w-6xl border border-line bg-[#0c0906] p-2 dt:p-3"
      ref={frameRef}
    >
      {/* scan corners */}
      <span aria-hidden className="pointer-events-none absolute -left-px -top-px z-10 size-5 border-l-2 border-t-2 border-ink/70" />
      <span aria-hidden className="pointer-events-none absolute -right-px -top-px z-10 size-5 border-r-2 border-t-2 border-ink/70" />
      <span aria-hidden className="pointer-events-none absolute -bottom-px -left-px z-10 size-5 border-b-2 border-l-2 border-ink/70" />
      <span aria-hidden className="pointer-events-none absolute -bottom-px -right-px z-10 size-5 border-b-2 border-r-2 border-ink/70" />

      <div className="relative overflow-hidden" ref={imageRef}>
        <Image
          alt="Photograph of the Bennett University master plan board, Greater Noida"
          className="h-auto w-full"
          height={IMAGE.h}
          sizes="(max-width: 1180px) 100vw, 1152px"
          src="/campus-map.png"
          width={IMAGE.w}
        />

        {/* soft vignette so the print melts into the matte */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1] shadow-[inset_0_0_90px_30px_rgba(12,9,6,0.45)]"
        />

        {/* focus dim while a pin is open */}
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 z-[2] bg-[#0c0906] transition-opacity duration-300 ${
            active ? "opacity-50" : "opacity-0"
          }`}
        />

        {/* route overlay — gate anchor + dashed arrival path */}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 h-full w-full"
          fill="none"
          viewBox="0 0 1000 750"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g data-gate transform={`translate(${GATE_X} ${GATE_Y})`}>
            <circle fill="rgba(12,9,6,0.6)" r="13" />
            <path d="M -6 0 L 0 -6 L 6 0 L 0 6 Z" fill="#ffcf7a" />
          </g>
          {route && (
            <g data-route>
              <path
                className={reduced ? undefined : "dash-run"}
                d={route}
                stroke="rgba(203,132,14,0.85)"
                strokeDasharray="16 12"
                strokeLinecap="round"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
              {!reduced && (
                <circle
                  fill="none"
                  r="0.01"
                  stroke="#ffcf7a"
                  strokeWidth="10"
                  vectorEffect="non-scaling-stroke"
                >
                  <animateMotion dur="2.1s" path={route} repeatCount="indefinite" />
                </circle>
              )}
            </g>
          )}
        </svg>

        {/* pickup pins — display-only on phones, the spot rail drives selection */}
        {spots.map((spot, index) => {
          const isActive = active?.id === spot.id;
          return (
            <motion.button
              aria-label={
                spot.live === undefined
                  ? spot.name
                  : `${spot.name} — ${spot.live} ${spot.live === 1 ? "item" : "items"} ${isApp ? "available" : "live"}`
              }
              aria-pressed={isActive}
              className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full p-[5px] outline-none focus-visible:ring-2 focus-visible:ring-accent dt:pointer-events-auto dt:cursor-pointer ${
                isActive ? "z-30" : "z-20"
              }`}
              data-pin={spot.id}
              initial={reduced ? false : { opacity: 0, scale: 0.4 }}
              key={spot.id}
              onClick={(event) => {
                event.stopPropagation();
                select(spot);
              }}
              style={{ left: `${spot.xp}%`, top: `${spot.yp}%` }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 340, damping: 22, delay: 0.2 + index * 0.06 }
              }
              type="button"
              viewport={{ amount: 0.2, once: true }}
              whileInView={{ opacity: 1, scale: 1 }}
            >
              <span
                aria-hidden
                className={`pointer-events-none absolute left-1/2 top-1/2 -ml-5 -mt-5 size-10 rounded-full bg-[radial-gradient(closest-side,rgba(255,178,77,0.5),transparent)] transition-opacity duration-300 dt:-ml-6 dt:-mt-6 dt:size-12 ${
                  isActive ? "opacity-100" : "opacity-70"
                }`}
              />
              {!reduced && (
                <span
                  aria-hidden
                  className="pin-ring pointer-events-none absolute left-1/2 top-1/2 -ml-2.5 -mt-2.5 size-5 rounded-full border-2 border-accent dt:-ml-3 dt:-mt-3 dt:size-6"
                />
              )}
              <span
                aria-hidden
                className={`relative block size-2.5 rounded-full border border-[#0c0906] transition-colors duration-300 dt:size-3.5 dt:border-2 ${
                  isActive ? "bg-[#ffe9c4]" : "bg-[#ffcf7a]"
                }`}
              />
              <span
                className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap border border-accent/60 bg-black/85 px-2 py-1 font-label text-[9px] uppercase leading-none tracking-[0.08em] text-[#ffcf7a] dt:text-[10px] ${
                  spot.label === "left" ? "right-full mr-2" : "left-full ml-2"
                } ${isActive ? "block" : "hidden dt:block"}`}
              >
                {spot.name}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* spot rail — phones only; the pins above are too dense to tap there */}
      <div
        aria-label="Pickup points"
        className="mt-3 flex flex-wrap gap-2 dt:hidden"
        role="group"
      >
        {spots.map((spot) => {
          const isActive = active?.id === spot.id;
          return (
            <button
              aria-pressed={isActive}
              className={`border px-3 py-2 font-label text-[10px] uppercase leading-none tracking-[0.08em] transition-colors ${
                isActive
                  ? "border-accent bg-accent/15 text-[#ffcf7a]"
                  : "border-line bg-black text-ink/60"
              }`}
              key={spot.id}
              onClick={() => select(spot)}
              type="button"
            >
              {spot.name}
            </button>
          );
        })}
      </div>

      {/* spot card — in-flow below the map on phones, floating by the pin on desktop */}
      <AnimatePresence>
        {active && (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className={`relative mx-3 mb-3 z-30 overflow-hidden border border-accent/60 bg-black dt:absolute dt:bottom-auto dt:left-[var(--pin-x)] dt:m-0 dt:w-[330px] dt:-translate-x-1/2 ${
              cardTop === null
                ? "dt:top-[var(--pin-y)] dt:-translate-y-[calc(100%+22px)]"
                : "dt:top-[var(--card-top)]"
            }`}
            data-map-card
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            key={active.id}
            ref={cardRef}
            style={
              {
                "--pin-x": `${cardX}%`,
                "--pin-y": `${active.yp}%`,
                "--card-top": `${cardTop ?? 0}px`,
              } as CSSProperties
            }
            transition={{ duration: 0.22, ease: EASE }}
          >
            {active.photo && (
              <div className="relative aspect-[3/4] w-full border-b border-line">
                <Image
                  alt={`${active.name} — ${active.description}`}
                  className="object-cover"
                  fill
                  sizes="(max-width: 800px) 92vw, 330px"
                  src={active.photo}
                />
              </div>
            )}
            <button
              aria-label="Close pickup details"
              className="absolute right-2 top-2 z-10 flex size-7 items-center justify-center border border-line bg-black/70 font-primary text-[11px] text-ink/60 backdrop-blur-sm transition-colors hover:border-accent hover:text-accent"
              onClick={() => setActive(null)}
              type="button"
            >
              ×
            </button>
            <div className="p-3.5 dt:p-5">
              <p className="status-bracket text-[10px]">[ PICKUP POINT ]</p>
              <p className="type-body-alt mt-2 text-[16px] uppercase text-ink">{active.name}</p>
              <p className="type-body mt-1 text-[12px] uppercase text-ink/55">{active.description}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {active.live !== undefined && (
                  <span className="border border-accent/60 bg-accent/10 px-2 py-1 font-secondary text-[9px] text-accent">
                    {active.live} {active.live === 1 ? "ITEM" : "ITEMS"}{" "}
                    {isApp ? "AVAILABLE" : "LIVE"}
                  </span>
                )}
                <span className="border border-line px-2 py-1 font-secondary text-[9px] text-ink/50">
                  QUEUE OPEN
                </span>
              </div>
              <Link
                className="font-secondary mt-4 flex w-fit items-center gap-2 border border-accent/60 px-3 py-2 text-[10px] text-accent transition-colors hover:bg-accent/10"
                href={isApp ? `/home?spot=${active.id}` : "/home"}
              >
                {isApp ? "BROWSE ITEMS →" : "OPEN IN CATALOG →"}
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* legend rail */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-1 pt-3">
        <span className="flex items-center gap-2 font-label text-[9px] text-accent">
          <span className="relative flex size-3 items-center justify-center">
            <span className="pin-ring absolute inset-0 rounded-full border border-accent" />
            <span className="size-2 rounded-full bg-[#ffcf7a]" />
          </span>
          PICKUP POINT
        </span>
        <span className="flex items-center gap-2 font-label text-[9px] text-ink/45">
          <span className="w-7 border-t-2 border-dashed border-accent/80" />
          ROUTE FROM GATE 1
        </span>
      </div>
    </div>
  );
}
