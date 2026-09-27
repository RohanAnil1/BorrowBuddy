import type { Variants } from "motion/react";

/** Design-system easing — cubic-bezier(.4,0,.2,1). Never invent new curves. */
export const EASE = [0.4, 0, 0.2, 1] as const;

/** Route transition (template.tsx) — subtle rise + fade, 300ms. */
export const pageIn: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: EASE },
  },
};

/** Scroll-reveal — 40px rise, matches the .reveal pattern (ANIMATIONS.md). */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 40 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: EASE },
  },
};

/** CSS-keyframe bounce-right as a Framer variant (0.55s ease-out). */
export const bounceRight: Variants = {
  hidden: { opacity: 0, x: "-70%" },
  show: {
    opacity: 1,
    x: "0%",
    transition: { duration: 0.55, ease: EASE },
  },
};

/** CSS-keyframe bounce-left as a Framer variant (0.55s ease-out). */
export const bounceLeft: Variants = {
  hidden: { opacity: 0, x: "70%" },
  show: {
    opacity: 1,
    x: "0%",
    transition: { duration: 0.55, ease: EASE },
  },
};

/** Parent that staggers its children into view. */
export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

/** Child of staggerContainer. */
export const staggerChild: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: EASE },
  },
};

/** Flat scale-in for chips, badges, checkmarks. */
export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring", stiffness: 320, damping: 24 },
  },
};
