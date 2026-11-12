"use client";

import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useReducedMotion,
  useSpring,
  type Transition,
} from "motion/react";
import { useEffect, useId, useRef, useState } from "react";

/**
 * Parcel — Buddy's mascot. A kraft cargo box with a scanner visor, drawn as
 * one inline SVG so it stays crisp from a 28px reply avatar to a 240px hero.
 */
export type ParcelMood =
  | "idle"
  | "wave"
  | "thinking"
  | "talking"
  | "happy"
  | "found"
  | "confused"
  | "sleepy"
  | "offline";

const C = {
  kraft: "#c98a4a",
  kraftLight: "#dba066",
  kraftShade: "#b2733a",
  kraftDeep: "#9c6430",
  brown: "#5a3712",
  tape: "#efd7aa",
  visor: "#080b10",
  eye: "#ff9f00",
  amber: "#cb840e",
  paper: "#f0f0f0",
  deep: "#021249",
};

const EYE_L = 48;
const EYE_R = 72;
const EYE_Y = 64;

const loop = (duration: number, extra: Transition = {}): Transition => ({
  duration,
  repeat: Infinity,
  ease: "easeInOut",
  ...extra,
});

export function Parcel({
  mood = "idle",
  size = 96,
  track = false,
  peek = false,
  className,
  title,
}: {
  mood?: ParcelMood;
  size?: number;
  /** Eyes follow the pointer (desktop pointers only). */
  track?: boolean;
  /** Lid lifts a little, used on hover. */
  peek?: boolean;
  className?: string;
  /** When set, the SVG is announced; otherwise it is decorative. */
  title?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const reduce = useReducedMotion() ?? false;
  const svgRef = useRef<SVGSVGElement>(null);
  const squash = useAnimationControls();
  const [blink, setBlink] = useState(false);
  const eyeX = useSpring(0, { stiffness: 220, damping: 22 });
  const eyeY = useSpring(0, { stiffness: 220, damping: 22 });

  // Natural, irregular blinking.
  useEffect(() => {
    if (reduce) return;
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), 130);
        schedule();
      }, 2600 + Math.random() * 3400);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [reduce]);

  // Eyes follow the pointer within the visor; idle glances otherwise.
  useEffect(() => {
    if (reduce) {
      eyeX.jump(0);
      eyeY.jump(0);
      return;
    }
    let frame = 0;
    let lastMove = 0;
    let glance: number | undefined;
    const fine = window.matchMedia("(pointer: fine)").matches;

    const onMove = (event: PointerEvent) => {
      lastMove = Date.now();
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = svgRef.current?.getBoundingClientRect();
        if (!box) return;
        const dx = event.clientX - (box.left + box.width / 2);
        const dy = event.clientY - (box.top + box.height * 0.53);
        const distance = Math.hypot(dx, dy) || 1;
        const pull = Math.min(1, distance / 240);
        eyeX.set((dx / distance) * 4.2 * pull);
        eyeY.set((dy / distance) * 3 * pull);
      });
    };

    const glanceAround = () => {
      glance = window.setTimeout(() => {
        if (Date.now() - lastMove > 3500) {
          const pick = Math.random();
          eyeX.set(pick < 0.33 ? -3.5 : pick < 0.66 ? 3.5 : 0);
          eyeY.set(pick > 0.8 ? -2 : 0.5);
        }
        glanceAround();
      }, 2200 + Math.random() * 2600);
    };

    if (track && fine) window.addEventListener("pointermove", onMove, { passive: true });
    glanceAround();
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
      window.clearTimeout(glance);
    };
  }, [track, reduce, eyeX, eyeY]);

  const boing = () => {
    if (reduce) return;
    void squash.start({
      scaleX: [1, 1.14, 0.94, 1],
      scaleY: [1, 0.84, 1.07, 1],
      transition: { duration: 0.5, ease: "easeOut" },
    });
  };

  // Celebrate moods get a little squash and stretch too.
  useEffect(() => {
    if (reduce || (mood !== "happy" && mood !== "found" && mood !== "wave")) return;
    void squash.start({
      scaleX: [1, 1.1, 0.96, 1],
      scaleY: [1, 0.88, 1.05, 1],
      transition: { duration: 0.55, ease: "easeOut" },
    });
  }, [mood, reduce, squash]);

  const bodyAnimation = reduce
    ? {}
    : mood === "happy" || mood === "found"
      ? { y: [0, -9, 0, -4, 0], rotate: 0, transition: { duration: 0.9, ease: "easeOut" as const } }
      : mood === "thinking"
        ? { y: [0, -1.5, 0], rotate: [-2.5, 2.5, -2.5], transition: loop(1.6) }
        : mood === "sleepy" || mood === "offline"
          ? { y: [0, 1, 0], rotate: 0, scaleY: [1, 0.975, 1], transition: loop(3.4) }
          : mood === "talking"
            ? { y: [0, -2, 0], rotate: [0, -1, 0], transition: loop(0.5) }
            : { y: [0, -2.4, 0], rotate: 0, transition: loop(2.6) };

  const lidOpen = mood === "found" ? 1 : peek || mood === "wave" || mood === "happy" ? 0.45 : mood === "thinking" ? 0.2 : 0;

  const baseEyes = mood === "idle" || mood === "talking" || mood === "found";
  const eyeScaleY = blink && baseEyes ? 0.12 : 1;

  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
      height={size}
      onPointerDown={boing}
      ref={svgRef}
      role={title ? "img" : undefined}
      style={{ overflow: "visible" }}
      viewBox="0 0 120 120"
      width={size}
    >
      <defs>
        <clipPath id={`box-${uid}`}>
          <rect height="64" rx="9" width="72" x="24" y="38" />
        </clipPath>
        <clipPath id={`visor-${uid}`}>
          <rect height="28" rx="10" width="56" x="32" y="50" />
        </clipPath>
      </defs>

      {/* contact shadow breathes with the bob */}
      <motion.ellipse
        animate={reduce ? {} : { scaleX: [1, 0.9, 1], opacity: [0.55, 0.4, 0.55] }}
        cx="60"
        cy="111"
        fill={C.deep}
        rx="31"
        ry="4.5"
        style={{ originX: 0.5, originY: 0.5 }}
        transition={loop(mood === "talking" ? 0.5 : 2.6)}
      />

      <motion.g animate={bodyAnimation} style={{ originX: 0.5, originY: 1 }}>
        <motion.g animate={squash} style={{ originX: 0.5, originY: 1 }}>
          {/* feet */}
          <rect fill={C.brown} height="9" rx="4" width="13" x="38" y="99" />
          <rect fill={C.brown} height="9" rx="4" width="13" x="69" y="99" />

          {/* left arm */}
          <motion.path
            animate={
              reduce ? {} : mood === "confused" ? { rotate: [0, -18, 0] } : { rotate: [0, 4, 0] }
            }
            d="M26 72 q-11 3 -13 13"
            fill="none"
            stroke={C.kraftDeep}
            strokeLinecap="round"
            strokeWidth="6"
            style={{ originX: 1, originY: 0 }}
            transition={loop(mood === "confused" ? 1.4 : 2.6)}
          />

          {/* right arm waves on hello */}
          <motion.g
            animate={
              reduce
                ? {}
                : mood === "wave"
                  ? { rotate: [0, -38, -8, -38, 0] }
                  : mood === "happy" || mood === "found"
                    ? { rotate: [0, -30, 0] }
                    : { rotate: [0, -4, 0] }
            }
            style={{ originX: 0, originY: 1 }}
            transition={mood === "wave" ? loop(1.3, { repeatDelay: 0.6 }) : loop(2.6)}
          >
            <path
              d="M94 72 q11 -2 14 -12"
              fill="none"
              stroke={C.kraftDeep}
              strokeLinecap="round"
              strokeWidth="6"
            />
            <circle cx="108.5" cy="59" fill={C.kraftDeep} r="4" />
          </motion.g>

          {/* box body */}
          <g clipPath={`url(#box-${uid})`}>
            <rect fill={C.kraft} height="64" width="72" x="24" y="38" />
            <rect fill={C.kraftShade} height="64" width="12" x="84" y="38" />
            <rect fill={C.kraftShade} height="8" opacity="0.8" width="72" x="24" y="94" />
            <path d="M28 44 v48" opacity="0.35" stroke={C.kraftLight} strokeLinecap="round" strokeWidth="2" />
            {/* tape running down from the lid */}
            <rect fill={C.tape} height="12" opacity="0.92" width="12" x="54" y="38" />
          </g>

          {/* "this side up" arrows */}
          <g fill="none" opacity="0.75" stroke={C.brown} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6">
            <path d="M31 97 v-7 m-2.6 2.6 l2.6 -2.6 l2.6 2.6" />
            <path d="M38 97 v-7 m-2.6 2.6 l2.6 -2.6 l2.6 2.6" />
          </g>

          {/* barcode label */}
          <rect fill={C.paper} height="9" rx="1" width="19" x="69" y="88.5" />
          <path
            d="M71.5 90.5v5M73.5 90.5v5M74.8 90.5v5M77 90.5v5M78.4 90.5v5M80.8 90.5v5M82 90.5v5M84.5 90.5v5M85.6 90.5v5"
            stroke={C.visor}
            strokeWidth="1"
          />

          {/* lid flaps */}
          <motion.path
            animate={{ rotate: -32 * lidOpen, y: -3 * lidOpen }}
            d="M21 34 h39 v9 h-36 a3 3 0 0 1 -3 -3 z"
            fill={C.kraftLight}
            style={{ originX: 0, originY: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 14 }}
          />
          <motion.path
            animate={{ rotate: 32 * lidOpen, y: -3 * lidOpen }}
            d="M60 34 h39 v6 a3 3 0 0 1 -3 3 h-36 z"
            fill={C.kraftLight}
            style={{ originX: 1, originY: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 14 }}
          />
          <rect fill={C.tape} height="9" opacity="0.92" width="12" x="54" y="34" />

          {/* status LED */}
          <motion.circle
            animate={reduce ? {} : { opacity: mood === "thinking" ? [1, 0.2, 1] : mood === "offline" ? 0.15 : [1, 0.55, 1] }}
            cx="90"
            cy="38.5"
            fill={mood === "offline" ? "#ff4d4d" : C.eye}
            r="1.8"
            transition={loop(mood === "thinking" ? 0.5 : 2.2)}
          />

          {/* scanner visor */}
          <rect fill={C.visor} height="28" rx="10" width="56" x="32" y="50" />
          <g clipPath={`url(#visor-${uid})`}>
            <motion.rect
              animate={reduce ? { y: 63 } : { y: [52, 75, 52] }}
              fill={C.eye}
              height="1.4"
              opacity={mood === "thinking" ? 0.55 : 0.16}
              transition={loop(mood === "thinking" ? 1.1 : 3.2)}
              width="56"
              x="32"
            />
            {mood === "offline" && <VisorStatic reduce={reduce} />}

            <motion.g style={{ x: eyeX, y: eyeY }}>
              <AnimatePresence initial={false} mode="popLayout">
                <motion.g
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  initial={{ opacity: 0, scale: 0.6 }}
                  key={mood}
                  style={{ originX: 0.5, originY: 0.5 }}
                  transition={{ duration: 0.16 }}
                >
                  <Eyes blinkScale={eyeScaleY} mood={mood} reduce={reduce} />
                </motion.g>
              </AnimatePresence>
            </motion.g>
          </g>
          {/* visor glare */}
          <path d="M37 55 q3 -3 9 -3" fill="none" opacity="0.18" stroke="#ffffff" strokeLinecap="round" strokeWidth="2" />

          {/* cheeks */}
          <ellipse cx="33.5" cy="84" fill={C.eye} opacity={mood === "happy" || mood === "found" || mood === "wave" ? 0.55 : 0.3} rx="4" ry="2.3" />
          <ellipse cx="86.5" cy="83" fill={C.eye} opacity={mood === "happy" || mood === "found" || mood === "wave" ? 0.55 : 0.3} rx="4" ry="2.3" />

          <Mouth mood={mood} reduce={reduce} />
        </motion.g>
      </motion.g>

      <Extras mood={mood} reduce={reduce} />
    </svg>
  );
}

