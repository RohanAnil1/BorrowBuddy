import type { ReactNode } from "react";
import { StatusTicker } from "@/components/landing/status-ticker";

/** Shared auth-page chrome: live ticker, centered panel, secure-channel strip.
 *  The photographic backdrop comes from the root layout's fixed layer. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <StatusTicker />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-10 px-4 py-14 dt:px-10 dt:py-20">
        {children}

        <p className="status-bracket blink-label text-[9px] opacity-50">
          [ SECURE CHANNEL · ENCRYPTED SESSIONS · BENNETT UNIVERSITY ]
        </p>
      </div>
    </div>
  );
}
