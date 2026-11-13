"use client";

import { Eye, EyeOff } from "lucide-react";
import { useActionState, useState } from "react";
import { setNewPassword, type NewPasswordState } from "@/lib/auth/password-reset";

const initialState: NewPasswordState = { status: "idle" };

export function NewPasswordForm() {
  const [state, formAction, pending] = useActionState(setNewPassword, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const inputClass =
    "w-full rounded-lg border border-line bg-black px-4 py-3 pr-11 text-[14px] text-ink outline-none transition-colors placeholder:text-ink/30 focus:border-accent";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="font-secondary text-[10px] text-ink/60">NEW PASSWORD</span>
        <span className="relative block">
          <input
            required
            autoComplete="new-password"
            className={inputClass}
            minLength={8}
            name="password"
            placeholder="8+ CHARACTERS"
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
        <span className="font-secondary text-[9px] leading-4 text-ink/40">
          8+ CHARACTERS WITH AT LEAST ONE LETTER AND ONE NUMBER.
        </span>
      </label>

      <label className="flex flex-col gap-2">
        <span className="font-secondary text-[10px] text-ink/60">CONFIRM NEW PASSWORD</span>
        <input
          required
          autoComplete="new-password"
          className={inputClass}
          minLength={8}
          name="confirm_password"
          placeholder="REPEAT IT"
          type={showPassword ? "text" : "password"}
        />
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
        {pending ? "SAVING…" : "SET NEW PASSWORD →"}
      </button>

      <p className="font-secondary text-center text-[9px] leading-5 text-ink/40">
        YOU STAY SIGNED IN HERE. EVERY OTHER DEVICE IS SIGNED OUT, SO ANYONE WITH YOUR OLD PASSWORD LOSES ACCESS.
      </p>
    </form>
  );
}
