"use client";

import { AnimatePresence, motion, useAnimate, useAnimationFrame, useMotionValue, useReducedMotion, useScroll, type Variants } from "motion/react";
import { Camera, Projector, QrCode, Speaker, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { EASE } from "@/lib/motion/variants";
import { useParallaxY } from "@/lib/motion/use-parallax";
import { CargoMark } from "./hero";

/* ---------------------------------------------------------------------------
   "The Lending Line" — a perpetual campus cargo belt. Loan parcels ride
   through four scanner portals (REQUESTED → ACCEPTED → HANDED OVER →
   RETURNED), collecting a rubber stamp at each stop; the parcel turns to its
   custody-chain side at handover and back before the return gate, exiting
   with a trust-score chip. Each gate runs its own life-cycle — boot
   assembly, idle breathing, wake-up chase, scan burst, afterglow — derived
   from one rAF clock through sparse state, never per-frame React state.
   The ride pauses off-screen, on hidden tabs and for reduced motion (which
   renders a finished still instead).
   --------------------------------------------------------------------------- */

type GateDef = { code: string; label: string; caption: string };

const GATES: GateDef[] = [
  { code: "G-01", label: "REQUESTED", caption: "OWNER APPROVES" },
  { code: "G-02", label: "ACCEPTED", caption: "DATES LOCKED IN" },
  { code: "G-03", label: "HANDED OVER", caption: "QR SCAN · CUSTODY 2/2" },
  { code: "G-04", label: "RETURNED", caption: "BACK ON THE SHELF" },
];

/** Gate centres as fractions of the stage width. */
const GATE_X = [0.125, 0.375, 0.625, 0.875];

type CrateDef = {
  id: string;
  name: string;
  from: string;
  to: string;
  serial: string;
  icon: LucideIcon;
  seed: number;
};

const CRATES: CrateDef[] = [
  { id: "sony", name: "SONY A7 III", from: "BLC", to: "LIB", serial: "8998040139", icon: Camera, seed: 3 },
  { id: "epson", name: "EPSON PROJECTOR", from: "SAC", to: "HSA", serial: "0101045216", icon: Projector, seed: 7 },
  { id: "jbl", name: "JBL SPEAKER", from: "LIB", to: "CAF", serial: "2436315621", icon: Speaker, seed: 11 },
];

/* ---------------------------------------------------------------------------
   Timeline — dwell at every gate, eased travel between. The parcel enters
   from the left edge and exits past the right; the cycle then wraps while
   the crate is off-stage.
   --------------------------------------------------------------------------- */

const START_X = -0.16;
const END_X = 1.16;
const LEAD_IN = 1100;
const DWELL = 640;
const TRAVEL = 1900;
const EXIT = 1250;

type Segment = {
  kind: "travel" | "dwell";
  from: number;
  to: number;
  gate: number | null;
  dur: number;
};

const SEGMENTS: Segment[] = (() => {
  const list: Segment[] = [{ kind: "travel", from: START_X, to: GATE_X[0], gate: null, dur: LEAD_IN }];
  for (let i = 0; i < GATES.length; i += 1) {
    list.push({ kind: "dwell", from: GATE_X[i], to: GATE_X[i], gate: i, dur: DWELL });
    if (i < GATES.length - 1) {
      list.push({ kind: "travel", from: GATE_X[i], to: GATE_X[i + 1], gate: null, dur: TRAVEL });
    }
  }
  list.push({ kind: "travel", from: GATE_X[GATES.length - 1], to: END_X, gate: null, dur: EXIT });
  return list;
})();

const CYCLE_MS = SEGMENTS.reduce((sum, segment) => sum + segment.dur, 0);
/** Custody changes hands between gates 2 and 3 — and turns back to front on the run to gate 4. */
const FLIP_OUT = SEGMENTS.findIndex((segment) => segment.kind === "travel" && segment.from === GATE_X[1]);
const FLIP_BACK = SEGMENTS.findIndex((segment) => segment.kind === "travel" && segment.from === GATE_X[2]);

/** Stamp scatter on the parcel face — postmarks over the route/barcode, never the name. */
const STAMP_POS = [
  { x: "4%", y: "48%", rotate: -9 },
  { x: "30%", y: "52%", rotate: -5 },
  { x: "6%", y: "62%", rotate: -11 },
  { x: "26%", y: "70%", rotate: -7 },
];

const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/·#";

function locate(et: number) {
  let acc = 0;
  for (let i = 0; i < SEGMENTS.length; i += 1) {
    const segment = SEGMENTS[i];
    if (et < acc + segment.dur) return { index: i, local: (et - acc) / segment.dur };
    acc += segment.dur;
  }
  return { index: SEGMENTS.length - 1, local: 1 };
}

const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const clamp01 = (p: number) => Math.min(1, Math.max(0, p));

/* ---------------------------------------------------------------------------
   Gate life-cycle — "still" is the reduced-motion pose.
   --------------------------------------------------------------------------- */

type GatePhase = "idle" | "wake" | "scan" | "after" | "still";

/** Boot assembly — the gate powers up part by part, left to right. */
const ASSEMBLE: Variants = {
  hidden: {},
  show: (index: number) => ({
    transition: { staggerChildren: 0.07, delayChildren: 0.08 + index * 0.13 },
  }),
};

const POST_IN: Variants = {
  hidden: { scaleY: 0 },
  show: { scaleY: 1, transition: { duration: 0.42, ease: EASE } },
};

const BAR_IN: Variants = {
  hidden: { scaleX: 0, opacity: 0 },
  show: { scaleX: 1, opacity: 1, transition: { duration: 0.32, ease: EASE } },
};

const HEAD_IN: Variants = {
  hidden: { opacity: 0, y: -5 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } },
};

