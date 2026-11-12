"use client";

import { motion } from "motion/react";
import { Children, type ReactNode } from "react";
import { staggerChild, staggerContainer } from "@/lib/motion/variants";

/** Only the first screenful staggers; the rest appear with the last of them. */
const MAX_STAGGERED = 9;

/**
 * A grid whose children rise in one after another on first render. Children
 * stay server-rendered; reduced motion turns the rise into a plain fade.
 */
export function StaggerGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div animate="show" className={className} initial="hidden" variants={staggerContainer}>
      {Children.toArray(children).map((child, index) => (
        <motion.div
          className="h-full"
          key={(child as { key?: string | null }).key ?? index}
          variants={staggerChild}
          transition={index >= MAX_STAGGERED ? { duration: 0 } : undefined}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}
