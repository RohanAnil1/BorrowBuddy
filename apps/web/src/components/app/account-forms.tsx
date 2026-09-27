"use client";

import { useActionState } from "react";
import type { Profile } from "@borrowbuddy/shared";
import { idleState } from "@/lib/action-state";
import { ImageUploader } from "./image-uploader";
import { SubmitButton } from "./submit-button";
import { submitStudentId, updateProfile } from "@/app/(app)/me/actions";
import { BUCKETS } from "@/lib/storage";

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
  "w-full rounded-lg border border-line bg-black px-4 py-3 text-[14px] text-ink outline-none transition-colors focus:border-accent";
const labelClass = "font-secondary text-[10px] text-ink/50";

function Notice({ status, message }: { status: string; message?: string }) {
  if (status === "error") {
    return (
      <p className="border border-warn/50 bg-warn/10 px-4 py-3 font-secondary text-[10px] text-warn">
        [ {message} ]
      </p>
    );
  }
  if (status === "success") {
    return (
      <p className="border border-accent/50 bg-accent/10 px-4 py-3 font-secondary text-[10px] text-accent">
        [ {message} ]
      </p>
    );
  }
  return null;
}

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, formAction] = useActionState(updateProfile, idleState);

  return (
    <form action={formAction} className="flex flex-col gap-5 border border-line bg-panel p-6">
      <h2 className="font-secondary text-[11px] uppercase text-ink/60">[ YOUR DETAILS ]</h2>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className={labelClass}>FULL NAME</span>
          <input
            className={inputClass}
            defaultValue={profile.full_name}
            name="full_name"
            required
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className={labelClass}>PHONE</span>
          <input
            className={inputClass}
            defaultValue={profile.phone ?? ""}
            inputMode="numeric"
            maxLength={10}
            name="phone"
            placeholder="10-digit mobile"
          />
        </label>

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

        <label className="flex flex-col gap-2">
          <span className={labelClass}>YEAR OF STUDY</span>
          <select
            className={inputClass}
            defaultValue={profile.year_of_study ?? 1}
            name="year_of_study"
          >
            {[1, 2, 3, 4, 5].map((year) => (
              <option key={year} value={year}>
                Year {year}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Notice message={state.message} status={state.status} />

      <div>
        <SubmitButton pendingLabel="SAVING…">Save details</SubmitButton>
      </div>
    </form>
  );
}

export function StudentIdForm({ profile }: { profile: Profile }) {
  const [state, formAction] = useActionState(submitStudentId, idleState);

  return (
    <form action={formAction} className="flex flex-col gap-5 border border-line bg-panel p-6">
      <div>
        <h2 className="font-secondary text-[11px] uppercase text-ink/60">[ STUDENT ID ]</h2>
        <p className="type-body mt-2 text-[13px] leading-6 text-ink/60 uppercase">
          Upload a clear photo of your Bennett University ID card. Admins review it
          before you can borrow or lend.
        </p>
      </div>

      <ImageUploader
        accept="image/png,image/jpeg,image/webp,application/pdf"
        bucket={BUCKETS.studentIds}
        hint="ONE FILE, UP TO 5MB. STORED PRIVATELY. ONLY YOU AND ADMINS CAN SEE IT."
        initialPaths={profile.student_id_path ? [profile.student_id_path] : []}
        max={1}
        name="student_id_path"
        ownerId={profile.id}
      />

      <Notice message={state.message} status={state.status} />

      <div>
        <SubmitButton pendingLabel="SUBMITTING…">Submit for review</SubmitButton>
      </div>
    </form>
  );
}
