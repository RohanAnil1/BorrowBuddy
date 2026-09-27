"use client";

import { useActionState, useState } from "react";
import type { Profile } from "@borrowbuddy/shared";
import { STUDENT_ID_ALLOWED_TYPES, STUDENT_ID_MIN_BYTES } from "@borrowbuddy/shared";
import { ImageUploader } from "@/components/app/image-uploader";
import { SubmitButton } from "@/components/app/submit-button";
import { TicketTopBar } from "@/components/landing/hero";
import { BUCKETS } from "@/lib/storage";
import { idleState } from "@/lib/action-state";
import { completeOnboarding } from "./actions";

const DEPARTMENTS = [
  "Computer Science",
  "Electronics & Communication",
  "Mechanical Engineering",
  "Civil Engineering",
  "Biotechnology",
  "Business & Management",
  "Law",
  "Design",
  "Other",
];

const inputClass =
  "w-full rounded-lg border border-line bg-black px-4 py-3 text-[14px] text-ink outline-none transition-colors placeholder:text-ink/30 focus:border-accent";

const labelClass = "font-secondary text-[10px] text-ink/60";

export function OnboardingForm({ profile }: { profile: Profile }) {
  const [state, formAction] = useActionState(completeOnboarding, idleState);
  const [hasId, setHasId] = useState(Boolean(profile.student_id_path));

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <section className="flex flex-col gap-5 border border-line bg-panel p-6">
        <TicketTopBar />
        <h2 className="type-title text-xl">Who are you?</h2>

        <label className="flex flex-col gap-2">
          <span className={labelClass}>FULL NAME</span>
          <input
            className={inputClass}
            defaultValue={profile.full_name}
            name="full_name"
            placeholder="AS PRINTED ON YOUR STUDENT ID"
            required
          />
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className={labelClass}>PHONE</span>
            <input
              className={inputClass}
              defaultValue={profile.phone ?? ""}
              inputMode="numeric"
              maxLength={10}
              name="phone"
              placeholder="10-DIGIT MOBILE"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className={labelClass}>YEAR OF STUDY</span>
            <select className={inputClass} defaultValue={profile.year_of_study ?? 1} name="year_of_study">
              {[1, 2, 3, 4, 5].map((year) => (
                <option key={year} value={year}>
                  Year {year}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-2">
          <span className={labelClass}>DEPARTMENT</span>
          <select
            className={inputClass}
            defaultValue={profile.department ?? ""}
            name="department"
            required
          >
            <option value="">Choose</option>
            {DEPARTMENTS.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="flex flex-col gap-5 border border-line bg-panel p-6">
        <div>
          <h2 className="type-title text-xl">
            Student ID <span className="text-accent">·</span> required
          </h2>
          <p className="type-body mt-2 text-[13px] leading-6 text-ink/60 uppercase">
            Upload a clear PNG or JPG photo of your Bennett University ID. A campus
            admin reviews it — the portal and your profile unlock only after approval.
          </p>
        </div>

        <ImageUploader
          accept="image/png,image/jpeg"
          allowedTypes={[...STUDENT_ID_ALLOWED_TYPES]}
          bucket={BUCKETS.studentIds}
          hint="FRONT OF CARD · ALL 4 CORNERS VISIBLE · NO SCREENSHOTS · PNG OR JPG · UNDER 5MB. STORED PRIVATELY — ONLY YOU AND CAMPUS ADMINS CAN SEE IT."
          max={1}
          minBytes={STUDENT_ID_MIN_BYTES}
          name="student_id_path"
          onChange={(paths) => setHasId(paths.length > 0)}
          ownerId={profile.id}
        />
      </section>

      {state.status === "error" && (
        <p className="border border-warn/50 bg-warn/10 px-4 py-3 font-secondary text-[10px] leading-5 text-warn">
          [ {state.message} ]
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton disabled={!hasId} pendingLabel="SUBMITTING…">
          SUBMIT FOR ADMIN APPROVAL →
        </SubmitButton>
        <p className="font-secondary text-[9px] text-ink/40">
          {hasId
            ? "REPLACE THE PHOTO ANY TIME BEFORE APPROVAL."
            : "UPLOAD YOUR STUDENT ID TO CONTINUE."}
        </p>
      </div>
    </form>
  );
}
