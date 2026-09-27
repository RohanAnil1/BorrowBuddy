import { Clock3, ShieldX } from "lucide-react";
import { redirect } from "next/navigation";
import { StatusBadge } from "@/components/app/status-badge";
import { TicketTopBar } from "@/components/landing/hero";
import { VERIFICATION_STATUS_LABELS } from "@borrowbuddy/shared";
import { requireProfile } from "@/lib/auth/guards";
import { ResubmitForm } from "./resubmit-form";

export const metadata = { title: "Verification" };

export default async function PendingPage() {
  const profile = await requireProfile();

  if (!profile.full_name) redirect("/onboarding");
  if (profile.verification_status === "verified") redirect("/home");

  const rejected = profile.verification_status === "rejected";
  const suspended = profile.verification_status === "suspended";

  return (
    <div className="relative flex min-h-full flex-1 items-center justify-center px-4 py-20 dt:px-10">
      <div className="relative w-full max-w-lg border border-line bg-black p-8 dt:p-10">
        <TicketTopBar />

        <span className="status-bracket mt-8 block text-center text-[11px]">
          {suspended
            ? "[ ACCESS SUSPENDED ]"
            : rejected
              ? "[ VERIFICATION FAILED ]"
              : "[ IN THE REVIEW QUEUE ]"}
        </span>

        <h1 className="type-title mt-4 text-center text-[1.75rem]">
          {suspended
            ? "Account on hold"
            : rejected
              ? "Needs another look"
              : "Your ID is in the queue"}
        </h1>

        <p className="type-body mx-auto mt-4 max-w-sm text-center text-[13px] leading-6 text-ink/60 uppercase">
          {suspended
            ? "A CAMPUS ADMIN HAS PUT THIS ACCOUNT ON HOLD. CONTACT THE ADMIN TEAM TO RESOLVE IT."
            : rejected
              ? (profile.verification_note ??
                "SOMETHING ABOUT YOUR STUDENT ID DIDN'T CHECK OUT. UPLOAD A CLEARER PHOTO BELOW AND IT GOES STRAIGHT BACK TO REVIEW.")
              : "A CAMPUS ADMIN REVIEWS EVERY STUDENT ID. THE PORTAL AND YOUR PROFILE UNLOCK THE MOMENT YOU'RE APPROVED."}
        </p>

        <div className="mt-6 flex justify-center">
          <StatusBadge tone={rejected || suspended ? "danger" : "warning"}>
            {VERIFICATION_STATUS_LABELS[profile.verification_status]}
          </StatusBadge>
        </div>

        {rejected && <ResubmitForm ownerId={profile.id} />}

        <div className="mt-8 flex flex-col items-center gap-4">
          <p className="font-secondary text-center text-[9px] leading-5 text-ink/40">
            GOT YOUR ID APPROVED ELSEWHERE? THIS PAGE REFRESHES YOUR STATUS WHEN YOU
            RELOAD IT.
          </p>
          <form action="/auth/signout" method="post">
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 font-strong text-[12px] uppercase transition-colors hover:border-accent"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </div>

        {rejected || suspended ? <ShieldX className="hidden" /> : <Clock3 className="hidden" />}
      </div>
    </div>
  );
}
