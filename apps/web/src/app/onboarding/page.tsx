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
        <p className="status-bracket text-[11px]">[ REGISTRATION · STEP 1 OF 2 ]</p>
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
