"use client";

import { useActionState } from "react";
import { submitReview } from "@/app/(app)/loans/incident-actions";
import { idleState } from "@/lib/action-state";
import { StarRatingInput } from "./star-rating";
import { SubmitButton } from "./submit-button";

export function ReviewForm({ loanId, counterpartyName }: { loanId: string; counterpartyName: string }) {
  const [state, formAction] = useActionState(submitReview, idleState);

  if (state.status === "success") {
    return (
      <div className="border border-accent/40 bg-accent/5 p-6">
        <p className="status-bracket text-[11px]">[ RATING LOGGED ]</p>
        <p className="type-body mt-3 text-[13px] leading-6 text-ink/60 uppercase">
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 border border-line bg-panel p-6">
      <input name="loan_id" type="hidden" value={loanId} />
      <div>
        <h2 className="font-secondary text-[11px] uppercase text-ink">
          [ RATE {counterpartyName.toUpperCase()} ]
        </h2>
        <p className="type-body mt-2 text-[12px] text-ink/60 uppercase">
          Ratings feed their trust score and help everyone decide who to lend to.
        </p>
      </div>

      <StarRatingInput />

      <textarea
        className="min-h-20 w-full rounded-lg border border-line bg-black px-4 py-3 text-[14px] outline-none transition-colors placeholder:text-ink/30 focus:border-accent"
        maxLength={500}
        name="comment"
        placeholder="How was the handover? Would you lend to them again?"
      />

      {state.status === "error" && (
        <p className="border border-warn/50 bg-warn/10 px-4 py-3 font-secondary text-[10px] text-warn">
          [ {state.message} ]
        </p>
      )}

      <div>
        <SubmitButton pendingLabel="LOGGING…">SUBMIT RATING</SubmitButton>
      </div>
    </form>
  );
}
