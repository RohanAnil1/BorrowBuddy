"use client";

import { motion, useScroll } from "motion/react";
import { useRef } from "react";
import { BadgeCheck, QrCode, ShieldCheck } from "lucide-react";
import { fadeUp, staggerChild, staggerContainer } from "@/lib/motion/variants";
import { useParallaxY } from "@/lib/motion/use-parallax";
import { TicketTopBar } from "./hero";

const PILLARS = [
  {
    icon: BadgeCheck,
    title: "Verified students only",
    body: "Every ID is reviewed by the student admin team before borrowing or lending unlocks. Campus-only, always.",
  },
  {
    icon: QrCode,
    title: "QR handovers",
    body: "Pickup and return both scan through single-use codes. Custody changes hands with a record, not a promise.",
  },
  {
    icon: ShieldCheck,
    title: "Guaranteed accountability",
    body: "Overdue fines, trust scores, dispute resolution. The system keeps the receipts so you never have to.",
  },
];

export function WhySection() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    offset: ["start end", "end start"],
    target: sectionRef,
  });
  const leftY = useParallaxY(scrollYProgress, 34, -34);
  const rightY = useParallaxY(scrollYProgress, -26, 26);

  return (
    <section
      className="relative isolate my-16 flex w-full flex-col px-4 select-none dt:my-48 dt:flex-row dt:items-center dt:px-10"
      ref={sectionRef}
    >
      <motion.div style={{ y: leftY }} className="w-full dt:w-[45%]">
      <motion.div
        animate="show"
        className="flex flex-col justify-start"
        initial="hidden"
        variants={staggerContainer}
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
      >
        <motion.h2 className="type-title title-arrow leading-tight" variants={fadeUp}>
          Why it&apos;s safe
        </motion.h2>

        <motion.div
          className="type-body mt-8 w-full text-[15px] leading-7 uppercase dt:text-lg dt:leading-8"
          variants={fadeUp}
        >
          <p>
            <span className="type-body-alt">
              Informal borrowing breaks at the worst moment: a phone returned scratched,
              a lens that never came back, a chat that went quiet.
            </span>
          </p>
          <p className="mt-4">
            BorrowBuddy replaces the favour economy with real logistics — real
            availability calendars, double-booking refused by the database itself, and
            a custody chain that starts and ends with a QR scan.
          </p>
          <p className="mt-4">
            Deposits and fines settle between students. The platform keeps the ledger,
            never the money.
          </p>
        </motion.div>

        <motion.a
          className="font-secondary pointer-events-auto mt-8 w-fit text-accent underline decoration-accent/50 underline-offset-4 transition hover:decoration-accent"
          href="#queue"
          variants={fadeUp}
        >
          SEE HOW A LOAN MOVES
        </motion.a>
      </motion.div>
      </motion.div>

      {/* trust ticket panel — the nana.jpg substitute (counter-parallax layer) */}
      <motion.div className="w-full shrink-0 dt:ml-auto dt:w-[40rem]" style={{ y: rightY }}>
      <motion.div
        animate="show"
        className="mt-12 dt:mt-0"
        initial="hidden"
        variants={staggerContainer}
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
      >
        <motion.div variants={fadeUp}>
          <TrustTicket />
        </motion.div>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {PILLARS.map((pillar) => (
            <motion.div
              className="border border-line bg-panel p-4"
              key={pillar.title}
              variants={staggerChild}
            >
              <pillar.icon className="size-6 text-accent" />
              <p className="type-body-alt mt-3 text-[13px] uppercase">{pillar.title}</p>
              <p className="mt-2 text-[11px] leading-5 text-ink/60">{pillar.body}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
      </motion.div>
    </section>
  );
}

function TrustTicket() {
  return (
    <div className="border border-line bg-black p-6 dt:p-8">
      <TicketTopBar />
      <div className="mt-6 flex items-center justify-between">
        <p className="font-ticket text-[13px] text-ink/80">BORROWBUDDY · CUSTODY RECEIPT</p>
        <p className="font-secondary text-[10px] text-accent">NO. 0427</p>
      </div>
      <div className="mt-8 grid gap-6 border-y border-line py-8 sm:grid-cols-3">
        <Stat label="ITEM" value="Sony A7 III" />
        <Stat label="ROUTE" value="BLOCK-C → LIB" accent />
        <Stat label="STATUS" value="[ RETURNED ON TIME ]" />
      </div>
      <div className="mt-8 flex items-center justify-between">
        <p className="font-ticket text-[12px] text-ink/60">TRUST SCORE 92 · VERIFIED STUDENT</p>
        <span className="status-bracket text-[10px]">[ CUSTODY CHAIN: 2/2 SCANS ]</span>
      </div>
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="font-secondary text-[9px] text-ink/50">{label}</p>
      <p className={`font-ticket mt-1 text-[13px] ${accent ? "text-accent" : "text-ink"}`}>
        {value}
      </p>
    </div>
  );
}