const SOFT_IN: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.35, ease: EASE } },
};

export function BorrowQueue() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const stageWidthRef = useRef(0);
  const clock = useRef({ elapsed: 0, segment: -1, cycle: 0, last: -1, wake: -1 });
  const trustTimer = useRef<number | null>(null);

  const [stageWidth, setStageWidth] = useState(0);
  const [inView, setInView] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [crateIndex, setCrateIndex] = useState(0);
  const [stamps, setStamps] = useState(0);
  const [activeGate, setActiveGate] = useState<number | null>(null);
  const [wakingGate, setWakingGate] = useState<number | null>(null);
  const [lastActive, setLastActive] = useState<number | null>(null);
  const [beamSeq, setBeamSeq] = useState(0);
  const [flash, setFlash] = useState(0);
  const [counts, setCounts] = useState<number[]>(() => GATES.map(() => 0));
  const [trust, setTrust] = useState(false);

  const reduced = useReducedMotion() ?? false;

  const crateX = useMotionValue(0);
  const crateBob = useMotionValue(0);
  const crateSway = useMotionValue(0);
  const crateFlip = useMotionValue(0);

  const [shakeScope, animateShake] = useAnimate();

  const { scrollYProgress } = useScroll({ offset: ["start end", "end start"], target: sectionRef });
  const stageY = useParallaxY(scrollYProgress, 22, -22);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      stageWidthRef.current = entry.contentRect.width;
      setStageWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.15,
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

  useEffect(
    () => () => {
      if (trustTimer.current !== null) window.clearTimeout(trustTimer.current);
    },
    [],
  );

  // Park the parcel just off the left edge until the ride starts (and on resize).
  useEffect(() => {
    if (reduced || stageWidth <= 0 || clock.current.elapsed > 1) return;
    crateX.set(START_X * stageWidth);
  }, [crateX, reduced, stageWidth]);

  // Reduced motion — a finished still: parcel stamped at the handover gate.
  useEffect(() => {
    if (!reduced || stageWidth <= 0) return;
    crateX.set(GATE_X[2] * stageWidth);
    crateBob.set(0);
    crateSway.set(0);
    crateFlip.set(0);
  }, [crateBob, crateFlip, crateSway, crateX, reduced, stageWidth]);

  const running = !reduced && inView && !tabHidden && stageWidth > 0;

  useAnimationFrame((time, delta) => {
    const c = clock.current;
    if (!running) return;
    if (c.last < 0) {
      c.last = time;
      return;
    }
    c.elapsed += Math.min(delta, 48);

    const cycle = Math.floor(c.elapsed / CYCLE_MS);
    const { index: segmentIndex, local } = locate(c.elapsed % CYCLE_MS);
    const segment = SEGMENTS[segmentIndex];

    // Parcel position — eased travel between gates, held dwell under each.
    const center =
      segment.kind === "travel"
        ? segment.from + (segment.to - segment.from) * easeInOutCubic(local)
        : segment.from;
    crateX.set(center * stageWidthRef.current);
    crateBob.set(Math.sin(time / 380) * 2.6 + (segment.kind === "dwell" ? 0.8 : 0));
    crateSway.set(Math.sin(time / 420) * 0.8);

    // Custody flip — turns to the chain side at handover, back to the face after.
    const flip =
      segmentIndex < FLIP_OUT
        ? 0
        : segmentIndex === FLIP_OUT
          ? clamp01((local - 0.34) / 0.26)
          : segmentIndex === FLIP_BACK
            ? 1 - clamp01((local - 0.25) / 0.3)
            : segmentIndex < FLIP_BACK
              ? 1
              : 0;
    crateFlip.set(flip * 180);

    // Gate events — fires once per segment boundary.
    if (segmentIndex !== c.segment) {
      const previous = c.segment >= 0 ? SEGMENTS[c.segment] : null;
      c.segment = segmentIndex;
      if (previous?.kind === "dwell" && previous.gate !== null) {
        setLastActive(previous.gate);
      }
      if (segment.kind === "dwell" && segment.gate !== null) {
        const gate = segment.gate;
        setActiveGate(gate);
        setWakingGate(null);
        c.wake = -1;
        setStamps(gate + 1);
        setBeamSeq((seq) => seq + 1);
        setFlash((n) => n + 1);
        setCounts((prev) => prev.map((count, i) => (i === gate ? count + 1 : count)));
        if (shakeScope.current) {
          void animateShake(
            shakeScope.current,
            { x: [0, -2.4, 2.4, -1.2, 0] },
            { duration: 0.32, ease: EASE },
          );
        }
        if (gate === GATES.length - 1) {
          setTrust(true);
          if (trustTimer.current !== null) window.clearTimeout(trustTimer.current);
          trustTimer.current = window.setTimeout(() => setTrust(false), 1500);
        }
      } else {
        setActiveGate(null);
      }
    }

    // Wake-up — the destination gate powers on as the parcel closes in.
    if (segment.kind === "travel" && local > 0.7) {
      const destination = GATE_X.indexOf(segment.to);
      if (destination >= 0 && c.wake !== destination) {
        c.wake = destination;
        setWakingGate(destination);
      }
    }

    if (cycle !== c.cycle) {
      c.cycle = cycle;
      setCrateIndex((index) => (index + 1) % CRATES.length);
      setStamps(0);
      setTrust(false);
      setLastActive(null);
    }
  });

  const crate = CRATES[crateIndex];
  const shownStamps = reduced ? GATES.length - 1 : stamps;
  const shownTrust = !reduced && trust;

  const phaseFor = (index: number): GatePhase => {
    if (reduced) return "still";
    if (activeGate === index) return "scan";
    if (wakingGate === index) return "wake";
    if (lastActive === index) return "after";
    return "idle";
  };

  return (
    <section
      aria-label="The borrowing line — how a loan moves through four gates"
      className="relative isolate flex min-h-[100svh] flex-col overflow-hidden"
      ref={sectionRef}
    >
      <p className="sr-only">
        Animation: a loan parcel rides a conveyor belt through four gates — requested,
        accepted, handed over by QR scan, and returned — collecting a stamp at each gate
        and turning to show its custody chain at handover.
      </p>

      <div className="flex flex-col justify-between gap-6 px-4 pt-16 dt:flex-row dt:items-start dt:px-10 dt:pt-24">
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

      {/* handover line — counter-parallax layer */}
      <div className="flex flex-1 items-center px-4 py-8 dt:px-10">
        <motion.div className="mx-auto w-full max-w-6xl" style={{ y: stageY }}>
          <div className="relative h-[300px] w-full dt:h-[430px]" data-lending-line ref={stageRef}>
            <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-ink/10" />

            {GATES.map((gate, index) => (
              <Gate
                beamSeq={beamSeq}
                count={counts[index]}
                gate={gate}
                index={index}
                key={gate.code}
                phase={phaseFor(index)}
                reduced={reduced}
              />
            ))}

            {/* the belt */}
            <div className="absolute inset-x-0 bottom-8 h-11 dt:bottom-11 dt:h-16">
              <div
                aria-hidden
                className="absolute inset-0 border-y border-ink/15"
                style={{
                  background: "linear-gradient(180deg, rgba(240,240,240,0.06), rgba(0,0,0,0.32))",
                }}
              />
              <div className="absolute inset-x-0 top-[7px] overflow-hidden dt:top-[9px]">
                <div className="belt-run flex w-max items-center gap-3 dt:gap-4">
                  {[0, 1].map((copy) => (
                    <div aria-hidden className="flex shrink-0 items-center gap-3 dt:gap-4" key={copy}>
                      {Array.from({ length: 72 }).map((_, i) => (
                        <span className="h-[3px] w-4 shrink-0 bg-paper/10 dt:w-6 dt:bg-paper/15" key={i} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <div aria-hidden className="absolute inset-x-6 bottom-[3px] flex justify-between dt:inset-x-12">
                {Array.from({ length: 12 }).map((_, i) => (
                  <span className="size-2 rounded-full border border-ink/25 bg-deep dt:size-2.5" key={i} />
                ))}
              </div>
              {GATE_X.map((fraction, index) => (
                <span
                  aria-hidden
                  className="absolute -top-[3px] h-[3px] w-px bg-paper/25"
                  key={index}
                  style={{ left: `${fraction * 100}%` }}
                />
              ))}
            </div>

            {/* the parcel */}
            {stageWidth > 0 && (
              <motion.div
                className="absolute bottom-[72px] left-0 z-20 dt:bottom-[104px]"
                data-crate
                data-stamps={shownStamps}
                style={{ x: crateX, y: crateBob, rotate: crateSway }}
              >
                <div className="-ml-8 w-16 dt:-ml-14 dt:w-28">
                  <div className="relative" ref={shakeScope}>
                    <motion.div
                      className="relative h-[96px] w-16 [transform-style:preserve-3d] dt:h-[152px] dt:w-28"
                      style={{ rotateY: crateFlip, transformPerspective: 1100 }}
                    >
                      <CrateFront crate={crate} flash={flash} reduced={reduced} stamps={shownStamps} />
                      <CrateBack crate={crate} />
                    </motion.div>

                    <span
                      aria-hidden
                      className="absolute -bottom-1.5 left-1/2 h-1 w-10 -translate-x-1/2 bg-black/35 dt:h-1.5 dt:w-16"
                    />

                    <AnimatePresence>
                      {shownTrust && (
                        <motion.div
                          animate={{ opacity: 1, y: -26, scale: 1 }}
                          className="absolute -top-2 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap border border-accent bg-black px-1.5 py-0.5 font-secondary text-[7px] text-accent dt:text-[10px]"
                          exit={{ opacity: 0, y: -40 }}
                          initial={{ opacity: 0, y: 8, scale: 0.7 }}
                          transition={{ type: "spring", stiffness: 300, damping: 22 }}
                        >
                          +8 TRUST
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-8 px-4 pb-16 dt:px-10">
        {["QR VERIFIED", "SINGLE-USE CODES", "CUSTODY CHAIN LOGGED"].map((label) => (
          <p className="status-bracket blink-label text-[11px] opacity-70" key={label}>
            [ {label} ]
          </p>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Gate — a detailed scanner portal: hanging sign, machined posts, X-truss
   upper bay, hazard-tape feet, conduit + junction box, ID plate, segment LED
   strip, scanner head (QR ring + sensor eyes + lamp cluster), scanner
   curtains and a floor light pool. All structure is drawn once; every
   animation is a transform/opacity or a phase-scoped CSS loop.
   --------------------------------------------------------------------------- */

function Gate({
  beamSeq,
  count,
  gate,
  index,
  phase,
  reduced,
}: {
  beamSeq: number;
  count: number;
  gate: GateDef;
  index: number;
  phase: GatePhase;
  reduced: boolean;
}) {
  const [recoilScope, animateRecoil] = useAnimate<HTMLDivElement>();
  const lit = phase === "scan" || phase === "still";
  const frame = lit ? "bg-accent/70" : "bg-ink/30";
  const scanning = phase === "scan" && !reduced;
  const waking = (phase === "wake" || phase === "scan") && !reduced;

  // The portal recoils a beat after the stamp punches the parcel.
  useEffect(() => {
    if (!scanning || !recoilScope.current) return;
    void animateRecoil(recoilScope.current, { y: [0, 2.5, 0] }, { duration: 0.3, ease: EASE });
  }, [animateRecoil, beamSeq, recoilScope, scanning]);

  const hazard =
    "repeating-linear-gradient(45deg, rgba(203,132,14,0.5) 0 2px, rgba(0,0,0,0.55) 2px 4px)";

  return (
    <motion.div
      className="absolute inset-y-0 z-10 -translate-x-1/2"
      custom={index}
      data-gate={index}
      data-phase={phase}
      initial="hidden"
      style={{ left: `${GATE_X[index] * 100}%` }}
      variants={ASSEMBLE}
      viewport={{ amount: 0.3, once: true }}
      whileInView="show"
    >
      {/* hanging wayfinding sign */}
      <motion.span
        aria-hidden
        className="absolute left-1/2 top-0 h-[4px] w-6 -translate-x-1/2 border-x border-ink/30 bg-ink/15"
        variants={SOFT_IN}
      />
      <motion.span
        aria-hidden
        className="absolute left-1/2 top-[4px] h-[16px] w-px -translate-x-1/2 bg-ink/25 dt:h-[26px]"
        variants={SOFT_IN}
      />
      <motion.p
        className={`absolute left-1/2 top-[24px] -translate-x-1/2 whitespace-nowrap font-label text-[8px] tracking-[0.08em] transition-colors duration-300 dt:top-[34px] dt:text-[12px] dt:tracking-[0.12em] ${
          lit ? "text-accent" : "text-ink/45"
        }`}
        variants={SOFT_IN}
      >
        [ <ScrambleText active={waking} text={gate.label} /> ]
      </motion.p>

      {/* the portal */}
      <motion.div
        className="absolute bottom-[76px] left-1/2 h-[150px] w-[76px] -translate-x-1/2 dt:bottom-[108px] dt:h-[256px] dt:w-[176px]"
        data-gate-arch
        ref={recoilScope}
      >
        {/* portal depth frame */}
        <motion.span
          aria-hidden
          className="absolute inset-x-[9px] bottom-[5px] top-[7px] border border-ink/15 dt:inset-x-[12px] dt:bottom-[8px] dt:top-[9px]"
          variants={SOFT_IN}
        />

        {/* conduit + junction box on the outer post */}
        <motion.span
          aria-hidden
          className="absolute bottom-[6px] right-[-6px] top-[38px] w-px bg-ink/25 dt:bottom-[8px] dt:right-[-8px] dt:top-[64px]"
          variants={SOFT_IN}
        />
        <motion.span
          aria-hidden
          className="absolute bottom-[3px] right-[-10px] size-[7px] border border-ink/35 bg-deep dt:bottom-[5px] dt:right-[-13px] dt:size-[9px]"
          variants={SOFT_IN}
        />

        {/* scanner curtains */}
        <motion.div
          aria-hidden
          className="absolute inset-x-[10px] bottom-[6px] top-[29px] flex justify-between dt:inset-x-[16px] dt:bottom-[8px] dt:top-[47px]"
          variants={SOFT_IN}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <span
              className="gate-curtain w-px bg-paper/20 dt:w-[1.5px]"
              key={i}
              style={{ "--i": i } as CSSProperties}
            />
          ))}
        </motion.div>

        {/* X-truss bracing in the upper bay */}
        <motion.div
          aria-hidden
          className="absolute inset-x-[3px] top-[8px] h-[18px] dt:inset-x-[5px] dt:top-[13px] dt:h-[28px]"
          variants={SOFT_IN}
        >
          <span className="absolute left-0 right-0 top-[6px] h-px origin-left rotate-[14deg] bg-paper/15 dt:top-[12px] dt:h-[1.5px] dt:rotate-[9deg]" />
          <span className="absolute left-0 right-0 top-[6px] h-px origin-right -rotate-[14deg] bg-paper/15 dt:top-[12px] dt:h-[1.5px] dt:-rotate-[9deg]" />
        </motion.div>

        {/* posts — machined with a chamfer line */}
        <motion.span
          aria-hidden
          className={`absolute inset-y-0 left-0 w-[3px] origin-bottom transition-colors duration-300 ${frame}`}
          variants={POST_IN}
        >
          <span className="absolute inset-y-0 left-full w-px bg-paper/10" />
        </motion.span>
        <motion.span
          aria-hidden
          className={`absolute inset-y-0 right-0 w-[3px] origin-bottom transition-colors duration-300 ${frame}`}
          variants={POST_IN}
        >
          <span className="absolute inset-y-0 right-full w-px bg-paper/10" />
        </motion.span>

        {/* lintel + LED strip */}
        <motion.span
          aria-hidden
          className={`absolute inset-x-0 top-0 h-[5px] transition-colors duration-300 dt:h-1.5 ${frame}`}
          variants={BAR_IN}
        />
        <motion.div
          aria-hidden
          className="absolute inset-x-[6px] top-[6px] flex justify-between dt:inset-x-[10px] dt:top-[7px]"
          variants={SOFT_IN}
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <span className="led-seg size-[2px] dt:size-[2.5px]" key={i} style={{ "--i": i } as CSSProperties} />
          ))}
        </motion.div>

        {/* gantry bar */}
        <motion.span
          aria-hidden
          className={`absolute inset-x-1 top-[26px] h-[3px] transition-colors duration-300 dt:inset-x-2 dt:top-[44px] ${frame}`}
          variants={BAR_IN}
        />

        {/* scanner head — housing, QR ring, sensor eyes, lamp cluster */}
        <motion.div
          className="absolute left-1/2 top-[26px] -translate-x-1/2 -translate-y-1/2 dt:top-[44px]"
          variants={HEAD_IN}
        >
          <span
            className={`relative flex h-[20px] w-[42px] items-center justify-center rounded-[4px] border-2 bg-black transition-colors duration-300 dt:h-[30px] dt:w-[62px] ${
              lit ? "border-accent" : "border-ink/40"
            }`}
          >
            <span
              className={`flex size-3.5 items-center justify-center rounded-full border-2 transition-colors duration-300 dt:size-5 ${
                lit ? "border-accent" : "border-ink/40"
              }`}
            >
              <QrCode className={`size-2 dt:size-3 ${lit ? "text-accent" : "text-ink/50"}`} />
            </span>
            <span
              aria-hidden
              className={`gate-eye absolute left-[3px] size-[3px] rounded-full dt:left-[5px] dt:size-1 ${
                lit ? "bg-accent" : "bg-ink/30"
              }`}
              style={{ "--i": 0 } as CSSProperties}
            />
            <span
              aria-hidden
              className={`gate-eye absolute right-[3px] size-[3px] rounded-full dt:right-[5px] dt:size-1 ${
                lit ? "bg-accent" : "bg-ink/30"
              }`}
              style={{ "--i": 1 } as CSSProperties}
            />
            <span
              aria-hidden
              className="absolute -bottom-[6px] left-1/2 flex -translate-x-1/2 gap-[3px] dt:-bottom-[7px] dt:gap-[4px]"
            >
              {[0, 1, 2].map((i) => (
                <span
                  className={`size-[3px] rounded-full dt:size-1 ${lit ? "bg-accent" : "bg-ink/30"}`}
                  key={i}
                />
              ))}
            </span>
          </span>
        </motion.div>

        {/* sonar pings while the gate is awake */}
        {waking && (
          <span aria-hidden className="pointer-events-none absolute left-1/2 top-[26px] dt:top-[44px]">
            {[0, 1, 2].map((ring) => (
              <motion.span
                animate={{ opacity: [0.75, 0], scale: [0.4, 2.05] }}
                className="absolute left-0 top-0 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-accent/80 dt:size-9"
                key={`${beamSeq}-${ring}`}
                transition={{ delay: ring * 0.45, duration: 1.5, ease: "easeOut", repeat: Infinity }}
              />
            ))}
          </span>
        )}

        {/* base strobes */}
        <span
          aria-hidden
          className={`absolute -bottom-[1px] left-[-5px] size-[3px] rounded-full dt:left-[-7px] dt:size-1 ${
            scanning ? "gate-strobe bg-warn" : "bg-ink/20"
          }`}
        />
        <span
          aria-hidden
          className={`absolute -bottom-[1px] right-[-5px] size-[3px] rounded-full dt:right-[-7px] dt:size-1 ${
            scanning ? "gate-strobe bg-warn" : "bg-ink/20"
          }`}
          style={{ animationDelay: "0.13s" }}
        />

        {/* hazard-tape feet */}
        <motion.span
          aria-hidden
          className="absolute bottom-0 left-[-4px] h-[6px] w-[11px] dt:left-[-6px] dt:h-[8px] dt:w-[15px]"
          style={{ background: hazard }}
          variants={SOFT_IN}
        />
        <motion.span
          aria-hidden
          className="absolute bottom-0 right-[-4px] h-[6px] w-[11px] dt:right-[-6px] dt:h-[8px] dt:w-[15px]"
          style={{ background: hazard }}
          variants={SOFT_IN}
        />

        {/* ID plate */}
        <motion.div
          className="absolute left-[2px] top-[48px] flex h-[16px] w-[30px] flex-col items-center justify-center border border-ink/35 bg-black dt:left-[3px] dt:top-[82px] dt:h-[22px] dt:w-[44px]"
          variants={SOFT_IN}
        >
          <span className="font-label text-[5.5px] leading-none text-ink/60 dt:text-[7.5px]">
            {gate.code}
          </span>
          <span className="mt-[2px] font-label text-[5px] leading-none text-accent dt:text-[6.5px]">
            {phase === "wake" || phase === "scan" ? (
              <ScrambleText active text="SCAN" />
            ) : phase === "after" ? (
              "OK"
            ) : (
              "···"
            )}
          </span>
        </motion.div>

        {/* floor light pool */}
        <span
          aria-hidden
          className="gate-pool absolute bottom-[2px] left-1/2 h-[9px] w-[86px] -translate-x-1/2 rounded-[100%] dt:bottom-[3px] dt:h-[13px] dt:w-[150px]"
          style={{ background: "radial-gradient(closest-side, rgba(203,132,14,0.5), rgba(203,132,14,0))" }}
        />

        {/* scan beam — core, edge hairlines, travelling hot spot */}
        {scanning && (
          <span aria-hidden className="pointer-events-none absolute bottom-0 left-1/2 top-[30px] -translate-x-1/2 dt:top-[50px]">
            <motion.span
              animate={{ opacity: [0, 1, 0.9, 0], scaleY: [0.15, 1, 1, 1] }}
              className="absolute bottom-0 left-1/2 top-0 w-[2px] origin-top -translate-x-1/2 bg-gradient-to-b from-transparent via-warn to-transparent"
              initial={false}
              key={`core-${beamSeq}`}
              transition={{ duration: 0.75, ease: EASE, times: [0, 0.25, 0.65, 1] }}
            />
            <motion.span
              animate={{ opacity: [0, 0.6, 0.4, 0] }}
              className="absolute bottom-0 left-[calc(50%_-_6px)] top-0 w-px origin-top bg-paper/25 dt:left-[calc(50%_-_9px)]"
              initial={false}
              key={`edge-l-${beamSeq}`}
              transition={{ delay: 0.04, duration: 0.75, ease: EASE, times: [0, 0.3, 0.7, 1] }}
            />
            <motion.span
              animate={{ opacity: [0, 0.6, 0.4, 0] }}
              className="absolute bottom-0 right-[calc(50%_-_6px)] top-0 w-px origin-top bg-paper/25 dt:right-[calc(50%_-_9px)]"
              initial={false}
              key={`edge-r-${beamSeq}`}
              transition={{ delay: 0.04, duration: 0.75, ease: EASE, times: [0, 0.3, 0.7, 1] }}
            />
            <motion.span
              animate={{ top: ["3%", "95%"], opacity: [0, 1, 1, 0] }}
              className="absolute left-1/2 h-[3px] w-[22px] -translate-x-1/2 bg-warn dt:h-[4px] dt:w-[36px]"
              initial={false}
              key={`spot-${beamSeq}`}
              transition={{ duration: 0.7, ease: EASE, times: [0, 0.12, 0.8, 1] }}
            />
          </span>
        )}
      </motion.div>

      {/* log plate */}
      <motion.div
        className="absolute bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap dt:bottom-1.5"
        variants={SOFT_IN}
      >
        <span className="hidden font-label text-[10px] text-ink/40 dt:inline">{gate.caption}</span>
        <span className="font-secondary text-[8px] text-ink/35 dt:text-[9px]">
          [ {gate.code} ·{" "}
          <span className="inline-block overflow-hidden align-bottom">
            <motion.span
              animate={{ opacity: 1, y: 0 }}
              className="inline-block"
              initial={{ opacity: 0, y: 7 }}
              key={count}
              transition={{ duration: 0.22, ease: EASE }}
            >
              {String(count).padStart(3, "0")}
            </motion.span>
          </span>{" "}
          ]
        </span>
      </motion.div>
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
   The parcel — paper front stitched with stamps, black custody-chain back.
   --------------------------------------------------------------------------- */

function CrateFront({
  crate,
  flash,
  reduced,
  stamps,
}: {
  crate: CrateDef;
  flash: number;
  reduced: boolean;
  stamps: number;
}) {
  const Icon = crate.icon;
  return (
    <div className="paper-tag relative flex h-full w-full flex-col overflow-hidden rounded-md text-black [backface-visibility:hidden]">
      <div className="flex shrink-0 items-center justify-between bg-black px-1.5 py-1 dt:px-2 dt:py-1.5">
        <span className="flex size-3.5 items-center justify-center rounded-full border border-paper/80 dt:size-5">
          <Icon className="size-2 text-paper dt:size-2.5" />
        </span>
        <CargoMark className="size-3 dt:size-4" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-1.5 py-1 dt:px-2 dt:py-1.5">
        <p className="font-title text-[9.5px] leading-[1.05] dt:text-[14px]">{crate.name}</p>
        <div className="mt-auto flex items-center justify-between gap-1 pt-1">
          <span className="font-title text-[12px] leading-none dt:text-[20px]">{crate.from}</span>
          <svg
            aria-hidden
            className="h-auto w-3 shrink-0 dt:w-5"
            fill="none"
            viewBox="0 0 64 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect fill="#000000" height="4" width="54" y="10" />
            <path d="M53 2.5 63.5 12 53 21.5Z" fill="#000000" />
          </svg>
          <span className="font-title text-[12px] leading-none dt:text-[20px]">{crate.to}</span>
        </div>
      </div>

      <div className="shrink-0 border-t border-black/70 px-1.5 pb-1 pt-1 dt:px-2 dt:pb-1.5">
        <Barcode className="h-3 dt:h-5" seed={crate.seed} />
        <p className="mt-0.5 text-center font-label text-[5.5px] text-black/70 dt:text-[8px]">{crate.serial}</p>
      </div>

      <div className="shrink-0 bg-black px-1.5 py-[3px] dt:px-2 dt:py-1">
        <p className="whitespace-nowrap font-secondary text-[6px] text-accent dt:text-[9px]">
          {stamps === 0 ? (
            "[ IN TRANSIT ]"
          ) : (
            <ScrambleText active={!reduced} key={stamps} text={`[ ${GATES[stamps - 1].label} ]`} />
          )}
        </p>
      </div>

      {STAMP_POS.map((pos, index) =>
        stamps > index ? (
          <motion.span
            animate={{ opacity: 0.85, rotate: pos.rotate, scale: 1 }}
            className={`absolute whitespace-nowrap rounded-[2px] border-[1.5px] px-0.5 py-px font-label text-[6px] tracking-[0.04em] dt:px-1 dt:text-[9.5px] ${
              index === 2 ? "border-accent text-accent" : "border-black/70 text-black/70"
            }`}
            initial={{ opacity: 0, rotate: pos.rotate - 16, scale: 2.1 }}
            key={GATES[index].code}
            style={{ left: pos.x, top: pos.y }}
            transition={{ type: "spring", stiffness: 560, damping: 24 }}
          >
            {GATES[index].label}
          </motion.span>
        ) : null,
      )}

      {flash > 0 && (
        <motion.span
          animate={{ opacity: [0, 0.22, 0] }}
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-accent/40"
          initial={{ opacity: 0 }}
          key={`flash-${flash}`}
          transition={{ duration: 0.45, ease: EASE }}
        />
      )}

      {flash > 0 && !reduced && (
        <motion.span
          animate={{ opacity: [0, 1, 1, 0], top: ["4%", "92%"] }}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 h-[2px] bg-warn/90"
          initial={false}
          key={`scan-${flash}`}
          transition={{ duration: 0.66, ease: "linear", times: [0, 0.08, 0.85, 1] }}
        />
      )}
    </div>
  );
}

function CrateBack({ crate }: { crate: CrateDef }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-md border border-line bg-black px-1.5 text-center [backface-visibility:hidden] dt:gap-1.5"
      style={{ transform: "rotateY(180deg)" }}
    >
      <span className="flex size-6 items-center justify-center rounded-full border-2 border-accent/80 dt:size-9">
        <QrCode className="size-3 text-accent dt:size-4" />
      </span>
      <p className="font-label text-[6px] text-ink/60 dt:text-[8px]">CUSTODY CHAIN</p>
      <p className="font-title text-[10px] leading-none text-accent dt:text-[15px]">2/2 SCANS</p>
      <p className="font-label text-[5.5px] text-ink/45 dt:text-[8px]">{crate.serial}</p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Small parts — scrambled mono text and a deterministic barcode strip.
   --------------------------------------------------------------------------- */

function ScrambleText({ active, text }: { active: boolean; text: string }) {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const id = window.setInterval(() => {
      frame += 1;
      if (frame >= 7) {
        setDisplay(text);
        window.clearInterval(id);
        return;
      }
      setDisplay(
        text
          .split("")
          .map((char, index) =>
            char === " " || index < frame
              ? char
              : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)],
          )
          .join(""),
      );
    }, 45);
    return () => window.clearInterval(id);
  }, [active, text]);

  return <span>{active ? display : text}</span>;
}

function barWidths(seed: number, count: number): number[] {
  let state = (seed * 2654435761) % 4294967296 || 1;
  return Array.from({ length: count }, () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return 1 + (state % 3);
  });
}

function Barcode({
  bars = 26,
  className = "",
  seed,
}: {
  bars?: number;
  className?: string;
  seed: number;
}) {
  const widths = useMemo(() => barWidths(seed, bars), [bars, seed]);
  return (
    <div aria-hidden className={`flex items-stretch gap-[2px] overflow-hidden ${className}`}>
      {widths.map((width, index) => (
        <span className="bg-black" key={index} style={{ width }} />
      ))}
    </div>
  );
}
