"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import {
  signInWithCredentials,
  signUpWithCredentials,
  type AuthState,
} from "@/lib/auth/credentials";

const initialState: AuthState = { status: "idle" };

export function AuthCredentialsForm({
  mode,
  next,
}: {
  mode: "login" | "signup";
  next?: string;
}) {
  const isSignup = mode === "signup";
  const [state, formAction, pending] = useActionState(
    isSignup ? signUpWithCredentials : signInWithCredentials,
    initialState,
  );
  const [showPassword, setShowPassword] = useState(false);

  const inputClass =
    "w-full rounded-lg border border-line bg-black px-4 py-3 pr-11 text-[14px] text-ink outline-none transition-colors placeholder:text-ink/30 focus:border-accent";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {!isSignup && next ? <input name="next" type="hidden" value={next} /> : null}

      <label className="flex flex-col gap-2">
        <span className="font-secondary text-[10px] text-ink/60">COLLEGE EMAIL</span>
        <input
          required
          autoComplete="email"
          className="w-full rounded-lg border border-line bg-black px-4 py-3 text-[14px] text-ink outline-none transition-colors placeholder:text-ink/30 focus:border-accent"
          name="email"
          pattern=".+@bennett\.edu\.in$"
          placeholder="you@bennett.edu.in"
          title="Use your Bennett email — it ends with @bennett.edu.in"
          type="email"
        />
        <span className="font-secondary text-[9px] leading-4 text-ink/40">
          ONLY @BENNETT.EDU.IN ADDRESSES GET A PASS.
        </span>
      </label>

      <label className="flex flex-col gap-2">
        <span className="flex items-baseline justify-between gap-3">
          <span className="font-secondary text-[10px] text-ink/60">PASSWORD</span>
          {!isSignup && (
            <Link
              className="font-secondary text-[10px] text-accent underline-offset-4 hover:underline"
              href="/forgot-password"
            >
              FORGOT PASSWORD?
            </Link>
          )}
        </span>
        <span className="relative block">
          <input
            required
            autoComplete={isSignup ? "new-password" : "current-password"}
            className={inputClass}
            minLength={isSignup ? 8 : undefined}
            name="password"
            placeholder={isSignup ? "8+ CHARACTERS" : "YOUR PASSWORD"}
            type={showPassword ? "text" : "password"}
          />
          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40 transition-colors hover:text-accent"
            onClick={() => setShowPassword((value) => !value)}
            type="button"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </span>
        {isSignup && (
          <span className="font-secondary text-[9px] leading-4 text-ink/40">
            8+ CHARACTERS WITH AT LEAST ONE LETTER AND ONE NUMBER.
          </span>
        )}
      </label>

      {isSignup && (
        <label className="flex flex-col gap-2">
          <span className="font-secondary text-[10px] text-ink/60">
            CONFIRM PASSWORD
          </span>
          <input
            required
            autoComplete="new-password"
            className={inputClass}
            minLength={8}
            name="confirm_password"
            placeholder="REPEAT YOUR PASSWORD"
            type={showPassword ? "text" : "password"}
          />
        </label>
      )}

      {state.status === "error" && (
        <p className="border border-warn/50 bg-warn/10 px-4 py-3 font-secondary text-[10px] leading-5 text-warn">
          [ {state.message} ]
        </p>
      )}

      {/* perforation before dispatch */}
      <div aria-hidden className="mt-2 border-t border-dashed border-line" />

      <button
        className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 font-strong text-[13px] uppercase tracking-[0.04em] text-white transition-opacity duration-150 hover:opacity-90 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending
          ? isSignup
            ? "CREATING PASS…"
            : "SIGNING IN…"
          : isSignup
            ? "CREATE MY PASS →"
            : "SIGN IN →"}
      </button>

      <p className="status-bracket blink-label text-center text-[10px]">
        [ ENCRYPTED · STORED AS A SECURE HASH ]
      </p>

      <p className="font-secondary text-center text-[9px] leading-5 text-ink/40">
        {isSignup
          ? "VERIFIED BENNETT STUDENTS ONLY. YOUR STUDENT ID IS REVIEWED BY A CAMPUS ADMIN BEFORE THE PORTAL UNLOCKS."
          : "VERIFIED BENNETT STUDENTS ONLY. EVERY ID IS REVIEWED BEFORE YOU CAN BORROW OR LEND."}
      </p>
    </form>
  );
}
