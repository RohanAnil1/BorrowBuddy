"use client";

import { motion, useScroll } from "motion/react";
import { useRef } from "react";
import { Camera } from "lucide-react";
import { EASE } from "@/lib/motion/variants";
import { useParallaxY } from "@/lib/motion/use-parallax";

const CYCLE = 7;

export function BorrowQueue() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    offset: ["start end", "end start"],
    target: sectionRef,
  });
  const sceneY = useParallaxY(scrollYProgress, 26, -26);

  return (
    <section
      className="relative isolate flex min-h-[100svh] flex-col overflow-hidden"
      ref={sectionRef}
    >
      <div className="px-4 pt-16 dt:px-10 dt:pt-24">
        <h2 className="type-title title-arrow">The Borrow Queue</h2>
        <p className="font-secondary mt-4 max-w-md text-[11px] leading-5 text-ink/50">
          EVERY LOAN MOVES THROUGH FOUR GATES:
          <br />
          REQUESTED → ACCEPTED → HANDED OVER → RETURNED. WATCH ONE CROSS THE CAMPUS.
        </p>
      </div>

      {/* handover scene — counter-parallax layer */}
      <motion.div className="flex flex-1 items-center justify-center px-4 py-16 dt:px-10" style={{ y: sceneY }}>
        <div className="relative w-full max-w-3xl">
          {/* trail */}
          <svg aria-hidden className="w-full" fill="none" viewBox="0 0 520 260" xmlns="http://www.w3.org/2000/svg">
            <motion.path
              animate={{ pathLength: [0, 0, 1, 1, 0], opacity: [0.8, 0.8, 0.8, 0.8, 0] }}
              d="M90 190 C 180 60, 340 60, 430 190"
              stroke="#cb840e"
              strokeDasharray="6 8"
              strokeLinecap="round"
              strokeWidth={3}
              style={{ pathLength: 0, opacity: 0.8 }}
              transition={{ duration: CYCLE, repeat: Infinity, ease: EASE, times: [0, 0.18, 0.45, 0.85, 1] }}
            />
          </svg>

          {/* avatar tags */}
          <div className="absolute left-0 top-1/2 w-32 -translate-y-1/2 dt:w-40">
            <AvatarTag initials="RY" label="R. SHARMA" role="OWNER" />
          </div>
          <div className="absolute right-0 top-1/2 w-32 -translate-y-1/2 dt:w-40">
            <AvatarTag initials="MI" label="MIRA K." role="BORROWER" />
          </div>

          {/* flying item — motion animates left/top (layout), inner div owns the static centering transform */}
          <motion.div
            animate={{
              left: ["2%", "2%", "74%", "74%", "2%"],
              top: ["50%", "50%", "34%", "50%", "50%"],
            }}
            className="absolute z-10"
            style={{ left: "2%", top: "50%" }}
            transition={{ duration: CYCLE, repeat: Infinity, ease: EASE, times: [0, 0.18, 0.45, 0.62, 1] }}
          >
            <div className="-translate-y-1/2">
              <motion.div
                animate={{ rotateY: [0, 0, 180, 180, 0] }}
                transition={{ duration: CYCLE, repeat: Infinity, ease: EASE, times: [0, 0.18, 0.45, 0.62, 1] }}
              >
                <CargoTag>
                  <Camera className="size-8 text-accent" />
                  <span className="font-secondary mt-2 text-[9px] text-ink/70">SONY A7 III</span>
                </CargoTag>
              </motion.div>
            </div>
          </motion.div>

          {/* arrival checkmark */}
          <motion.div
            animate={{ opacity: [0, 0, 1, 1, 0], scale: [0.6, 0.6, 1, 1, 0.6] }}
            className="absolute right-0 top-[8%] z-10 flex items-center gap-2"
            transition={{ duration: CYCLE, repeat: Infinity, ease: EASE, times: [0, 0.4, 0.52, 0.85, 0.95] }}
          >
            <span className="flex size-8 items-center justify-center rounded-full border-2 border-accent">
              <svg className="size-4" fill="none" stroke="#cb840e" strokeWidth={3} viewBox="0 0 24 24">
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="status-bracket text-[11px]">[ HANDED OVER ]</span>
          </motion.div>
        </div>
      </motion.div>

      <div className="flex flex-wrap items-center justify-center gap-8 px-4 pb-16 dt:px-10">
        {["QR VERIFIED", "SINGLE-USE CODES", "CUSTODY CHAIN LOGGED"].map((label) => (
          <p className="status-bracket blink-label text-[12px] opacity-70" key={label}>
            [ {label} ]
          </p>
        ))}
      </div>
    </section>
  );
}

function AvatarTag({ initials, label, role }: { initials: string; label: string; role: string }) {
  return (
    <div className="border border-line bg-black p-3">
      <span className="flex size-10 items-center justify-center bg-panel font-title text-lg text-ink">
        {initials}
      </span>
      <p className="font-secondary mt-2 text-[10px] text-ink">{label}</p>
      <p className="font-secondary mt-0.5 text-[9px] text-accent">{role}</p>
    </div>
  );
}

function CargoTag({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-24 flex-col items-center border border-line bg-panel p-3 dt:w-28">
      {children}
    </div>
  );
}
