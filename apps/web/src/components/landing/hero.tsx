"use client";

import Link from "next/link";
import { motion, useScroll } from "motion/react";
import { useRef } from "react";
import { bounceLeft, fadeUp, staggerContainer } from "@/lib/motion/variants";
import { useParallaxY } from "@/lib/motion/use-parallax";
import { DeviceStage } from "./device/stage";

/** Boarding-pass notched top strip — the signature ticket header. */
export function TicketTopBar({ className = "" }: { className?: string }) {
  return (
    <span
      className={`flex h-4 items-center rounded-xs border-2 border-accent p-0.5 ${className}`}
    >
      <span className="h-1 w-full rounded-xs bg-accent" />
    </span>
  );
}

export function CargoMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#f0f0f0" height="34" width="34" x="3" y="3" />
      <path d="M12 27V13h10l-6 7h6v7H12z" fill="#003993" />
      <rect fill="#cb840e" height="4" width="14" x="13" y="23" />
    </svg>
  );
}

export function LandingHero() {
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    offset: ["start start", "end start"],
    target: heroRef,
  });

  // scroll depth: front layers (copy) lift and fade, device drifts slower
  const copyY = useParallaxY(scrollYProgress, 0, -120);
  const copyOpacity = useParallaxY(scrollYProgress, 1, 0.15);
  const deviceY = useParallaxY(scrollYProgress, 0, -70);

  return (
    <section ref={heroRef} className="relative isolate min-h-[100svh] overflow-hidden">

      <header className="relative z-10 flex items-center justify-between px-4 py-4 dt:px-10 dt:py-6">
        <div className="flex items-center gap-3">
          <CargoMark className="size-9" />
          <span className="font-secondary text-ink">BORROWBUDDY</span>
        </div>
        <span className="flex items-center gap-2 border border-ink/80 px-2 py-1.5">
          <span className="font-title text-xl text-accent">BB</span>
          <span className="font-label text-[9px] leading-tight text-ink">
            CAMPUS LENDING
            <br />
            SERVICE · BU
          </span>
        </span>
      </header>

      <div className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-4 pb-14 pt-6 dt:min-h-[calc(100svh-6rem)] dt:grid-cols-[1.02fr_0.98fr] dt:gap-4 dt:px-10 dt:pb-10">
        {/* left — copy column (front scroll layer: lifts + fades) */}
        <motion.div style={{ y: copyY, opacity: copyOpacity }}>
          <motion.div animate="show" initial="hidden" variants={staggerContainer}>
          <motion.p className="font-secondary text-[13px] text-accent dt:text-base" variants={fadeUp}>
            <span className="typewriter">[ BENNETT UNIVERSITY · EST. 2016 ]</span>
          </motion.p>

          <motion.h1 className="type-title mt-8" variants={staggerContainer}>
            <motion.span className="block" variants={bounceLeft}>
              The Campus
            </motion.span>
            <motion.span className="block text-accent" variants={bounceLeft}>
              Lending Network
            </motion.span>
          </motion.h1>

          <motion.div
            className="type-body mt-10 max-w-xl text-[15px] leading-7 dt:text-lg dt:leading-8"
            variants={fadeUp}
          >
            <p>
              <span className="type-body-alt">
                Borrow anything on campus — cameras, projectors, fans, board games —
              </span>{" "}
              from verified Bennett students, handed over by QR, tracked end to end. You
              request, they accept, the loan moves.{" "}
              <span className="type-body-alt text-accent">
                No group-chat chaos. No ghosting.
              </span>
            </p>
          </motion.div>

          <motion.div className="mt-10 flex flex-col items-start gap-6" variants={fadeUp}>
            <Link
              className="flex w-fit items-center gap-4 bg-black p-4 font-secondary text-[1.25rem] text-accent transition-colors duration-300 hover:text-warn"
              href="/login"
            >
              <span className="text-accent">▶</span>
              START BORROWING
            </Link>

            <div className="flex flex-wrap gap-6">
              {["QR VERIFIED", "SINGLE-USE CODES", "TRUST SCORES"].map((label, i) => (
                <p
                  className="status-bracket blink-label text-[11px] opacity-70"
                  key={label}
                  style={{ animationDelay: `${0.4 * i}s` }}
                >
                  [ {label} ]
                </p>
              ))}
            </div>
          </motion.div>
        </motion.div>
        </motion.div>

        {/* right — the 3D device (near scroll layer: drifts slower) */}
        <motion.div style={{ y: deviceY }}>
          <motion.div
            animate={{ opacity: 1 }}
            className="h-[420px] dt:h-[min(78vh,720px)]"
            initial={{ opacity: 0 }}
            transition={{ duration: 0.4, delay: 1.15 }}
          >
            <DeviceStage />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
