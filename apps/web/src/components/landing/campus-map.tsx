"use client";

import { motion, useScroll } from "motion/react";
import { useRef } from "react";
import { CampusBoard } from "@/components/app/campus-board";
import { useParallaxY } from "@/lib/motion/use-parallax";
import { SPOTS, type MapSpot } from "@/lib/campus-map";

/* ---------------------------------------------------------------------------
   "Where you pick up" — the landing section around the campus board. The
   board itself (photo, pins, route, card, rail) is shared with the in-app
   pickup map so the two surfaces cannot drift apart.
   --------------------------------------------------------------------------- */

export function CampusMap({ spots = SPOTS }: { spots?: MapSpot[] }) {
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    offset: ["start end", "end start"],
    target: sectionRef,
  });
  const boardY = useParallaxY(scrollYProgress, 26, -26);

  return (
    <section
      aria-label="Campus pickup map — Bennett University master plan"
      className="relative mb-16 isolate flex w-full flex-col gap-10 px-4 select-none dt:mb-36 dt:px-10"
      ref={sectionRef}
    >
      <p className="sr-only">
        Photograph of the Bennett University master plan board with {spots.length} BorrowBuddy
        pickup points: {spots.map((spot) => spot.name).join(", ")}. Selecting a point dims the
        board, draws its arrival route from Gate 1 and shows its details.
      </p>

      <div className="flex w-full flex-col justify-between gap-10 dt:flex-row dt:items-start">
        <h2 className="type-title title-arrow shrink-0">Where you pick up</h2>
        <p className="type-body w-full text-[15px] leading-7 uppercase dt:w-[40%] dt:text-lg">
          <span className="type-body-alt">
            BorrowBuddy hands over at fixed campus spots — Maggi Hotspot by C1, Southern
            Stories by D1, the D5 stage, the laundry desk and Quench by the sports complex.
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
        <CampusBoard spots={spots} />
      </motion.div>
    </section>
  );
}
