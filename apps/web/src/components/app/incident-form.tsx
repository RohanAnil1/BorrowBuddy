"use client";

import { AlertTriangle, ArrowLeft, ArrowRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useActionState, useState } from "react";
import { INCIDENT_TYPE_LABELS, type IncidentType } from "@borrowbuddy/shared";
import { openIncident } from "@/app/(app)/loans/incident-actions";
import { idleState } from "@/lib/action-state";
import { EASE } from "@/lib/motion/variants";
import { BUCKETS } from "@/lib/storage";
import { ImageUploader } from "./image-uploader";
import { SubmitButton } from "./submit-button";
import { TicketTopBar } from "@/components/landing/hero";

const TYPE_ICONS: Record<IncidentType, string> = {
  damage: "DAMAGE",
  lost: "LOST ITEM",
  late: "LATE RETURN",
  no_show: "NO-SHOW",
  other: "OTHER",
};

export function IncidentForm({
  loanId,
  ownerId,
}: {
  loanId: string;
  ownerId: string;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [type, setType] = useState<IncidentType | null>(null);
  const [photoPaths, setPhotoPaths] = useState<string[]>([]);
  const [state, formAction] = useActionState(openIncident, idleState);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 border border-line bg-panel p-6">
        <div>
          <p className="flex items-center gap-2 font-secondary text-[10px] uppercase text-ink">
            <AlertTriangle className="size-4 text-warn" />
            [ SOMETHING WENT WRONG? ]
          </p>
          <p className="type-body mt-2 text-[12px] leading-6 text-ink/60 uppercase">
            Damage, a missing return, a no-show? File it with photos and an admin will
            review it.
          </p>
        </div>
        <button
          className="rounded-lg border border-warn/60 bg-warn/10 px-4 py-2.5 font-strong text-[12px] uppercase text-warn transition-opacity hover:opacity-90"
          onClick={() => setOpen(true)}
          type="button"
        >
          Report a problem
        </button>
      </div>
    );
  }

  if (state.status === "success") {
    return (
      <div className="border border-accent/40 bg-accent/5 p-6">
        <p className="status-bracket text-[11px]">[ REPORT FILED ]</p>
        <p className="type-body mt-3 text-[13px] leading-6 text-ink/60 uppercase">
          {state.message}
        </p>
      </div>
    );
  }

  const canNext = step === 0 ? Boolean(type) : true;

  return (
    <form action={formAction} className="border border-warn/40 bg-black p-6">
      <TicketTopBar />

      <div className="mt-5 flex items-center justify-between">
        <p className="font-secondary text-[11px] uppercase text-ink">[ INCIDENT REPORT ]</p>
        <div className="flex items-center gap-2">
          {[0, 1, 2].map((index) => (
            <span
              className={`h-1 w-6 ${index === step ? "bg-accent" : index < step ? "bg-accent/40" : "bg-ink/15"}`}
              key={index}
            />
          ))}
        </div>
      </div>

      <input name="loan_id" type="hidden" value={loanId} />
      <input name="type" type="hidden" value={type ?? ""} />
      <input name="photo_paths" type="hidden" value={JSON.stringify(photoPaths)} />

      <div className="relative mt-6 min-h-[320px]">
        <AnimatePresence initial={false} mode="wait">
          {step === 0 && (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col gap-4"
              exit={{ opacity: 0, x: -24 }}
              initial={{ opacity: 0, x: 24 }}
              key="step-type"
              transition={{ duration: 0.22, ease: EASE }}
            >
              <p className="font-secondary text-[10px] text-ink/50">STEP 1 — WHAT HAPPENED?</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(Object.keys(INCIDENT_TYPE_LABELS) as IncidentType[]).map((value) => (
                  <button
                    className={`border p-4 text-left transition-colors ${
                      type === value
                        ? "border-accent bg-accent/10"
                        : "border-line bg-panel hover:border-accent/50"
                    }`}
                    key={value}
                    onClick={() => setType(value)}
                    type="button"
                  >
                    <span className="font-secondary text-[9px] text-ink/40">
                      {TYPE_ICONS[value]}
                    </span>
                    <p className="type-body-alt mt-1 text-[13px] uppercase">
                      {INCIDENT_TYPE_LABELS[value]}
                    </p>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col gap-4"
              exit={{ opacity: 0, x: -24 }}
              initial={{ opacity: 0, x: 24 }}
              key="step-evidence"
              transition={{ duration: 0.22, ease: EASE }}
            >
              <p className="font-secondary text-[10px] text-ink/50">
                STEP 2 — PHOTO EVIDENCE
              </p>
              <p className="type-body text-[12px] leading-6 text-ink/60 uppercase">
                Photos make disputes resolve faster. Clear shots of the item and the
                problem.
              </p>
              <ImageUploader
                bucket={BUCKETS.incidentPhotos}
                max={6}
                initialPaths={photoPaths}
                name="evidence_preview_paths"
                onChange={setPhotoPaths}
                ownerId={ownerId}
              />
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col gap-4"
              exit={{ opacity: 0, x: -24 }}
              initial={{ opacity: 0, x: 24 }}
              key="step-describe"
              transition={{ duration: 0.22, ease: EASE }}
            >
              <p className="font-secondary text-[10px] text-ink/50">
                STEP 3 — DESCRIBE IT
              </p>
              <label className="flex flex-col gap-2">
                <span className="font-secondary text-[9px] text-ink/50">
                  WHAT HAPPENED, IN YOUR OWN WORDS
                </span>
                <textarea
                  className="min-h-32 w-full rounded-lg border border-line bg-panel px-4 py-3 text-[14px] outline-none transition-colors placeholder:text-ink/30 focus:border-accent"
                  maxLength={2000}
                  name="description"
                  placeholder="Timeline, condition, who did what — the admin reads exactly this."
                  required
                />
              </label>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {state.status === "error" && (
        <p className="mt-4 border border-warn/50 bg-warn/10 px-4 py-3 font-secondary text-[10px] text-warn">
          [ {state.message} ]
        </p>
      )}

      <div className="mt-6 flex items-center justify-between">
        <button
          className="flex items-center gap-2 font-secondary text-[10px] uppercase text-ink/50 transition-colors hover:text-ink disabled:opacity-40"
          disabled={step === 0}
          onClick={() => setStep((value) => Math.max(0, value - 1))}
          type="button"
        >
          <ArrowLeft className="size-3" /> BACK
        </button>

        {step < 2 ? (
          <button
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-strong text-[12px] uppercase text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            disabled={!canNext}
            onClick={() => setStep((value) => Math.min(2, value + 1))}
            type="button"
          >
            NEXT <ArrowRight className="size-3" />
          </button>
        ) : (
          <SubmitButton pendingLabel="FILING…">FILE THE REPORT →</SubmitButton>
        )}
      </div>
    </form>
  );
}