function Eyes({ mood, blinkScale, reduce }: { mood: ParcelMood; blinkScale: number; reduce: boolean }) {
  switch (mood) {
    case "happy":
    case "wave":
      return (
        <g fill="none" stroke={C.eye} strokeLinecap="round" strokeWidth="3.2">
          <path d={`M${EYE_L - 5} ${EYE_Y + 2} q5 -7 10 0`} />
          <path d={`M${EYE_R - 5} ${EYE_Y + 2} q5 -7 10 0`} />
        </g>
      );
    case "thinking":
      return (
        <g fill={C.eye}>
          <rect height="4" rx="2" width="9" x={EYE_L - 4.5} y={EYE_Y - 4} />
          <rect height="4" rx="2" width="9" x={EYE_R - 4.5} y={EYE_Y - 4} />
          {[0, 1, 2].map((dot) => (
            <motion.circle
              animate={reduce ? {} : { opacity: [0.2, 1, 0.2] }}
              cx={54 + dot * 6}
              cy={EYE_Y + 6}
              key={dot}
              r="1.6"
              transition={loop(0.9, { delay: dot * 0.18 })}
            />
          ))}
        </g>
      );
    case "confused":
      return (
        <g fill={C.eye}>
          <rect height="11" rx="3" width="8" x={EYE_L - 4} y={EYE_Y - 5.5} />
          <rect height="5" rx="2" width="9" x={EYE_R - 4.5} y={EYE_Y - 5} />
        </g>
      );
    case "sleepy":
      return (
        <g fill={C.eye}>
          <rect height="2.6" rx="1.3" width="10" x={EYE_L - 5} y={EYE_Y + 1} />
          <rect height="2.6" rx="1.3" width="10" x={EYE_R - 5} y={EYE_Y + 1} />
        </g>
      );
    case "offline":
      return (
        <g stroke={C.eye} strokeLinecap="round" strokeWidth="2.6">
          <path d={`M${EYE_L - 4} ${EYE_Y - 4} l8 8 m0 -8 l-8 8`} />
          <path d={`M${EYE_R - 4} ${EYE_Y - 4} l8 8 m0 -8 l-8 8`} />
        </g>
      );
    default: {
      const big = mood === "found";
      const w = big ? 10 : 8;
      const h = big ? 13 : 11;
      return (
        <motion.g
          animate={{ scaleY: blinkScale }}
          fill={C.eye}
          style={{ originX: 0.5, originY: 0.5 }}
          transition={{ duration: 0.07 }}
        >
          <rect height={h} rx="3" width={w} x={EYE_L - w / 2} y={EYE_Y - h / 2} />
          <rect height={h} rx="3" width={w} x={EYE_R - w / 2} y={EYE_Y - h / 2} />
          <rect fill="#fff4dc" height="3" opacity="0.85" rx="1" width="2.6" x={EYE_L - w / 2 + 1.6} y={EYE_Y - h / 2 + 1.6} />
          <rect fill="#fff4dc" height="3" opacity="0.85" rx="1" width="2.6" x={EYE_R - w / 2 + 1.6} y={EYE_Y - h / 2 + 1.6} />
        </motion.g>
      );
    }
  }
}

