"use client";

import { motion, useScroll } from "motion/react";
import { useRef, useState } from "react";
import { EASE } from "@/lib/motion/variants";
import { useParallaxY } from "@/lib/motion/use-parallax";

type Spot = {
  id: string;
  label: string;
  x: number; // viewBox coords (0-1000 x, 0-660 y)
  y: number;
  live: number;
};

const SPOTS: Spot[] = [
  { id: "library", label: "LIBRARY", x: 300, y: 180, live: 14 },
  { id: "sac", label: "SAC", x: 620, y: 140, live: 9 },
  { id: "hostel", label: "HOSTEL COURTS", x: 760, y: 420, live: 21 },
  { id: "cafeteria", label: "CAFETERIA", x: 380, y: 470, live: 6 },
  { id: "blocka", label: "ACADEMIC BLOCK-A", x: 180, y: 330, live: 11 },
];

const ZONES = [
  "M 40 40 L 460 40 L 460 260 L 40 260 Z", // academic ring
  "M 520 40 L 960 40 L 960 240 L 520 240 Z", // sac field
  "M 560 320 L 960 320 L 960 600 L 560 600 Z", // hostels
  "M 40 520 L 480 520 L 480 620 L 40 620 Z", // cafeteria strip
  "M 120 300 L 440 300 L 440 480 L 120 480 Z", // block-a quad
];

export function CampusMap() {
  const [active, setActive] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    offset: ["start end", "end start"],
    target: sectionRef,
  });
  const mapY = useParallaxY(scrollYProgress, 30, -30);
  const spot = SPOTS.find((s) => s.id === active) ?? null;

  return (
    <section
      className="relative mb-16 isolate flex w-full flex-col gap-12 px-4 select-none dt:mb-36 dt:px-10"
      ref={sectionRef}
    >
      <div className="flex w-full flex-col justify-between gap-10 dt:flex-row dt:items-start">
        <h2 className="type-title title-arrow shrink-0">Where you pick up</h2>
        <p className="type-body w-full text-[15px] leading-7 uppercase dt:w-[40%] dt:text-lg">
          <span className="type-body-alt">
            BorrowBuddy hands over at fixed campus spots — library gate, SAC, hostel
            courts and more.
          </span>{" "}
          Every listing pins its pickup point, and the map shows what is live right
          now.{" "}
          <span className="type-body-alt text-accent">
            Explore the map and see where your next borrow waits.
          </span>
        </p>
      </div>

      <motion.div className="relative flex w-full items-center justify-center bg-deep py-8 dt:px-40" style={{ y: mapY }}>
        <div className="relative w-full" style={{ aspectRatio: "1063 / 700" }}>
          <svg
            className="relative h-auto w-full"
            fill="none"
            viewBox="0 0 1000 660"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* zone outlines */}
            {ZONES.map((d) => (
              <path
                d={d}
                key={d}
                stroke="#ffffff"
                strokeOpacity={0.22}
                strokeWidth={2}
              />
            ))}

            {/* active arc from library to selected spot */}
            {spot && spot.id !== "library" && (
              <motion.path
                animate={{ pathLength: 1, opacity: 1 }}
                className="draw-arc"
                d={`M ${SPOTS[0].x} ${SPOTS[0].y} Q ${(SPOTS[0].x + spot.x) / 2} ${
                  Math.min(SPOTS[0].y, spot.y) - 90
                } ${spot.x} ${spot.y}`}
                initial={{ pathLength: 0, opacity: 0 }}
                stroke="#cb840e"
                strokeWidth={3}
              />
            )}

            {/* hotspots */}
            {SPOTS.map((s) => {
              const isActive = active === s.id;
              return (
                <g
                  className="cursor-pointer"
                  key={s.id}
                  onClick={() => setActive(isActive ? null : s.id)}
                  onMouseEnter={() => setActive(s.id)}
                >
                  <circle
                    cx={s.x}
                    cy={s.y}
                    fill="none"
                    r={16}
                    stroke={isActive ? "#cb840e" : "#ffffff"}
                    strokeOpacity={isActive ? 1 : 0.7}
                    strokeWidth={1.5}
                    style={{ transition: "stroke 0.18s" }}
                  />
                  <circle cx={s.x} cy={s.y} fill={isActive ? "#cb840e" : "#ffffff"} r={4} style={{ transition: "fill 0.18s" }} />
                </g>
              );
            })}
          </svg>

          {/* blinking labels */}
          {SPOTS.map((s, i) => (
            <span
              className={`blink-label pointer-events-none absolute font-secondary text-[0.9rem] uppercase text-accent dt:text-[1.1rem] ${
                active === s.id ? "opacity-100" : "opacity-70"
              }`}
              key={s.id}
              style={{
                left: `${(s.x / 1000) * 100 + 2}%`,
                top: `${(s.y / 660) * 100 - 4}%`,
                animationDelay: `${i * 0.4}s`,
              }}
            >
              [ {s.label} ]
            </span>
          ))}

          {/* selected spot chip — country-dropdown-in equivalent */}
          {spot && (
            <motion.div
              animate={{ opacity: 1, y: -12 }}
              className="absolute z-10 -translate-x-1/2 -translate-y-full border border-line bg-black p-4"
              initial={{ opacity: 0, y: 0 }}
              style={{
                left: `${(spot.x / 1000) * 100}%`,
                top: `${(spot.y / 660) * 100}%`,
              }}
              transition={{ duration: 0.22, ease: EASE }}
            >
              <p className="font-secondary text-[11px] text-accent">[ {spot.label} ]</p>
              <p className="type-body-alt mt-1 text-[13px] text-ink">
                {spot.live} items live · pickup queue open
              </p>
             </motion.div>
           )}
         </div>
      </motion.div>
    </section>
  );
}
