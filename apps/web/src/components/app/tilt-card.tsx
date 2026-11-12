"use client";

import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import type { PointerEvent, ReactNode } from "react";

const MAX_TILT = 4; // degrees
const SPRING = { stiffness: 260, damping: 24, mass: 0.6 };

/**
 * A gentle 3D tilt that follows the mouse. Mouse only (touch and pen never
 * tilt), at most 4 degrees, and off entirely under reduced motion.
 */
export function TiltCard({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion() ?? false;
  const rotateX = useSpring(useMotionValue(0), SPRING);
  const rotateY = useSpring(useMotionValue(0), SPRING);

  if (reduce) return <div className={className}>{children}</div>;

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5; // -0.5 .. 0.5
    const y = (event.clientY - box.top) / box.height - 0.5;
    rotateY.set(x * MAX_TILT * 2);
    rotateX.set(-y * MAX_TILT * 2);
  }

  function reset() {
    rotateX.set(0);
    rotateY.set(0);
  }

  return (
    <motion.div
      className={className ? `tilt-card ${className}` : "tilt-card"}
      onPointerLeave={reset}
      onPointerMove={onPointerMove}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
    >
      {children}
    </motion.div>
  );
}