function Mouth({ mood, reduce }: { mood: ParcelMood; reduce: boolean }) {
  if (mood === "talking") {
    return (
      <motion.ellipse
        animate={reduce ? { ry: 2.6 } : { ry: [1.2, 3.4, 1.8, 3, 1.2] }}
        cx="60"
        cy="86.5"
        fill={C.brown}
        rx="4"
        transition={loop(0.42)}
      />
    );
  }
  if (mood === "happy" || mood === "found" || mood === "wave") {
    return <path d="M53.5 84.5 q6.5 7 13 0 z" fill={C.brown} />;
  }
  if (mood === "confused") {
    return <path d="M54 87 q3 -2.5 6 0 t6 0" fill="none" stroke={C.brown} strokeLinecap="round" strokeWidth="2.4" />;
  }
  if (mood === "sleepy" || mood === "offline") {
    return <ellipse cx="60" cy="87" fill={C.brown} rx="2.4" ry="1.8" />;
  }
  if (mood === "thinking") {
    return <path d="M56 87 h8" stroke={C.brown} strokeLinecap="round" strokeWidth="2.4" />;
  }
  return <path d="M54.5 85 q5.5 5 11 0" fill="none" stroke={C.brown} strokeLinecap="round" strokeWidth="2.6" />;
}

