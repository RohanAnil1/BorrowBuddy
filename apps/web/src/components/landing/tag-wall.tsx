"use client";

import { motion, useReducedMotion, useScroll, useSpring } from "motion/react";
import { QrCode } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParallaxY } from "@/lib/motion/use-parallax";
import { paintDotBust } from "./device/screen-art";
import { CargoMark } from "./hero";

type TagStatus = "BORROWED" | "DUE TODAY" | "RETURNED" | "WAITLISTED";

type TagLoan = {
  id: string;
  status: TagStatus;
  fromRoute: string;
  toRoute: string;
  contents: string;
  forName: string;
  seed: number;
  serials: [string, string];
};

const TAGS: TagLoan[] = [
  {
    id: "mira",
    status: "BORROWED",
    fromRoute: "BLC",
    toRoute: "LIB",
    contents: "SONY A7 III + 2 BATTERIES",
    forName: "MIRA K.",
    seed: 3,
    serials: ["8998040139", "2402691293"],
  },
  {
    id: "dev",
    status: "DUE TODAY",
    fromRoute: "SAC",
    toRoute: "HSA",
    contents: "EPSON PROJECTOR + HDMI",
    forName: "ISHAAN V.",
    seed: 7,
    serials: ["0101045216", "5726806664"],
  },
  {
    id: "sana",
    status: "BORROWED",
    fromRoute: "LIB",
    toRoute: "CAF",
    contents: "JBL SPEAKER + CHARGER",
    forName: "SANA P.",
    seed: 11,
    serials: ["2436315621", "9995052880"],
  },
  {
    id: "rohan",
    status: "WAITLISTED",
    fromRoute: "HSD",
    toRoute: "SAC",
    contents: "CATAN + SEAFARERS EXP.",
    forName: "ROHAN M.",
    seed: 19,
    serials: ["5850204654", "8486035723"],
  },
  {
    id: "ishita",
    status: "RETURNED",
    fromRoute: "CAF",
    toRoute: "BLA",
    contents: "PRESTIGE HOTPLATE",
    forName: "ISHITA T.",
    seed: 23,
    serials: ["5266472191", "1684402449"],
  },
  {
    id: "kabir",
    status: "RETURNED",
    fromRoute: "LIB",
    toRoute: "BLC",
    contents: "50MM PRIME LENS",
    forName: "KABIR J.",
    seed: 29,
    serials: ["1743529610", "6482097315"],
  },
  {
    id: "neha",
    status: "BORROWED",
    fromRoute: "BLA",
    toRoute: "LIB",
    contents: "CASIO FX-991 CALCULATOR",
    forName: "NEHA S.",
    seed: 29,
    serials: ["3391047582", "9027110563"],
  },
  {
    id: "arjun",
    status: "DUE TODAY",
    fromRoute: "HSB",
    toRoute: "CFT",
    contents: "USHA TABLE FAN",
    forName: "ARJUN D.",
    seed: 31,
    serials: ["4487291306", "7781549062"],
  },
];

/** Deterministic pseudo-random bar widths for the barcode strips. */
function barWidths(seed: number, count: number): number[] {
  let s = (seed * 2654435761) % 4294967296 || 1;
  return Array.from({ length: count }, () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return 1 + (s % 4);
  });
}

function Barcode({
  seed,
  bars = 34,
  className = "",
}: {
  seed: number;
  bars?: number;
  className?: string;
}) {
  const widths = useMemo(() => barWidths(seed, bars), [bars, seed]);
  return (
    <div aria-hidden className={`flex items-stretch gap-[2px] overflow-hidden ${className}`}>
      {widths.map((w, i) => (
        <span className="bg-black" key={i} style={{ width: w }} />
      ))}
    </div>
  );
}

/** Client-side dot-matrix bust — seeded per borrower. */
function DotBust({ seed, className = "" }: { seed: number; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const paint = () => {
      const canvas = document.createElement("canvas");
      paintDotBust(canvas, seed);
      if (alive) setUrl(canvas.toDataURL("image/png"));
    };
    paint();
    document.fonts.ready.then(paint);
    return () => {
      alive = false;
    };
  }, [seed]);

  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" className={className} draggable={false} src={url} />
  ) : (
    <div className={`monogram-tile ${className}`} />
  );
}

