import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/guards";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const profile = await requireProfile();

  if (profile.full_name) {
    redirect("/home");
  }

  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="status-bracket text-[11px]">[ REGISTRATION · STEP 1 OF 2 ]</p>
          {/* Signed up with the wrong address? Leave without finishing onboarding. */}
          <form action="/auth/signout" method="post" className="flex items-center gap-3">
            {profile.email ? (
              <span className="font-secondary hidden text-[9px] text-ink/40 sm:inline">
                {profile.email.toUpperCase()}
              </span>
            ) : null}
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 font-strong text-[11px] uppercase transition-colors hover:border-accent"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </div>
        <h1 className="type-title mt-4">Board the network</h1>
        <p className="type-body mt-4 max-w-lg text-[14px] leading-6 uppercase text-ink/60">
          Two minutes now saves a lot of awkwardness later. Tell us who you are and
          upload your student ID — a campus admin approves it before the portal unlocks.
        </p>

        <div className="mt-10">
          <OnboardingForm profile={profile} />
        </div>
      </div>
    </div>
  );
}
