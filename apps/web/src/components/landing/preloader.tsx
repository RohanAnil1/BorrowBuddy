"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { EASE } from "@/lib/motion/variants";

export function Preloader() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 1100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          animate={{ opacity: 1 }}
          className="preloader fixed inset-0 z-[9999] flex items-center justify-center bg-canvas"
          exit={{ opacity: 0, transition: { duration: 0.5, ease: EASE } }}
          initial={{ opacity: 1 }}
        >
          <p className="status-bracket blink-label px-4 text-center text-[15px] opacity-40 dt:text-[20px]">
            [ OPENING THE BUDDY SHELF. . . ]
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
