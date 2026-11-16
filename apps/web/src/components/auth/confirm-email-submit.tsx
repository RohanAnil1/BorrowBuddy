"use client";

import { useEffect, useRef } from "react";

/** Confirms as soon as the page opens; the button is there if scripts are off. */
export function ConfirmEmailSubmit({ tokenHash, type, next }: { tokenHash: string; type: string; next: string }) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    form.current?.requestSubmit();
  }, []);

  return (
    <form action="/auth/confirm/verify" className="flex flex-col gap-4" method="post" ref={form}>
      <input name="token_hash" type="hidden" value={tokenHash} />
      <input name="type" type="hidden" value={type} />
      <input name="next" type="hidden" value={next} />
      <button
        className="inline-flex w-full items-center justify-center rounded-lg bg-accent px-4 py-3 font-strong text-[13px] uppercase tracking-[0.04em] text-white transition-opacity hover:opacity-90"
        type="submit"
      >
        Confirm and continue →
      </button>
    </form>
  );
}
