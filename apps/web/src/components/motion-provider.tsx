"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/**
 * Global motion config. `reducedMotion="user"` makes motion respect the OS
 * "reduce motion" setting: transform/layout animations jump to their final
 * state while opacity fades still play — content always ends up visible and
 * no SSR/client style branches are needed anywhere.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
