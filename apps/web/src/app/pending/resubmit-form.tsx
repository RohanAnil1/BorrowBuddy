"use client";

import { useActionState } from "react";
import { STUDENT_ID_ALLOWED_TYPES, STUDENT_ID_MIN_BYTES } from "@borrowbuddy/shared";
import { ImageUploader } from "@/components/app/image-uploader";
import { SubmitButton } from "@/components/app/submit-button";
import { idleState } from "@/lib/action-state";
import { BUCKETS } from "@/lib/storage";
import { resubmitStudentId } from "./actions";

export function ResubmitForm({ ownerId }: { ownerId: string }) {
  const [state, formAction] = useActionState(resubmitStudentId, idleState);

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-4 text-left">
      <ImageUploader
        accept="image/png,image/jpeg"
        allowedTypes={[...STUDENT_ID_ALLOWED_TYPES]}
        bucket={BUCKETS.studentIds}
        hint="FRONT OF CARD · ALL 4 CORNERS VISIBLE · NO SCREENSHOTS · PNG OR JPG · UNDER 5MB"
        max={1}
        minBytes={STUDENT_ID_MIN_BYTES}
        name="student_id_path"
        ownerId={ownerId}
      />

      {state.status === "error" && (
        <p className="border border-warn/50 bg-warn/10 px-4 py-3 font-secondary text-[10px] leading-5 text-warn">
          [ {state.message} ]
        </p>
      )}

      <SubmitButton pendingLabel="SUBMITTING…">RESUBMIT FOR REVIEW</SubmitButton>
    </form>
  );
}
