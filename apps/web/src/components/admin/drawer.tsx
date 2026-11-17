"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const TRIGGERS = {
  primary:
    "bg-accent text-white hover:opacity-90",
  secondary:
    "border border-ink/25 bg-black/50 text-ink hover:border-accent hover:text-accent",
  danger:
    "border border-warn/60 text-warn hover:bg-warn/10",
} as const;

/**
 * A button that opens a right-hand slide-over for a row action (reject with a
 * reason, resolve an incident, edit a pin...). It's a native modal <dialog>,
 * so focus is trapped and Escape closes it. Submitting any form inside closes
 * it; the action's toast reports how it went.
 */
export function Drawer({
  label,
  icon,
  eyebrow,
  title,
  description,
  variant = "secondary",
  size = "md",
  defaultOpen = false,
  children,
}: {
  label: ReactNode;
  icon?: ReactNode;
  eyebrow: string;
  title: string;
  description?: ReactNode;
  variant?: keyof typeof TRIGGERS;
  size?: "md" | "sm";
  /** Open as soon as the page loads (e.g. a "New group" link from elsewhere). */
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (defaultOpen && !dialog.current?.open) dialog.current?.showModal();
  }, [defaultOpen]);

  return (
    <>
      <button
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg font-strong uppercase tracking-[0.04em] transition-colors",
          size === "sm" ? "min-h-9 px-3 text-[12px]" : "min-h-10 px-4 text-[13px]",
          TRIGGERS[variant],
        )}
        onClick={() => dialog.current?.showModal()}
        type="button"
      >
        {icon}
        {label}
      </button>

      <dialog
        aria-labelledby={titleId}
        className="admin-drawer"
        onClick={(event) => {
          // A click on the backdrop (the dialog element itself) closes it.
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
        onSubmit={() => dialog.current?.close()}
        ref={dialog}
      >
        <div className="flex h-full flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line p-5">
            <div className="min-w-0">
              <p className="status-bracket text-[11px]">[ {eyebrow} ]</p>
              <h2 className="type-title mt-2 break-words" id={titleId} style={{ fontSize: "1.75rem" }}>
                {title}
              </h2>
              {description && (
                <div className="mt-2 text-[13px] normal-case leading-6 text-ink/70">{description}</div>
              )}
            </div>
            <button
              aria-label="Close"
              autoFocus
              className="grid size-10 shrink-0 place-items-center rounded-lg border border-line text-ink/70 transition-colors hover:border-accent hover:text-ink"
              onClick={() => dialog.current?.close()}
              type="button"
            >
              <X aria-hidden className="size-4" />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-5">{children}</div>
        </div>
      </dialog>
    </>
  );
}
