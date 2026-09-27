"use client";

import { AnimatePresence, motion, useAnimate, useAnimationFrame, useMotionValue, useReducedMotion, useScroll } from "motion/react";
import { Camera, Projector, QrCode, Speaker, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EASE } from "@/lib/motion/variants";
import { useParallaxY } from "@/lib/motion/use-parallax";
import { CargoMark } from "./hero";

/* ---------------------------------------------------------------------------
   "The Lending Line" — a perpetual campus cargo belt. Loan parcels ride
   through four scan gates (REQUESTED → ACCEPTED → HANDED OVER → RETURNED),
   collecting a rubber stamp at each stop; the parcel flips at the handover
   gate to show its custody chain, then exits trailing a trust-score chip.
   One rAF clock drives everything through MotionValues — no per-frame React
   state — and the ride pauses off-screen, on hidden tabs and for reduced
   motion (which renders a finished still instead).
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

export function BorrowQueue() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const stageWidthRef = useRef(0);
  const clock = useRef({ elapsed: 0, segment: -1, cycle: 0, last: -1 });
  const trustTimer = useRef<number | null>(null);

  const [stageWidth, setStageWidth] = useState(0);
  const [inView, setInView] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [crateIndex, setCrateIndex] = useState(0);
  const [stamps, setStamps] = useState(0);
  const [activeGate, setActiveGate] = useState<number | null>(null);
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
      c.segment = segmentIndex;
      if (segment.kind === "dwell" && segment.gate !== null) {
        const gate = segment.gate;
        setActiveGate(gate);
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

    if (cycle !== c.cycle) {
      c.cycle = cycle;
      setCrateIndex((index) => (index + 1) % CRATES.length);
      setStamps(0);
      setTrust(false);
    }
  });

  const crate = CRATES[crateIndex];
  const shownStamps = reduced ? GATES.length - 1 : stamps;
  const shownActive = reduced ? null : activeGate;
  const shownTrust = !reduced && trust;

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
          <div className="relative h-[300px] w-full dt:h-[360px]" data-lending-line ref={stageRef}>
            <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-ink/10" />

            {GATES.map((gate, index) => (
              <Gate
                active={shownActive === index}
                beamSeq={beamSeq}
                count={counts[index]}
                gate={gate}
                index={index}
                key={gate.code}
                lit={reduced || shownActive === index}
                reduced={reduced}
              />
            ))}

            {/* the belt */}
            <div className="absolute inset-x-0 bottom-8 h-11 dt:bottom-10 dt:h-14">
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
              <div aria-hidden className="absolute inset-x-6 bottom-[3px] flex justify-between dt:inset-x-10">
                {Array.from({ length: 12 }).map((_, i) => (
                  <span className="size-2 rounded-full border border-ink/25 bg-deep" key={i} />
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
                className="absolute bottom-[72px] left-0 z-20 dt:bottom-[92px]"
                data-crate
                data-stamps={shownStamps}
                style={{ x: crateX, y: crateBob, rotate: crateSway }}
              >
                <div className="-ml-8 w-16 dt:-ml-12 dt:w-24">
                  <div className="relative" ref={shakeScope}>
                    <motion.div
                      className="relative h-[96px] w-16 [transform-style:preserve-3d] dt:h-[132px] dt:w-24"
                      style={{ rotateY: crateFlip, transformPerspective: 1100 }}
                    >
                      <CrateFront crate={crate} flash={flash} reduced={reduced} stamps={shownStamps} />
                      <CrateBack crate={crate} />
                    </motion.div>

                    <span
                      aria-hidden
                      className="absolute -bottom-1.5 left-1/2 h-1 w-10 -translate-x-1/2 bg-black/35 dt:h-1.5 dt:w-14"
                    />

                    <AnimatePresence>
                      {shownTrust && (
                        <motion.div
                          animate={{ opacity: 1, y: -26, scale: 1 }}
                          className="absolute -top-2 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap border border-accent bg-black px-1.5 py-0.5 font-secondary text-[7px] text-accent dt:text-[9px]"
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
   Gate — posts + lintel + scanner head, label above, log plate below.
   --------------------------------------------------------------------------- */

function Gate({
  active,
  beamSeq,
  count,
  gate,
  index,
  lit,
  reduced,
}: {
  active: boolean;
  beamSeq: number;
  count: number;
  gate: GateDef;
  index: number;
  lit: boolean;
  reduced: boolean;
}) {
  const frame = lit ? "bg-accent/70" : "bg-ink/30";
  return (
    <div
      className="absolute inset-y-0 z-10 -translate-x-1/2"
      data-gate={index}
      style={{ left: `${GATE_X[index] * 100}%` }}
    >
      {/* hanging wayfinding sign */}
      <span
        aria-hidden
        className="absolute left-1/2 top-0 h-[20px] w-px -translate-x-1/2 bg-ink/25 dt:h-[28px]"
      />
      <p
        className={`absolute left-1/2 top-[24px] -translate-x-1/2 whitespace-nowrap font-label text-[8px] tracking-[0.08em] transition-colors duration-300 dt:top-[32px] dt:text-[11px] dt:tracking-[0.12em] ${
          lit ? "text-accent" : "text-ink/45"
        }`}
      >
        [ <ScrambleText active={active && !reduced} text={gate.label} /> ]
      </p>

      <div className="absolute bottom-[76px] left-1/2 h-[150px] w-[76px] -translate-x-1/2 dt:bottom-[96px] dt:h-[200px] dt:w-[128px]">
        <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] transition-colors duration-300 ${frame}`} />
        <span aria-hidden className={`absolute inset-y-0 right-0 w-[3px] transition-colors duration-300 ${frame}`} />
        <span aria-hidden className={`absolute inset-x-0 top-0 h-[5px] transition-colors duration-300 dt:h-1.5 ${frame}`} />
        <span aria-hidden className={`absolute inset-x-1 top-[26px] h-[3px] transition-colors duration-300 dt:inset-x-2 dt:top-[36px] ${frame}`} />
        <span aria-hidden className={`absolute bottom-0 left-[-3px] h-[6px] w-[9px] transition-colors duration-300 ${frame}`} />
        <span aria-hidden className={`absolute bottom-0 right-[-3px] h-[6px] w-[9px] transition-colors duration-300 ${frame}`} />

        <span
          className={`absolute left-1/2 top-[26px] flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-black transition-colors duration-300 dt:top-[36px] dt:size-7 ${
            lit ? "border-accent" : "border-ink/40"
          }`}
        >
          <QrCode className={`size-2.5 dt:size-3.5 ${lit ? "text-accent" : "text-ink/50"}`} />
        </span>

        <span
          className={`absolute right-1.5 top-[26px] size-1.5 -translate-y-1/2 rounded-full transition-colors duration-300 dt:right-2.5 dt:top-[36px] ${
            lit ? "bg-accent" : "bg-ink/25"
          }`}
        />

        {!reduced && active && (
          <motion.span
            animate={{ opacity: [0, 1, 0.9, 0], scaleY: [0.15, 1, 1, 1] }}
            aria-hidden
            className="absolute bottom-0 left-1/2 top-[28px] w-[2px] -translate-x-1/2 bg-gradient-to-b from-transparent via-warn to-transparent dt:top-[38px]"
            initial={false}
            key={beamSeq}
            style={{ transformOrigin: "top" }}
            transition={{ duration: 0.75, ease: EASE, times: [0, 0.25, 0.65, 1] }}
          />
        )}
      </div>

      <div className="absolute bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap dt:bottom-1.5">
        <span className="hidden font-label text-[9px] text-ink/40 dt:inline">{gate.caption}</span>
        <span className="font-secondary text-[8px] text-ink/35">
          [ {gate.code} · {String(count).padStart(3, "0")} ]
        </span>
      </div>
    </div>
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
        <span className="flex size-3.5 items-center justify-center rounded-full border border-paper/80 dt:size-4">
          <Icon className="size-2 text-paper dt:size-2.5" />
        </span>
        <CargoMark className="size-3 dt:size-4" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-1.5 py-1 dt:px-2 dt:py-1.5">
        <p className="font-title text-[9.5px] leading-[1.05] dt:text-[13px]">{crate.name}</p>
        <div className="mt-auto flex items-center justify-between gap-1 pt-1">
          <span className="font-title text-[12px] leading-none dt:text-[18px]">{crate.from}</span>
          <svg
            aria-hidden
            className="h-auto w-3 shrink-0 dt:w-4"
            fill="none"
            viewBox="0 0 64 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect fill="#000000" height="4" width="54" y="10" />
            <path d="M53 2.5 63.5 12 53 21.5Z" fill="#000000" />
          </svg>
          <span className="font-title text-[12px] leading-none dt:text-[18px]">{crate.to}</span>
        </div>
      </div>

      <div className="shrink-0 border-t border-black/70 px-1.5 pb-1 pt-1 dt:px-2 dt:pb-1.5">
        <Barcode className="h-3 dt:h-4" seed={crate.seed} />
        <p className="mt-0.5 text-center font-label text-[5.5px] text-black/70 dt:text-[7px]">{crate.serial}</p>
      </div>

      <div className="shrink-0 bg-black px-1.5 py-[3px] dt:px-2 dt:py-1">
        <p className="whitespace-nowrap font-secondary text-[6px] text-accent dt:text-[8px]">
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
            className={`absolute whitespace-nowrap rounded-[2px] border-[1.5px] px-0.5 py-px font-label text-[6px] tracking-[0.04em] dt:px-1 dt:text-[8.5px] ${
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
          key={flash}
          transition={{ duration: 0.45, ease: EASE }}
        />
      )}
    </div>
  );
}

function CrateBack({ crate }: { crate: CrateDef }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-md border border-line bg-black px-1.5 text-center [backface-visibility:hidden]"
      style={{ transform: "rotateY(180deg)" }}
    >
      <span className="flex size-6 items-center justify-center rounded-full border-2 border-accent/80 dt:size-8">
        <QrCode className="size-3 text-accent dt:size-4" />
      </span>
      <p className="font-label text-[6px] text-ink/60 dt:text-[7.5px]">CUSTODY CHAIN</p>
      <p className="font-title text-[10px] leading-none text-accent dt:text-[13px]">2/2 SCANS</p>
      <p className="font-label text-[5.5px] text-ink/45 dt:text-[7px]">{crate.serial}</p>
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
