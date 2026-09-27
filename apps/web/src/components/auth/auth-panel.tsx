"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { QrCode } from "lucide-react";
import { fadeUp, staggerChild, staggerContainer } from "@/lib/motion/variants";
import { CargoMark, TicketTopBar } from "@/components/landing/hero";
import { AuthTabs } from "./auth-tabs";

const STEPS = ["01 · EMAIL + PASSWORD", "02 · STUDENT ID PHOTO", "03 · ADMIN APPROVAL"];

export function AuthPanel({
  mode,
  children,
}: {
  mode: "login" | "signup";
  children: ReactNode;
}) {
  const isSignup = mode === "signup";

  return (
    <div className="relative z-10 grid w-full max-w-5xl items-center gap-14 lg:grid-cols-[1fr_420px]">
      <div className="hidden lg:block">
        <Link className="inline-flex items-center gap-3" href="/">
          <CargoMark className="size-9" />
          <span className="font-secondary text-ink">BORROWBUDDY</span>
        </Link>

        <motion.p
          animate="show"
          className="font-secondary mt-12"
          initial="hidden"
          variants={fadeUp}
        >
          <span className="typewriter text-accent">[ BENNETT UNIVERSITY · EST. 2025 ]</span>
        </motion.p>

        <motion.h1
          animate="show"
          className="type-title mt-5"
          initial="hidden"
          variants={staggerContainer}
        >
          {isSignup ? (
            <>
              <motion.span className="block" variants={staggerChild}>
                New here?
              </motion.span>
              <motion.span className="block text-accent" variants={staggerChild}>
                Create your pass.
              </motion.span>
            </>
          ) : (
            <>
              <motion.span className="block" variants={staggerChild}>
                One pass,
              </motion.span>
              <motion.span className="block text-accent" variants={staggerChild}>
                the whole campus.
              </motion.span>
            </>
          )}
        </motion.h1>

        <motion.p
          className="type-body mt-6 max-w-md text-[15px] leading-7 uppercase text-ink/70 dt:text-lg"
          variants={fadeUp}
        >
          {isSignup
            ? "Set your Bennett email and password, upload your student ID, and a campus admin unlocks the lending feed for you."
            : "Sign in with your Bennett email and password to see what is moving around campus right now: cameras, projectors, fans and everything else someone is not using today."}
        </motion.p>

        {isSignup ? (
          <motion.div className="mt-10 flex flex-wrap gap-3" variants={fadeUp}>
            {STEPS.map((step) => (
              <p
                className="font-label border border-line px-3 py-2 text-[10px] tracking-[0.14em] text-ink/70"
                key={step}
              >
                [ {step} ]
              </p>
            ))}
          </motion.div>
        ) : (
          <motion.div className="mt-10 w-full max-w-md" variants={fadeUp}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-label text-[10px] normal-case text-ink/60">Departing:</p>
              <p className="font-label text-[10px] normal-case text-ink/60">Arriving:</p>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="font-title text-[1.6rem] leading-none text-ink">You</p>
              <svg
                aria-hidden
                className="h-auto w-12 shrink-0"
                fill="none"
                viewBox="0 0 64 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect fill="#ffffff" height="4" width="54" y="10" />
                <path d="M53 2.5 63.5 12 53 21.5Z" fill="#ffffff" />
              </svg>
              <p className="font-title text-[1.6rem] leading-none text-ink">
                The lending feed
              </p>
            </div>
          </motion.div>
        )}

        <div className="mt-12 flex flex-wrap gap-8">
          {["ID-VERIFIED STUDENTS", "QR HANDOVERS", "TRUST SCORES"].map((label, i) => (
            <p
              className="status-bracket blink-label text-[11px] opacity-70"
              key={label}
              style={{ animationDelay: `${i * 0.4}s` }}
            >
              [ {label} ]
            </p>
          ))}
        </div>

        <motion.div className="mt-10 flex items-center gap-4" variants={fadeUp}>
          <MicroBars className="h-6 w-28 opacity-80" />
          <p className="font-label text-[9px] text-ink/50">NO. 0427 · BATCH 2025</p>
        </motion.div>
      </div>

      <motion.div
        animate="show"
        className="relative border border-line bg-black p-1"
        initial="hidden"
        variants={staggerContainer}
      >
        {/* scan corners — echoes the device screen brackets */}
        <span aria-hidden className="pointer-events-none absolute -left-px -top-px z-10 size-5 border-l-2 border-t-2 border-ink/70" />
        <span aria-hidden className="pointer-events-none absolute -right-px -top-px z-10 size-5 border-r-2 border-t-2 border-ink/70" />
        <span aria-hidden className="pointer-events-none absolute -bottom-px -left-px z-10 size-5 border-b-2 border-l-2 border-ink/70" />
        <span aria-hidden className="pointer-events-none absolute -bottom-px -right-px z-10 size-5 border-b-2 border-r-2 border-ink/70" />

        <motion.div className="p-2" variants={fadeUp}>
          <TicketTopBar />
        </motion.div>

        {/* pass header band — echoes the tag-wall brand band */}
        <motion.div
          className="mx-2 flex items-center justify-between gap-3 border-b border-line bg-panel px-3 py-2.5"
          variants={fadeUp}
        >
          <div className="flex items-center gap-2.5">
            <span className="font-title text-[13px] leading-[1.05] text-paper">
              BB
              <br />
              BU
            </span>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-paper/90">
              <QrCode className="size-3.5 text-paper" />
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2.5">
              <span className="font-label text-[10px] tracking-[0.14em] text-ink/70">
                {isSignup ? "NEW PASS" : "SIGN-IN PASS"}
              </span>
              <CargoMark className="size-6" />
            </div>
            <span className="font-label text-[8px] text-ink/40">
              SERIAL 0427 · BATCH 2025
            </span>
          </div>
        </motion.div>

        <AuthTabs mode={mode} />

        <div className="p-8 sm:p-10">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <CargoMark className="size-8" />
            <span className="font-secondary text-ink">BORROWBUDDY</span>
          </div>
          {children}
        </div>

        {/* perforated validation strip */}
        <motion.div
          className="mx-2 mb-1 flex items-center justify-between gap-3 border-t border-dashed border-line px-2 py-2"
          variants={fadeUp}
        >
          <MicroBars className="h-5 w-24 opacity-70" />
          <p className="font-label text-[9px] text-ink/45">
            {isSignup ? "COUNTS AS YOUR FIRST LOAN DOCUMENT" : "VALID FOR ONE SESSION"}
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}

/** Deterministic micro barcode strip (matches the tag-wall bar language). */
function MicroBars({ className = "" }: { className?: string }) {
  const bars = [3, 1, 2, 4, 1, 2, 1, 3, 2, 1, 4, 1, 1, 2, 3, 1, 2, 4, 1, 2, 3, 1, 2, 1];
  return (
    <div aria-hidden className={`flex items-stretch gap-[2px] ${className}`}>
      {bars.map((w, i) => (
        <span className="bg-ink" key={i} style={{ width: w }} />
      ))}
    </div>
  );
}
