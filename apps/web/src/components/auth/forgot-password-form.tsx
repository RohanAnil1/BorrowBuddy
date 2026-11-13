"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type ResetRequestState } from "@/lib/auth/password-reset";

const initialState: ResetRequestState = { status: "idle" };

export function ForgotPasswordForm({ email, linkFailed }: { email?: string; linkFailed?: boolean }) {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  if (state.status === "sent") {
    return (
      <div className="flex flex-col gap-4" role="status">
        <p className="status-bracket text-[11px] text-accent">[ CHECK YOUR INBOX ]</p>
        <p className="font-secondary text-[11px] leading-5 text-ink/70">
          IF {state.email?.toUpperCase()} HAS A BORROWBUDDY PASS, A RESET LINK IS ON ITS WAY. IT WORKS ONCE AND
          EXPIRES IN AN HOUR.
        </p>
        <p className="font-secondary text-[10px] leading-5 text-ink/50">
          OPEN THE LINK IN THIS BROWSER. NOTHING AFTER A FEW MINUTES? CHECK SPAM, OR ASK AGAIN BELOW.
        </p>
        <div aria-hidden className="mt-2 border-t border-dashed border-line" />
        <form action={formAction}>
          <input name="email" type="hidden" value={state.email} />
          <button
            className="font-label w-full py-2 text-[10px] tracking-[0.14em] text-ink/60 transition-colors hover:text-accent disabled:opacity-50"
            disabled={pending}
            type="submit"
          >
            {pending ? "[ SENDING… ]" : "[ SEND IT AGAIN ]"}
          </button>
        </form>
        <Link className="font-label text-center text-[10px] tracking-[0.14em] text-accent" href="/login">
          ← BACK TO SIGN IN
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {linkFailed && (
        <p className="border border-warn/50 bg-warn/10 px-4 py-3 font-secondary text-[10px] leading-5 text-warn">
          [ THAT RESET LINK HAS EXPIRED OR WAS ALREADY USED. ASK FOR A NEW ONE BELOW. ]
        </p>
      )}

      <label className="flex flex-col gap-2">
        <span className="font-secondary text-[10px] text-ink/60">COLLEGE EMAIL</span>
        <input
          required
          autoComplete="email"
          className="w-full rounded-lg border border-line bg-black px-4 py-3 text-[14px] text-ink outline-none transition-colors placeholder:text-ink/30 focus:border-accent"
          defaultValue={email}
          name="email"
          pattern=".+@bennett\.edu\.in$"
          placeholder="you@bennett.edu.in"
          title="Use your Bennett email — it ends with @bennett.edu.in"
          type="email"
        />
        <span className="font-secondary text-[9px] leading-4 text-ink/40">
          THE ADDRESS YOU SIGNED UP WITH.
        </span>
      </label>

      {state.status === "error" && (
        <p className="border border-warn/50 bg-warn/10 px-4 py-3 font-secondary text-[10px] leading-5 text-warn">
          [ {state.message} ]
        </p>
      )}

      <div aria-hidden className="mt-2 border-t border-dashed border-line" />

      <button
        className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 font-strong text-[13px] uppercase tracking-[0.04em] text-white transition-opacity duration-150 hover:opacity-90 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "SENDING LINK…" : "EMAIL ME A RESET LINK →"}
      </button>

      <Link className="font-label text-center text-[10px] tracking-[0.14em] text-ink/50 hover:text-accent" href="/login">
        ← BACK TO SIGN IN
      </Link>
    </form>
  );
}
