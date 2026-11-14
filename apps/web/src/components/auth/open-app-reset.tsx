"use client";

import { useEffect } from "react";

export function OpenAppReset({ href, auto }: { href: string; auto: boolean }) {
  // Try straight away; the button is there when the browser wants a tap first.
  useEffect(() => {
    if (auto) window.location.href = href;
  }, [auto, href]);

  return (
    <div className="flex flex-col gap-4">
      <a
        className="inline-flex w-full items-center justify-center rounded-lg bg-accent px-4 py-3 font-strong text-[13px] uppercase tracking-[0.04em] text-white transition-opacity hover:opacity-90"
        href={href}
      >
        Open BorrowBuddy →
      </a>
      <p className="font-secondary text-center text-[9px] leading-5 text-ink/40">
        OPEN THIS LINK ON THE PHONE WHERE YOU ASKED FOR IT, WITH BORROWBUDDY 0.4.5 OR NEWER INSTALLED.
      </p>
    </div>
  );
}
