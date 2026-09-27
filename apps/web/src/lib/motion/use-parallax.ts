import { useReducedMotion, useTransform, type MotionValue } from "motion/react";

/**
 * Scroll-linked parallax on the Y axis. Renders a MotionValue that is safe
 * for SSR (always starts at `from`, so server and client output match) and
 * collapses to 0 when the OS prefers reduced motion.
 */
export function useParallaxY(
  progress: MotionValue<number>,
  from: number,
  to: number,
) {
  const reduced = useReducedMotion();
  return useTransform(progress, (value) => {
    if (reduced) return 0;
    return from + (to - from) * value;
  });
}