function VisorStatic({ reduce }: { reduce: boolean }) {
  return (
    <g fill={C.paper}>
      {[
        [36, 56, 6],
        [62, 60, 9],
        [44, 70, 5],
        [74, 54, 4],
        [52, 74, 7],
      ].map(([x, y, w], index) => (
        <motion.rect
          animate={reduce ? { opacity: 0.12 } : { opacity: [0, 0.35, 0, 0.2, 0] }}
          height="1.2"
          key={index}
          transition={loop(0.7, { delay: index * 0.11 })}
          width={w}
          x={x}
          y={y}
        />
      ))}
    </g>
  );
}

function Extras({ mood, reduce }: { mood: ParcelMood; reduce: boolean }) {
  return (
    <AnimatePresence>
      {mood === "found" && (
        <motion.g
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.4 }}
          fill={C.amber}
          initial={{ opacity: 0, scale: 0.4 }}
          key="found"
          style={{ originX: 0.5, originY: 0.5 }}
          transition={{ type: "spring", stiffness: 320, damping: 16 }}
        >
          {/* Buddy Brackets burst out of the lid */}
          <motion.g animate={reduce ? {} : { y: [0, -3, 0] }} transition={loop(1.2)}>
            <path d="M14 22 h7 v2.6 h-4.4 v9.8 h4.4 V37 h-7 z" />
            <path d="M106 22 h-7 v2.6 h4.4 v9.8 h-4.4 V37 h7 z" />
            <path d="M60 4 l1.8 4.2 4.2 1.8 -4.2 1.8 -1.8 4.2 -1.8 -4.2 -4.2 -1.8 4.2 -1.8 z" fill={C.eye} />
            <circle cx="36" cy="14" fill={C.paper} r="1.6" />
            <circle cx="86" cy="12" fill={C.paper} r="1.3" />
          </motion.g>
        </motion.g>
      )}
      {mood === "confused" && (
        <motion.text
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: [0, -2, 0], rotate: [-6, 6, -6] }}
          exit={{ opacity: 0 }}
          fill={C.paper}
          fontFamily="var(--font-label), monospace"
          fontSize="20"
          fontWeight="700"
          initial={{ opacity: 0 }}
          key="confused"
          style={{ originX: 0.5, originY: 0.5 }}
          transition={loop(1.6)}
          x="98"
          y="28"
        >
          ?
        </motion.text>
      )}
      {mood === "sleepy" && (
        <motion.g exit={{ opacity: 0 }} fill={C.paper} fontFamily="var(--font-label), monospace" fontWeight="700" key="sleepy">
          {[0, 1, 2].map((z) => (
            <motion.text
              animate={reduce ? { opacity: 0.8 } : { opacity: [0, 1, 0], x: [0, 6, 12], y: [0, -10, -20] }}
              fontSize={8 + z * 3}
              key={z}
              transition={loop(2.4, { delay: z * 0.8, ease: "easeOut" })}
              x={94 + z * 5}
              y={34 - z * 7}
            >
              z
            </motion.text>
          ))}
        </motion.g>
      )}
    </AnimatePresence>
  );
}
