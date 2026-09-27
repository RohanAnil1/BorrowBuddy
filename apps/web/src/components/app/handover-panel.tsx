"use client";

import { KeyRound, RefreshCw } from "lucide-react";
import { useActionState } from "react";
import { confirmHandover, generateHandoverToken } from "@/app/(app)/loans/actions";
import { idleState } from "@/lib/action-state";
import { HandoverSuccess } from "./handover-success";
import { QrCodeTile } from "./qr-code";
import { SubmitButton } from "./submit-button";
import { TicketTopBar } from "@/components/landing/hero";

export function HandoverPanel({
  loanId,
  kind,
  mode,
}: {
  loanId: string;
  kind: "pickup" | "return";
  mode: "show" | "confirm";
}) {
  const [tokenState, tokenAction] = useActionState(generateHandoverToken, idleState);
  const [confirmState, confirmAction] = useActionState(confirmHandover, idleState);

  const code = tokenState.status === "success" ? tokenState.message : null;

  return (
    <div className="border border-line bg-black p-6">
      <TicketTopBar />

      <p className="flex items-center gap-2 font-secondary mt-5 text-[12px] uppercase text-ink">
        <KeyRound className="size-4 text-accent" />
        {kind === "pickup" ? "[ PICKUP HANDOVER ]" : "[ RETURN HANDOVER ]"}
      </p>

      {mode === "show" ? (
        <>
          <p className="type-body mt-2 text-[12px] leading-6 text-ink/60 uppercase">
            Show this boarding pass to the other student. The code expires after 15
            minutes and works once.
          </p>

          <div className="mt-6 flex flex-col items-center gap-5">
            {code ? (
              <QrCodeTile label={`${kind} handover QR`} payload={`bb:${kind}:${code}`} />
            ) : (
              <div className="flex h-[232px] w-[232px] items-center justify-center border border-line bg-panel font-secondary text-[9px] text-ink/40">
                NO ACTIVE CODE — GENERATE ONE
              </div>
            )}

            <p className="font-ticket text-[22px] tracking-[0.3em] text-ink">
              {code ?? "• • • • • •"}
            </p>
            <p className="font-secondary text-[9px] uppercase text-ink/50">
              {code ? "[ SINGLE USE · 15 MIN ]" : "[ NO ACTIVE CODE ]"}
            </p>

            <form action={tokenAction}>
              <input name="loan_id" type="hidden" value={loanId} />
              <input name="kind" type="hidden" value={kind} />
              <SubmitButton pendingLabel="GENERATING…">
                <RefreshCw className="size-4" />
                {code ? "NEW CODE" : "GENERATE CODE"}
              </SubmitButton>
            </form>

            <p className="font-secondary max-w-xs text-center text-[8px] leading-4 text-ink/40">
              NO SCANNER ON THE WEB APP — THE OTHER STUDENT READS THE CODE FROM YOUR QR
              (ANY PHONE CAMERA) OR YOU READ IT OUT. CAMERA SCANNING ARRIVES WITH THE
              BORROWBUDDY ANDROID APP.
            </p>
          </div>
        </>
      ) : (
        <>
          <p className="type-body mt-2 text-[12px] leading-6 text-ink/60 uppercase">
            Ask the other student for their boarding pass, then enter the six digits to
            confirm.
          </p>

          <form action={confirmAction} className="mt-5 flex flex-wrap items-center gap-3">
            <input name="loan_id" type="hidden" value={loanId} />
            <input name="kind" type="hidden" value={kind} />
            <input
              autoComplete="off"
              className="h-14 w-40 rounded-lg border border-line bg-panel px-4 text-center font-ticket text-2xl tracking-[0.3em] outline-none transition-colors focus:border-accent"
              inputMode="numeric"
              maxLength={6}
              name="token"
              pattern="\d{6}"
              placeholder="000000"
              required
            />
            <SubmitButton pendingLabel="CONFIRMING…">
              CONFIRM {kind.toUpperCase()}
            </SubmitButton>
          </form>
        </>
      )}

      {tokenState.status === "error" && (
        <p className="mt-4 border border-warn/50 bg-warn/10 px-4 py-3 font-secondary text-[10px] text-warn">
          [ {tokenState.message} ]
        </p>
      )}
      {confirmState.status === "error" && (
        <p className="mt-4 border border-warn/50 bg-warn/10 px-4 py-3 font-secondary text-[10px] text-warn">
          [ {confirmState.message} ]
        </p>
      )}
      {confirmState.status === "success" && (
        <div className="mt-4">
          <HandoverSuccess message={confirmState.message ?? "HANDOVER CONFIRMED"} />
        </div>
      )}
    </div>
  );
}