export function TagWall() {
  const [active, setActive] = useState(3);
  const [wallWidth, setWallWidth] = useState(0);
  const [wallHeight, setWallHeight] = useState(0);
  const [inView, setInView] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const wallRef = useRef<HTMLDivElement>(null);
  const lastDrag = useRef(0);
  const pauseUntil = useRef(0);

  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    offset: ["start end", "end start"],
    target: sectionRef,
  });
  const wallDrift = useParallaxY(scrollYProgress, 60, -60);

  // mouse tilt for the whole wall
  const tiltX = useSpring(0, { stiffness: 90, damping: 18 });
  const tiltY = useSpring(0, { stiffness: 90, damping: 18 });

  const reduced = useReducedMotion();

  useEffect(() => {
    const el = wallRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWallWidth(entry.contentRect.width);
      setWallHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-advance — stepped glide through the loans. Runs whenever the wall
  // is on screen (hover does not pause it); pauses after user interaction,
  // off-screen, when the tab is hidden, and under reduced motion.
  const markUserInteraction = useCallback(() => {
    pauseUntil.current = Date.now() + 6000;
  }, []);

  useEffect(() => {
    const onVisibility = () => setTabHidden(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
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
    if (reduced || !inView || tabHidden) return;
    const id = window.setInterval(() => {
      if (Date.now() < pauseUntil.current) return;
      setActive((current) => (current + 1 < TAGS.length ? current + 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [reduced, inView, tabHidden]);

  // Reference tag aspect (the NZDS luggage tag): width / height ≈ 0.693 —
  // portrait. Desktop width finds the largest tag that fits the wall height
  // (row padding + stacked status block reserved); mobile is a fixed width.
  const isNarrow = wallWidth > 0 && wallWidth < 800;
  const TAG_W = isNarrow
    ? 336
    : Math.min(
        544,
        Math.max(380, Math.round(((wallHeight > 0 ? wallHeight : 636) - 148) * 0.693)),
      );
  const TAG_H = Math.round(TAG_W / 0.693);
  const SPACING = TAG_W * 0.52;

  const x = wallWidth ? wallWidth / 2 - TAG_W / 2 - active * SPACING : 0;

  const navigate = useCallback(
    (dir: -1 | 1) => {
      markUserInteraction();
      setActive((current) => Math.min(TAGS.length - 1, Math.max(0, current + dir)));
    },
    [markUserInteraction],
  );

  return (
    <section
      aria-label="Loans in progress carousel"
      className="relative isolate flex min-h-[100svh] w-full flex-col overflow-hidden"
      data-wall-section=""
      ref={sectionRef}
    >

      {/* header row */}
      <div className="relative z-10 flex w-full flex-col justify-between gap-6 px-4 pt-8 dt:flex-row dt:items-center dt:px-10 dt:pt-12">
        <h2 className="type-title title-arrow leading-tight">Loans in progress</h2>
        <p className="font-secondary text-[11px] leading-5 text-ink/50">
          LIVE FROM THE CAMPUS NETWORK —
          <br />
          DRAG OR USE THE ARROWS. THE CENTER TAG IS THE ACTIVE LOAN.
        </p>
      </div>

      {/* wall */}
      <div
        className="relative z-10 flex-1 overflow-hidden outline-none focus-visible:outline focus-visible:outline-accent"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") navigate(-1);
          if (event.key === "ArrowRight") navigate(1);
        }}
        onMouseMove={(event) => {
          if (reduced) return;
          const rect = wallRef.current?.getBoundingClientRect();
          if (!rect) return;
          tiltX.set(((event.clientY - rect.top) / rect.height - 0.5) * 3);
          tiltY.set(((event.clientX - rect.left) / rect.width - 0.5) * 4);
        }}
        onMouseLeave={() => {
          tiltX.set(0);
          tiltY.set(0);
        }}
        ref={wallRef}
        role="region"
        aria-label="Loan tag wall"
        tabIndex={0}
      >
        {/* scroll parallax wrapper — wall counter-drifts as the section passes */}
        <motion.div className="relative" style={{ y: wallDrift }}>
        <motion.div
          animate={{ x }}
          className="relative mx-auto flex w-max items-start py-12"
          drag="x"
          dragElastic={0.12}
          dragMomentum={false}
          onDragEnd={(_, info) => {
            const next = Math.round(active - info.offset.x / SPACING);
            setActive(Math.min(TAGS.length - 1, Math.max(0, next)));
          }}
          onDragStart={() => {
            lastDrag.current = Date.now();
            markUserInteraction();
          }}
          style={{
            rotateX: tiltX,
            rotateY: tiltY,
            transformPerspective: 1600,
          }}
          transition={{ type: "spring", stiffness: 520, damping: 34 }}
        >
          {TAGS.map((loan, index) => (
            <TagCard
              dataTestId={`wall-tag-${index}`}
              distance={index - active}
              isActive={index === active}
              key={loan.id}
              loan={loan}
              onFaceClick={() => {
                if (Date.now() - lastDrag.current < 300) return;
                markUserInteraction();
                setActive(index);
              }}
              overlap={index === 0 ? 0 : -(TAG_W + 24 - SPACING)}
              tagHeight={TAG_H}
              tagWidth={TAG_W}
            />
          ))}
          </motion.div>
        </motion.div>

        {/* reference chunky arrows */}
        <div className="pointer-events-none absolute inset-x-[3%] bottom-[7%] z-30 flex items-center justify-between">
          <button
            aria-label="Previous tag"
            className="pointer-events-auto cursor-pointer transition-opacity disabled:opacity-30"
            data-testid="wall-prev"
            disabled={active === 0}
            onClick={() => navigate(-1)}
            type="button"
          >
            <svg className="h-auto w-11 dt:w-[4.6rem]" fill="none" viewBox="0 0 63 45" xmlns="http://www.w3.org/2000/svg">
              <rect fill="white" height="7.02489" transform="matrix(-1 0 0 1 62.4689 18.6372)" width="52.6978" />
              <path
                d="M4.96826 22.353L2.48412 24.8366L-1.16617e-05 22.353L2.48412 19.8694L4.96826 22.353ZM24.8418 2.48364L27.326 4.96725L7.45239 24.8366L4.96826 22.353L2.48412 19.8694L22.3577 3.14099e-05L24.8418 2.48364ZM4.96826 22.353L7.45239 19.8694L27.326 39.7388L24.8418 42.2224L22.3577 44.706L2.48412 24.8366L4.96826 22.353Z"
                fill="white"
              />
            </svg>
          </button>
          <button
            aria-label="Next tag"
            className="pointer-events-auto cursor-pointer transition-opacity disabled:opacity-30"
            data-testid="wall-next"
            disabled={active === TAGS.length - 1}
            onClick={() => navigate(1)}
            type="button"
          >
            <svg className="h-auto w-10 dt:w-[4.6rem]" fill="none" viewBox="0 0 63 45" xmlns="http://www.w3.org/2000/svg">
              <rect fill="white" height="7.02489" width="52.6978" y="18.6372" />
              <path
                d="M57.5006 22.353L59.9847 24.8366L62.4689 22.353L59.9847 19.8694L57.5006 22.353ZM37.627 2.48364L35.1429 4.96725L55.0165 24.8366L57.5006 22.353L59.9847 19.8694L40.1111 3.14099e-05L37.627 2.48364ZM57.5006 22.353L55.0165 19.8694L35.1429 39.7388L37.627 42.2224L40.1111 44.706L59.9847 24.8366L57.5006 22.353Z"
                fill="white"
              />
            </svg>
          </button>
        </div>

        {/* edge fades */}
        <div aria-hidden className="pointer-events-none absolute bottom-0 left-0 top-0 w-8 bg-gradient-to-r from-deep dt:w-36" />
        <div aria-hidden className="pointer-events-none absolute bottom-0 right-0 top-0 w-8 bg-gradient-to-l from-deep dt:w-36" />
      </div>
    </section>
  );
}

function TagCard({
  dataTestId,
  distance,
  isActive,
  loan,
  onFaceClick,
  overlap = 0,
  tagHeight,
  tagWidth,
}: {
  dataTestId?: string;
  distance: number;
  isActive: boolean;
  loan: TagLoan;
  onFaceClick: () => void;
  overlap?: number;
  tagHeight: number;
  tagWidth: number;
}) {
  const abs = Math.abs(distance);
  const scale = Math.max(0.5, 1 - abs * 0.16);
  const opacity = Math.max(0.24, 1 - abs * 0.28);
  const bandH = Math.round(tagHeight * 0.131);

  return (
    <motion.div
      animate={{ opacity, scale, rotateY: distance * -14, z: -abs * 110, y: abs * 16 }}
      className="relative cursor-pointer px-3"
      data-testid={dataTestId}
      onClick={onFaceClick}
      style={{ marginLeft: overlap, width: tagWidth + 24, transformPerspective: 1600, zIndex: 20 - abs }}
      transition={{ type: "spring", stiffness: 460, damping: 32 }}
      whileHover={abs > 0 ? { y: -10 } : undefined}
    >
      {/* STATUS — stacked above the tag, left-aligned on every tag (reference) */}
      <motion.div
        className="mb-2.5 flex flex-col items-start dt:mb-3"
        animate={{ opacity: [1, 0.6, 1] }}
        transition={{ repeat: Infinity, duration: 2.6, ease: "easeInOut" }}
      >
        <p className="font-secondary text-[9px] leading-none text-ink/60 dt:text-[11px]">
          STATUS:
        </p>
        <p className="font-title mt-1 text-[1rem] leading-none text-accent uppercase dt:text-[1.4rem]">
          {loan.status}
        </p>
      </motion.div>

      {/* idle levitation for the active tag */}
      <motion.div
        animate={isActive ? { y: [0, -9, 0] } : { y: 0 }}
        transition={isActive ? { repeat: Infinity, duration: 5, ease: "easeInOut" } : {}}
      >
        <motion.article
          className="paper-tag flex flex-col overflow-hidden rounded-lg text-black"
          initial={{ opacity: 0, y: 130, rotateY: distance * 16 }}
          style={{ height: tagHeight }}
          viewport={{ once: true, amount: 0.2 }}
          whileInView={{ opacity: 1, y: 0, rotateY: 0 }}
        >
          {/* black brand band — full bleed like the reference header */}
          <div
            className="flex shrink-0 items-center justify-between bg-black px-3 dt:px-4"
            style={{ height: bandH }}
          >
            <div className="flex items-center gap-2.5 dt:gap-3">
              <span className="font-title text-[11px] leading-[1.05] text-paper dt:text-[15px]">
                BB
                <br />
                BU
              </span>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-paper/90 dt:size-9">
                <QrCode className="size-3 text-paper dt:size-4" />
              </span>
            </div>
            <div className="flex items-center gap-2.5 dt:gap-3">
              <span className="font-title text-[11px] leading-none text-paper dt:text-[15px]">
                BORROWBUDDY
              </span>
              <CargoMark className="size-5 shrink-0 dt:size-7" />
            </div>
          </div>

          {/* route — labels on one line, giant codes below (reference) */}
          <div className="shrink-0 border-b border-black px-3 pb-3 pt-2.5 dt:px-4 dt:pb-4 dt:pt-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-label text-[9px] normal-case text-black/60 dt:text-[13px]">
                Departing:
              </p>
              <p className="font-label text-[9px] normal-case text-black/60 dt:text-[13px]">
                Destination:
              </p>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2 dt:mt-1.5">
              <p className="font-title text-[2.4rem] leading-[0.9] dt:text-[3.9rem]">
                {loan.fromRoute}
              </p>
              <svg
                aria-hidden
                className="h-auto w-8 shrink-0 dt:w-14"
                fill="none"
                viewBox="0 0 64 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect fill="#000000" height="4" width="54" y="10" />
                <path d="M53 2.5 63.5 12 53 21.5Z" fill="#000000" />
              </svg>
              <p className="font-title text-[2.4rem] leading-[0.9] text-right dt:text-[3.9rem]">
                {loan.toRoute}
              </p>
            </div>
          </div>

          {/* contents */}
          <div className="shrink-0 border-b border-black px-3 py-2.5 dt:px-4 dt:py-3">
            <p className="font-label text-[9px] normal-case text-black/60 dt:text-[13px]">
              Package Contents:
            </p>
            <p className="font-title mt-0.5 text-[1.35rem] leading-tight dt:text-[2.4rem]">
              {loan.contents}
            </p>
          </div>

          {/* for */}
          <div className="shrink-0 border-b border-black px-3 py-2.5 dt:px-4 dt:py-3">
            <p className="font-label text-[9px] normal-case text-black/60 dt:text-[13px]">
              For:
            </p>
            <p className="font-title mt-0.5 text-[1.7rem] leading-tight dt:text-[3rem]">
              {loan.forName}
            </p>
          </div>

          {/* bottom: dot-matrix photo + double barcodes (serials centered) */}
          <div className="flex min-h-0 flex-1 items-start justify-between gap-3 px-3 pb-3 pt-2.5 dt:px-4 dt:pb-4 dt:pt-3.5">
            <DotBust className="w-[38%] shrink-0 rounded-sm" seed={loan.seed} />
            <div className="flex w-[40%] shrink-0 flex-col gap-2 dt:gap-3">
              <div>
                <Barcode bars={40} className="h-8 dt:h-11" seed={Number(loan.serials[0]) || 11} />
                <p className="font-label mt-1 text-center text-[8px] text-black/70 dt:text-[11px]">
                  {loan.serials[0]}
                </p>
              </div>
              <div>
                <Barcode bars={34} className="h-9 dt:h-12" seed={Number(loan.serials[1]) || 23} />
                <p className="font-label mt-1 text-center text-[8px] text-black/70 dt:text-[11px]">
                  {loan.serials[1]}
                </p>
              </div>
            </div>
          </div>
        </motion.article>
      </motion.div>
    </motion.div>
  );
}
