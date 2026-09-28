"use client";

import { motion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { EASE } from "@/lib/motion/variants";
import { LineFallback } from "./line/fallback";
import { GATES, type GatePhase, type LineSync } from "./line/timeline";

const CargoLineCanvas = dynamic(() => import("./line/canvas"), {
  ssr: false,
  loading: () => <LineFallback />,
});

type Gpu = "checking" | "webgl" | "fallback";

function detectWebGL(): Gpu {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2", { antialias: true }) ??
      canvas.getContext("webgl", { antialias: true });
    return gl ? "webgl" : "fallback";
  } catch {
    return "fallback";
  }
}

/* ---------------------------------------------------------------------------
   "The Lending Line" — a dark shipping-hall stage. Four scanner stations
   straddle a live conveyor; a paper-parcel rides the belt, wakes each gate as
   it approaches (LED chase, sonar, curtains quiver), gets scanned and stamped
   at the dwell, turns to its custody-chain side at handover and back before
   the return gate — trailing a trust chip as it leaves. The WebGL scene owns
   the clock; only discrete phase changes cross back into React for the DOM
   log row. Reduced motion renders one still frame; no WebGL falls back to a
   static 2D stand-in.
   --------------------------------------------------------------------------- */

const EMPTY_SYNC: LineSync = {
  activeGate: null,
  wakingGate: null,
  lastActive: null,
  stamps: 0,
  crateIndex: 0,
  count: 0,
};

export function BorrowQueue() {
  const sectionRef = useRef<HTMLElement>(null);
  const lastGate = useRef<number | null>(null);
  const [inView, setInView] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [gpu, setGpu] = useState<Gpu>("checking");
  const [rich, setRich] = useState(false);
  const [spread, setSpread] = useState(true);
  const [sync, setSync] = useState<LineSync>(EMPTY_SYNC);
  const [counts, setCounts] = useState<number[]>(() => GATES.map(() => 0));
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    // WebGL support is only knowable client-side; a single derived set here is
    // the standard "browser capability probe" pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGpu(detectWebGL());
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 800px)");
    const apply = () => {
      setRich(query.matches);
      setSpread(query.matches);
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.12,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onVisibility = () => setTabHidden(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const handleSync = useCallback((next: LineSync) => {
    setSync(next);
    if (next.activeGate !== null && next.activeGate !== lastGate.current) {
      lastGate.current = next.activeGate;
      setCounts((prev) => prev.map((count, i) => (i === next.activeGate ? count + 1 : count)));
    }
  }, []);

  const phaseFor = (index: number): GatePhase => {
    if (reduced) return "still";
    if (sync.activeGate === index) return "scan";
    if (sync.wakingGate === index) return "wake";
    if (sync.lastActive === index) return "after";
    return "idle";
  };

  const running = inView && !tabHidden && gpu === "webgl";

  return (
    <section
      aria-label="The borrowing line — how a loan moves through four gates"
      className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-[#0b0805]"
      ref={sectionRef}
    >
      <p className="sr-only">
        Animation: a loan parcel rides a conveyor belt through four scanner gates — requested,
        accepted, handed over by QR scan, and returned — collecting a stamp at each gate and
        turning to show its custody chain at handover.
      </p>

      {/* edge fades back into the page navy */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-canvas to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-t from-canvas to-transparent"
      />

      <div className="relative z-[1] flex flex-col justify-between gap-6 px-4 pt-14 dt:flex-row dt:items-start dt:px-10 dt:pt-20">
        <div>
          <h2 className="type-title title-arrow">The Borrow Queue</h2>
          <p className="font-secondary mt-4 max-w-xl text-[11px] leading-5 text-ink/50">
            THE CAMPUS BELT RUNS 24/7 — EVERY LOAN RIDES THE LINE
            <br />
            THROUGH FOUR GATES: REQUESTED → ACCEPTED → HANDED OVER → RETURNED.
          </p>
        </div>
        <div className="flex items-center gap-2 dt:pt-4">
          <span className="size-1.5 blink-label bg-accent" />
          <span className="font-label text-[8px] text-ink/40 dt:text-[9px]">
            [ LIVE · LINE 04 · BELT 24/7 ]
          </span>
        </div>
      </div>

      {/* the hall — full-bleed stage */}
      <div className="relative z-[1] flex flex-1 items-center py-6">
        <div className="relative h-[430px] w-full dt:h-[540px]" data-line-stage>
          {gpu === "webgl" ? (
            <CargoLineCanvas
              onSync={handleSync}
              reduced={reduced}
              rich={rich && !reduced}
              running={running}
              spread={spread}
            />
          ) : (
            <LineFallback />
          )}

          {/* hall vignette */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 95% at 50% 38%, transparent 52%, rgba(0,0,0,0.62) 100%)",
            }}
          />

          {/* probe mirrors */}
          {GATES.map((gate, index) => (
            <span aria-hidden className="hidden" data-gate={index} data-phase={phaseFor(index)} key={gate.code} />
          ))}
          <span
            aria-hidden
            className="hidden"
            data-crate
            data-stamps={reduced ? GATES.length - 1 : sync.stamps}
          />
        </div>
      </div>

      <div className="relative z-[1] flex flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 pb-14 dt:px-10">
        {GATES.map((gate, index) => (
          <div className="flex items-center gap-2" key={gate.code}>
            <span className="hidden font-label text-[10px] text-ink/40 dt:inline">{gate.caption}</span>
            <span className="font-secondary text-[8px] text-ink/35 dt:text-[9px]">
              [ {gate.code} ·{" "}
              <span className="inline-block overflow-hidden align-bottom">
                <motion.span
                  animate={{ opacity: 1, y: 0 }}
                  className="inline-block"
                  initial={{ opacity: 0, y: 7 }}
                  key={counts[index]}
                  transition={{ duration: 0.22, ease: EASE }}
                >
                  {String(counts[index]).padStart(3, "0")}
                </motion.span>
              </span>{" "}
              ]
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
