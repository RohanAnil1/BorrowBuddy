"use client";

import { AnimatePresence, motion, useScroll, type Variants } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { EASE } from "@/lib/motion/variants";
import { useParallaxY } from "@/lib/motion/use-parallax";
import { BOARD, BUILDINGS, FIELDS, GATES, ROADS, ROUNDABOUT, SPOTS, ZONES, routePath, type MapSpot } from "./map-data";

/* ---------------------------------------------------------------------------
   "Where you pick up" — the Bennett University master plan as a dark
   scanner-hall board, traced from the printed plan (north-up: approach road
   + Gates 1/2 east, Gate 3 west, sports belts north-west, academic core
   centre-west, hostels east, fields south). Seven pickup pins glow on the
   board; selecting one draws a dashed arrival route from Gate 1 and opens
   the spot card.
   --------------------------------------------------------------------------- */

const mapIn: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.08 } },
};

const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.5, ease: EASE } },
};

const drawIn: Variants = {
  hidden: { opacity: 0.15, pathLength: 0 },
  show: { opacity: 1, pathLength: 1, transition: { duration: 1.15, ease: EASE } },
};

const blockIn: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE } },
};

const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  show: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 340, damping: 22 } },
};

const PIN_GLOW = "url(#pin-glow)";

export function CampusMap() {
  const sectionRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<MapSpot | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
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

  const { scrollYProgress } = useScroll({
    offset: ["start end", "end start"],
    target: sectionRef,
  });
  const boardY = useParallaxY(scrollYProgress, 26, -26);

  const select = (spot: MapSpot) => {
    setActive((current) => (current?.id === spot.id ? null : spot));
  };

  const route = active ? routePath(active.x, active.y) : null;
  const cardBelow = active ? active.y < 360 : false;
  const cardX = active ? Math.min(Math.max((active.x / BOARD.w) * 100, 14), 86) : 50;

  return (
    <section
      aria-label="Campus pickup map — Bennett University master plan"
      className="relative mb-16 isolate flex w-full flex-col gap-10 px-4 select-none dt:mb-36 dt:px-10"
      ref={sectionRef}
    >
      <p className="sr-only">
        Map of the Bennett University campus traced from the master plan, with seven
        BorrowBuddy pickup points: Library Entrance, Student Activity Center, Academic
        Block A, Boys Hostel Gate, Girls Hostel Gate, Sports Complex and Cafeteria.
        Selecting a point draws its arrival route from Gate 1 and shows its details.
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
            <motion.svg
              className="h-auto w-full"
              fill="none"
              initial={reduced ? "show" : "hidden"}
              variants={mapIn}
              viewBox={`0 0 ${BOARD.w} ${BOARD.h}`}
              whileInView="show"
              viewport={{ amount: 0.2, once: true }}
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <radialGradient id="pin-glow">
                  <stop offset="0%" stopColor="#ffb24d" stopOpacity="0.55" />
                  <stop offset="55%" stopColor="#cb840e" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#cb840e" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="board-vignette">
                  <stop offset="0%" stopColor="#1a120a" stopOpacity="0.55" />
                  <stop offset="60%" stopColor="#0c0906" stopOpacity="0" />
                  <stop offset="100%" stopColor="#000000" stopOpacity="0.55" />
                </radialGradient>
                <pattern height="24" id="board-grid" patternUnits="userSpaceOnUse" width="24">
                  <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(240,240,240,0.035)" strokeWidth="1" />
                </pattern>
              </defs>

              {/* board surface */}
              <rect fill="#0c0906" height={BOARD.h} width={BOARD.w} />
              <rect fill="url(#board-grid)" height={BOARD.h} width={BOARD.w} />
              <rect fill="url(#board-vignette)" height={BOARD.h} width={BOARD.w} />
              {/* click-away surface */}
              <rect
                aria-hidden
                className="cursor-default"
                fill="transparent"
                height={BOARD.h}
                onClick={() => setActive(null)}
                width={BOARD.w}
              />

              {/* plot boundary */}
              <motion.path
                d="M 100 140 L 100 862 Q 100 890 128 890 L 1092 890 Q 1132 890 1160 862 L 1240 780 L 1240 140 Q 1240 110 1212 110 L 128 110 Q 100 110 100 140 Z"
                fill="rgba(240,240,240,0.015)"
                stroke="rgba(240,240,240,0.14)"
                strokeDasharray="8 12"
                strokeWidth="2"
                variants={drawIn}
              />

              {/* roads */}
              <motion.g variants={fadeIn}>
                {ROADS.map((road) => (
                  <g key={road.id}>
                    <path d={road.d} stroke="rgba(240,240,240,0.06)" strokeLinecap="round" strokeWidth={road.width} />
                    <path d={road.d} stroke="rgba(240,240,240,0.22)" strokeWidth="2.5" />
                    {road.centerline && (
                      <path d={road.centerline} stroke="rgba(240,240,240,0.3)" strokeDasharray="16 16" strokeWidth="2" />
                    )}
                  </g>
                ))}
                <circle cx={ROUNDABOUT.x} cy={ROUNDABOUT.y} opacity="0.65" r={ROUNDABOUT.r} stroke="rgba(240,240,240,0.3)" strokeWidth="2" />
                <circle cx={ROUNDABOUT.x} cy={ROUNDABOUT.y} fill="rgba(240,240,240,0.12)" r="7" />
              </motion.g>

              {/* gates */}
              {GATES.map((gate, index) => (
                <motion.g key={gate.id} variants={popIn}>
                  <motion.g
                    animate={{ opacity: [0.55, 1, 0.55] }}
                    transition={{ duration: 2.8, ease: "easeInOut", repeat: Infinity, delay: index * 0.4 }}
                  >
                    <path
                      d={`M ${gate.x} ${gate.y - 18} L ${gate.x + 13} ${gate.y} L ${gate.x} ${gate.y + 18} L ${gate.x - 13} ${gate.y} Z`}
                      fill="rgba(203,132,14,0.2)"
                      stroke="#cb840e"
                      strokeWidth="2"
                    />
                  </motion.g>
                  <circle cx={gate.x} cy={gate.y} fill="#ffcf7a" r="4.5" />
                  <text
                    className="fill-[#cb840e] font-label text-[24px] dt:text-[18px]"
                    textAnchor={gate.side === "east" ? "end" : "start"}
                    x={gate.side === "east" ? gate.x - 26 : gate.x + 26}
                    y={gate.y + 8}
                  >
                    {gate.label}
                  </text>
                </motion.g>
              ))}

              {/* fields + buildings dim while a pin is active */}
              <g className={active ? "opacity-35 transition-opacity duration-300" : "transition-opacity duration-300"}>
                <motion.g variants={fadeIn}>
                  {FIELDS.map((field) => {
                    if (field.kind === "pitch") {
                      const midX = field.x + field.w / 2;
                      const midY = field.y + field.h / 2;
                      return (
                        <g key={field.id}>
                          <rect
                            fill={ZONES.green.fill}
                            height={field.h}
                            rx="6"
                            stroke={ZONES.green.stroke}
                            strokeOpacity="0.7"
                            strokeWidth="2.5"
                            width={field.w}
                            x={field.x}
                            y={field.y}
                          />
                          <line stroke="rgba(240,240,240,0.22)" strokeWidth="2" x1={midX} x2={midX} y1={field.y + 8} y2={field.y + field.h - 8} />
                          <circle cx={midX} cy={midY} r="26" stroke="rgba(240,240,240,0.22)" strokeWidth="2" />
                          <rect height="46" stroke="rgba(240,240,240,0.18)" strokeWidth="2" width="34" x={field.x + 10} y={midY - 23} />
                          <rect height="46" stroke="rgba(240,240,240,0.18)" strokeWidth="2" width="34" x={field.x + field.w - 44} y={midY - 23} />
                          <text
                            className="fill-[#8dd8ab] font-label text-[22px] dt:text-[15px]"
                            textAnchor="start"
                            x={field.x + 16}
                            y={field.y + field.h - 14}
                          >
                            {field.label}
                          </text>
                        </g>
                      );
                    }
                    const midX = field.x + field.w / 2;
                    const stroke = field.kind === "complex" ? "#cb840e" : ZONES.sports.stroke;
                    const fill = field.kind === "complex" ? "rgba(203,132,14,0.14)" : ZONES.sports.fill;
                    return (
                      <g key={field.id}>
                        <rect
                          fill={fill}
                          height={field.h}
                          rx="3"
                          stroke={stroke}
                          strokeOpacity="0.6"
                          strokeWidth="2"
                          width={field.w}
                          x={field.x}
                          y={field.y}
                        />
                        <line stroke="rgba(240,240,240,0.2)" strokeWidth="1.5" x1={midX} x2={midX} y1={field.y + 4} y2={field.y + field.h - 4} />
                        {field.label && (
                          <text
                            className="fill-[#8dd8ab] font-label text-[20px] dt:text-[13px]"
                            textAnchor="middle"
                            x={midX}
                            y={field.y - 8}
                          >
                            {field.label}
                          </text>
                        )}
                      </g>
                    );
                  })}
                  <text
                    className="fill-[rgba(240,240,240,0.4)] font-label text-[20px] dt:text-[14px]"
                    textAnchor="middle"
                    transform="rotate(-90 216 356)"
                    x="216"
                    y="360"
                  >
                    COURTS · WEST BELT
                  </text>
                </motion.g>

                <motion.g variants={mapIn}>
                  {BUILDINGS.map((building) => (
                    <motion.g key={building.id} variants={blockIn}>
                      <rect
                        fill={ZONES[building.zone].fill}
                        height={building.h}
                        rx="3"
                        stroke={ZONES[building.zone].stroke}
                        strokeOpacity="0.6"
                        strokeWidth="2"
                        width={building.w}
                        x={building.x}
                        y={building.y}
                      />
                      {building.label && (
                        <text
                          className={
                            building.minor
                              ? "hidden fill-[rgba(240,240,240,0.45)] font-secondary text-[15px] dt:block"
                              : "fill-[rgba(240,240,240,0.72)] font-secondary text-[22px] dt:text-[16px]"
                          }
                          textAnchor="middle"
                          x={building.x + building.w / 2}
                          y={building.y + building.h / 2 + 5}
                        >
                          {building.label}
                        </text>
                      )}
                    </motion.g>
                  ))}
                </motion.g>
              </g>

              {/* board furniture — revision plate */}
              <g>
                <rect fill="rgba(0,0,0,0.6)" height="46" stroke="rgba(240,240,240,0.18)" strokeWidth="1.5" width="356" x="28" y="26" />
                <text className="fill-[rgba(240,240,240,0.55)] font-label text-[19px]" x="46" y="55">
                  BORROWBUDDY · CAMPUS MASTER PLAN · REV 04
                </text>
              </g>
              {/* compass */}
              <g>
                <circle cx="1330" cy="66" r="26" stroke="rgba(240,240,240,0.25)" strokeWidth="2" />
                <path d="M 1330 46 L 1338 74 L 1330 66 L 1322 74 Z" fill="rgba(240,240,240,0.7)" />
                <text className="fill-[rgba(240,240,240,0.5)] font-label text-[16px]" textAnchor="middle" x="1330" y="112">
                  N
                </text>
              </g>
              {/* scale bar */}
              <g>
                <line stroke="rgba(240,240,240,0.4)" strokeWidth="2" x1="52" x2="232" y1="918" y2="918" />
                {[52, 97, 142, 187, 232].map((tick) => (
                  <line key={tick} stroke="rgba(240,240,240,0.4)" strokeWidth="2" x1={tick} x2={tick} y1="910" y2="926" />
                ))}
                <text className="fill-[rgba(240,240,240,0.45)] font-label text-[16px]" x="250" y="924">
                  100 M
                </text>
              </g>
              {/* coordinate ticks */}
              <g opacity="0.5">
                {[200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100].map((tick) => (
                  <line key={tick} stroke="rgba(240,240,240,0.14)" strokeWidth="1.5" x1={tick} x2={tick} y1="110" y2="122" />
                ))}
                {[200, 300, 400, 500, 600, 700, 800].map((tick) => (
                  <line key={tick} stroke="rgba(240,240,240,0.14)" strokeWidth="1.5" x1="100" x2="112" y1={tick + 20} y2={tick + 20} />
                ))}
              </g>

              {/* arrival route (selected pin) */}
              {route && (
                <g data-route>
                  <path className={reduced ? undefined : "dash-run"} d={route} stroke="rgba(203,132,14,0.65)" strokeDasharray="16 12" strokeWidth="3.5" />
                  {!reduced && (
                    <circle fill="#ffcf7a" r="6.5">
                      <animateMotion dur="2.1s" path={route} repeatCount="indefinite" />
                    </circle>
                  )}
                </g>
              )}

              {/* pickup pins */}
              {SPOTS.map((spot, index) => {
                const isActive = active?.id === spot.id;
                const isHovered = hovered === spot.id;
                const labelLeft = spot.x > 900;
                return (
                  <motion.g
                    className="cursor-crosshair outline-none"
                    data-pin={spot.id}
                    initial={reduced ? false : { opacity: 0, scale: 0.4 }}
                    key={spot.id}
                    onBlur={() => setHovered(null)}
                    onClick={(event) => {
                      event.stopPropagation();
                      select(spot);
                    }}
                    onFocus={() => setHovered(spot.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        select(spot);
                      }
                      if (event.key === "Escape") setActive(null);
                    }}
                    onMouseEnter={() => setHovered(spot.id)}
                    onMouseLeave={() => setHovered(null)}
                    role="button"
                    style={{ transformBox: "fill-box", transformOrigin: "center" }}
                    tabIndex={0}
                    transition={{ type: "spring", stiffness: 340, damping: 22, delay: reduced ? 0 : 0.8 + index * 0.06 }}
                    viewport={{ once: true }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    aria-label={`${spot.name} — ${spot.live} items live`}
                  >
                    <circle cx={spot.x} cy={spot.y} fill={PIN_GLOW} opacity={isActive ? 1 : isHovered ? 0.85 : 0.55} r="36" />
                    <circle
                      className="pin-ring"
                      cx={spot.x}
                      cy={spot.y}
                      fill="none"
                      opacity={isActive ? 0.9 : 0.45}
                      r="13"
                      stroke="#cb840e"
                      strokeWidth="2"
                    />
                    <circle
                      cx={spot.x}
                      cy={spot.y}
                      fill={isActive ? "#ffe9c4" : "#ffcf7a"}
                      r={isActive ? 8 : 6}
                      stroke="#0c0906"
                      strokeWidth="2"
                    />
                    <text
                      className={`font-label text-[26px] dt:text-[18px] ${
                        isActive ? "fill-[#ffcf7a]" : isHovered ? "fill-[#e0a83f]" : "fill-[#cb840e]"
                      }`}
                      textAnchor={labelLeft ? "end" : "start"}
                      x={labelLeft ? spot.x - 22 : spot.x + 22}
                      y={spot.y + 7}
                    >
                      [ {spot.name.toUpperCase()} ]
                    </text>
                    <circle cx={spot.x} cy={spot.y} fill="transparent" r="30" />
                  </motion.g>
                );
              })}
            </motion.svg>
          </div>

          {/* spot card — in-flow below the map on phones, floating by the pin on desktop */}
          <AnimatePresence>
              {active && (
                <motion.div
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className={`relative mx-3 mb-3 z-20 border border-accent/60 bg-black p-3.5 dt:absolute dt:bottom-auto dt:left-[var(--pin-x)] dt:m-0 dt:top-[var(--pin-y)] dt:w-[330px] dt:-translate-x-1/2 dt:p-5 ${
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
                      "--pin-y": `${(active.y / BOARD.h) * 100}%`,
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
            {Object.entries(ZONES).map(([id, zone]) => (
              <span className="flex items-center gap-1.5 font-label text-[9px] text-ink/45" key={id}>
                <span className="size-2.5 border" style={{ backgroundColor: zone.fill, borderColor: zone.stroke }} />
                {zone.label}
              </span>
            ))}
            <span className="flex items-center gap-1.5 font-label text-[9px] text-accent">
              <span className="pin-ring block size-2.5 rounded-full border border-accent" />
              PICKUP POINT
            </span>
            <span className="flex items-center gap-1.5 font-label text-[9px] text-ink/45">
              <span className="inline-block size-2.5 rotate-45 border border-accent bg-accent/20" />
              GATE
            </span>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
