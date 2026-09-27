"use client";

import { CalendarClock, CheckCircle2, Clock } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useActionState, useState } from "react";
import type { AvailabilityWindow } from "@borrowbuddy/shared";
import { createBorrowRequest, joinWaitlist } from "@/app/(app)/items/actions";
import { idleState } from "@/lib/action-state";
import { AvailabilityCalendar } from "./availability-calendar";
import { SubmitButton } from "./submit-button";

type Verify = "idle" | "checking" | "ok" | "fail";

export function RequestForm({
  itemId,
  windows,
  maxLoanDays,
  canRequest,
  isOwner,
}: {
  itemId: string;
  windows: AvailabilityWindow[];
  maxLoanDays: number;
  canRequest: boolean;
  isOwner: boolean;
}) {
  const [range, setRange] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });
  const [verified, setVerified] = useState<Verify>("idle");
  const [requestState, requestAction] = useActionState(createBorrowRequest, idleState);
  const [waitlistState, waitlistAction] = useActionState(joinWaitlist, idleState);

  function handleRange(next: { start: string | null; end: string | null }) {
    setRange(next);
    if (next.start && next.end) {
      setVerified("checking");
      // Simulated date-overlap verification pass before the submit arms.
      window.setTimeout(() => setVerified("ok"), 550);
    } else {
      setVerified("idle");
    }
  }

  const hasRange = Boolean(range.start && range.end);
  const armed = hasRange && verified === "ok";

  if (isOwner) {
    return (
      <div className="border border-line bg-panel p-6">
        <p className="status-bracket text-[10px]">[ YOUR LISTING ]</p>
        <p className="type-body mt-3 text-[13px] leading-6 text-ink/60 uppercase">
          You can pause it, edit it, or block dates from your items page.
        </p>
      </div>
    );
  }

  if (!canRequest) {
    return (
      <div className="border border-warn/40 bg-warn/5 p-6">
        <p className="flex items-center gap-2 font-secondary text-[11px] uppercase text-warn">
          <Clock className="size-4" />
          [ VERIFICATION PENDING ]
        </p>
        <p className="type-body mt-3 text-[13px] leading-6 text-ink/60 uppercase">
          Once an admin approves your student ID you can request items. It usually takes
          a day.
        </p>
      </div>
    );
  }

  if (requestState.status === "success") {
    return (
      <div className="border border-accent/40 bg-accent/5 p-6">
        <p className="flex items-center gap-2 font-secondary text-[11px] uppercase text-accent">
          <CheckCircle2 className="size-4" />
          [ REQUEST DISPATCHED ]
        </p>
        <p className="type-body mt-3 text-[13px] leading-6 text-ink/60 uppercase">
          {requestState.message ??
            "The owner will approve or decline within 48 hours. You will get a notification."}
        </p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-5 ${armed ? "pb-24" : ""}`}>
      <AvailabilityCalendar
        end={range.end}
        maxLoanDays={maxLoanDays}
        onChange={handleRange}
        start={range.start}
        verified={verified}
        windows={windows}
      />

      <form action={requestAction} className="flex flex-col gap-4" id="request-borrow">
        <input name="item_id" type="hidden" value={itemId} />
        <input name="start_date" type="hidden" value={range.start ?? ""} />
        <input name="end_date" type="hidden" value={range.end ?? ""} />

        <label className="flex flex-col gap-2">
          <span className="font-secondary text-[10px] text-ink/60">MESSAGE TO THE OWNER</span>
          <textarea
            className="min-h-24 w-full rounded-lg border border-line bg-black px-4 py-3 text-[14px] outline-none transition-colors placeholder:text-ink/30 focus:border-accent"
            maxLength={500}
            name="message"
            placeholder="What do you need it for? When can you pick it up?"
          />
        </label>

        {requestState.status === "error" && (
          <p className="border border-warn/50 bg-warn/10 px-4 py-3 font-secondary text-[10px] leading-5 text-warn">
            [ {requestState.message} ]
          </p>
        )}

        <SubmitButton
          className="hidden dt:inline-flex"
          disabled={!armed}
          pendingLabel="DISPATCHING…"
        >
          <CalendarClock className="size-4" />
          {armed
            ? `DISPATCH REQUEST ${range.start} → ${range.end}`
            : "PICK YOUR DATES FIRST"}
        </SubmitButton>
      </form>

      <form
        action={waitlistAction}
        className="flex items-center justify-between gap-4 border border-line bg-black px-5 py-4"
      >
        <input name="item_id" type="hidden" value={itemId} />
        <input name="start_date" type="hidden" value={range.start ?? ""} />
        <input name="end_date" type="hidden" value={range.end ?? ""} />
        <div>
          <p className="font-secondary text-[10px] uppercase text-ink">[ DATES TAKEN? ]</p>
          <p className="type-body mt-1 text-[12px] leading-5 text-ink/50 uppercase">
            Join the waitlist — pinged the moment it frees up.
          </p>
          {waitlistState.status === "success" && (
            <p className="font-secondary mt-1 text-[9px] text-accent">
              [ {waitlistState.message} ]
            </p>
          )}
          {waitlistState.status === "error" && (
            <p className="font-secondary mt-1 text-[9px] text-warn">[ {waitlistState.message} ]</p>
          )}
        </div>
        <SubmitButton disabled={!hasRange} pendingLabel="JOINING…" variant="secondary">
          JOIN WAITLIST
        </SubmitButton>
      </form>

      {/* sticky mobile booking bar — submits the same form via form="request-borrow" */}
      <AnimatePresence>
        {armed && (
          <motion.div
            animate={{ y: 0, opacity: 1 }}
            className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-black px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dt:hidden"
            exit={{ y: 24, opacity: 0 }}
            initial={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          >
            <button
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 font-strong text-[12px] uppercase text-white transition-opacity hover:opacity-90"
              form="request-borrow"
              type="submit"
            >
              <CalendarClock className="size-4" />
              REQUEST TO BORROW · {range.start} → {range.end}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
