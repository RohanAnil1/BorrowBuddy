"use client";

import { AnimatePresence, motion, useScroll } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { EASE } from "@/lib/motion/variants";
import { useParallaxY } from "@/lib/motion/use-parallax";
import { GATE_1, IMAGE, SPOTS, routePath, type MapSpot } from "./map-data";

/* ---------------------------------------------------------------------------
   "Where you pick up" — the printed Bennett University master plan as a
   photographed board inside the dark matte frame. Seven pickup pins sit on
   the print; selecting one dims the photo, draws the dashed walk in from
   Gate 1 and opens the spot card. The photo renders through next/image;
   pins, route and gate anchor are DOM + one SVG overlay in the photo's own
   4:3 units (viewBox 1000 × 750).
   --------------------------------------------------------------------------- */

const GATE_X = GATE_1.xp * 10;
const GATE_Y = GATE_1.yp * 7.5;

export function CampusMap() {
  const sectionRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<MapSpot | null>(null);
  const [reduced, setReduced] = useState(false);

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

  const { scrollYProgress } = useScroll({
    offset: ["start end", "end start"],
    target: sectionRef,
  });
  const boardY = useParallaxY(scrollYProgress, 26, -26);

  const route = active ? routePath(active) : null;
  const cardBelow = active ? active.yp < 36.7 : false;
  const cardX = active ? Math.min(Math.max(active.xp, 14), 86) : 50;

  return (
    <section
      aria-label="Campus pickup map — Bennett University master plan"
      className="relative mb-16 isolate flex w-full flex-col gap-10 px-4 select-none dt:mb-36 dt:px-10"
      ref={sectionRef}
    >
      <p className="sr-only">
        Photograph of the Bennett University master plan board with seven BorrowBuddy
        pickup points: Library Entrance, Student Activity Center, Academic Block A, Boys
        Hostel Gate, Girls Hostel Gate, Sports Complex and Cafeteria. Selecting a point
        dims the board, draws its arrival route from Gate 1 and shows its details.
      </p>

      <div className="flex w-full flex-col justify-between gap-10 dt:flex-row dt:items-start">
        <h2 className="type-title title-arrow shrink-0">Where you pick up</h2>
        <p className="type-body w-full text-[15px] leading-7 uppercase dt:w-[40%] dt:text-lg">
          <span className="type-body-alt">
            BorrowBuddy hands over at fixed campus spots — library steps, the SAC plaza,
            hostel gates at Gate 1 &amp; 2, the sports complex and Food Street.
          </span>{" "}
          Every listing pins its pickup point, and the board shows where the queue is
          open right now.{" "}
          <span className="type-body-alt text-accent">
            Pick a point to trace the walk from the gate.
          </span>
        </p>
      </div>

      {/* board — counter-parallax layer */}
      <motion.div className="relative w-full" style={{ y: boardY }}>
        <div className="relative mx-auto w-full max-w-6xl border border-line bg-[#0c0906] p-2 dt:p-3">
          {/* scan corners */}
          <span aria-hidden className="pointer-events-none absolute -left-px -top-px z-10 size-5 border-l-2 border-t-2 border-ink/70" />
          <span aria-hidden className="pointer-events-none absolute -right-px -top-px z-10 size-5 border-r-2 border-t-2 border-ink/70" />
          <span aria-hidden className="pointer-events-none absolute -bottom-px -left-px z-10 size-5 border-b-2 border-l-2 border-ink/70" />
          <span aria-hidden className="pointer-events-none absolute -bottom-px -right-px z-10 size-5 border-b-2 border-r-2 border-ink/70" />

          <div className="relative overflow-hidden">
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

            {/* pickup pins */}
            {SPOTS.map((spot, index) => {
              const isActive = active?.id === spot.id;
              return (
                <motion.button
                  aria-label={`${spot.name} — ${spot.live} items live`}
                  aria-pressed={isActive}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full p-[5px] outline-none focus-visible:ring-2 focus-visible:ring-accent ${
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
                    className={`pointer-events-none absolute left-1/2 top-1/2 -ml-6 -mt-6 size-12 rounded-full bg-[radial-gradient(closest-side,rgba(255,178,77,0.5),transparent)] transition-opacity duration-300 ${
                      isActive ? "opacity-100" : "opacity-70"
                    }`}
                  />
                  {!reduced && (
                    <span
                      aria-hidden
                      className="pin-ring pointer-events-none absolute left-1/2 top-1/2 -ml-3 -mt-3 size-6 rounded-full border-2 border-accent"
                    />
                  )}
                  <span
                    aria-hidden
                    className={`relative block size-3.5 rounded-full border-2 border-[#0c0906] transition-colors duration-300 ${
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

          {/* spot card — in-flow below the map on phones, floating by the pin on desktop */}
          <AnimatePresence>
            {active && (
              <motion.div
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className={`relative mx-3 mb-3 z-30 border border-accent/60 bg-black p-3.5 dt:absolute dt:bottom-auto dt:left-[var(--pin-x)] dt:m-0 dt:top-[var(--pin-y)] dt:w-[330px] dt:-translate-x-1/2 dt:p-5 ${
                  cardBelow ? "dt:translate-y-[22px]" : "dt:-translate-y-[calc(100%+22px)]"
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
                  } as CSSProperties
                }
                transition={{ duration: 0.22, ease: EASE }}
              >
                <button
                  aria-label="Close pickup details"
                  className="absolute right-2 top-2 flex size-7 items-center justify-center border border-line font-primary text-[11px] text-ink/50 transition-colors hover:border-accent hover:text-accent"
                  onClick={() => setActive(null)}
                  type="button"
                >
                  ×
                </button>
                <p className="status-bracket text-[10px]">[ PICKUP POINT ]</p>
                <p className="type-body-alt mt-2 text-[16px] uppercase text-ink">{active.name}</p>
                <p className="type-body mt-1 text-[12px] uppercase text-ink/55">{active.description}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="border border-accent/60 bg-accent/10 px-2 py-1 font-secondary text-[9px] text-accent">
                    {active.live} ITEMS LIVE
                  </span>
                  <span className="border border-line px-2 py-1 font-secondary text-[9px] text-ink/50">
                    QUEUE OPEN
                  </span>
                </div>
                <Link
                  className="font-secondary mt-4 flex w-fit items-center gap-2 border border-accent/60 px-3 py-2 text-[10px] text-accent transition-colors hover:bg-accent/10"
                  href="/home"
                >
                  OPEN IN CATALOG →
                </Link>
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
      </motion.div>
    </section>
  );
}
