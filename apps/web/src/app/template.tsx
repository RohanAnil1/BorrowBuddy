"use client";

import { motion } from "motion/react";
import { pageIn } from "@/lib/motion/variants";

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      animate="show"
      className="flex min-h-full flex-1 flex-col"
      initial="hidden"
      variants={pageIn}
    >
      {children}
    </motion.div>
  );
}
