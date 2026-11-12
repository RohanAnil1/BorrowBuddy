"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * A destructive submit button that asks first. Place it inside the <form>
 * (instead of SubmitButton): it opens a native modal dialog, and only the
 * dialog's confirm button actually submits the form.
 */
export function ConfirmSubmit({
  children,
  title,
  message,
  confirmLabel,
  pendingLabel = "WORKING…",
  className,
}: {
  children: React.ReactNode;
  title: string;
  message: string;
  confirmLabel: string;
  pendingLabel?: string;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { pending } = useFormStatus();

  return (
    <>
      <button
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg border border-warn/60 px-4 py-2.5 font-strong text-[13px] uppercase tracking-[0.04em] text-warn transition-colors duration-150 hover:bg-warn/10 disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        disabled={pending}
        onClick={() => dialog.current?.showModal()}
        type="button"
      >
        {pending ? pendingLabel : children}
      </button>

      <dialog
        aria-label={title}
        className="m-auto w-[min(26rem,calc(100vw-2rem))] border border-line bg-black p-0 text-ink backdrop:bg-black/70"
        onClick={(event) => {
          // A click on the backdrop (the dialog element itself) closes it.
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
        ref={dialog}
      >
        <div className="flex flex-col gap-3 p-6">
          <p className="status-bracket text-[10px]">[ PLEASE CONFIRM ]</p>
          <h2 className="type-title text-[1.6rem] leading-tight">{title}</h2>
          <p className="type-body text-[13px] normal-case leading-6 text-ink/75">{message}</p>
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <button
              autoFocus
              className="rounded-lg border border-line px-4 py-2.5 font-strong text-[12px] uppercase transition-colors hover:border-accent"
              onClick={() => dialog.current?.close()}
              type="button"
            >
              Keep it
            </button>
            <button
              className="rounded-lg bg-warn px-4 py-2.5 font-strong text-[12px] uppercase text-black transition-opacity hover:opacity-90"
              onClick={() => dialog.current?.close()}
              type="submit"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
