import { LogOut, Mail, Map, Receipt, ShieldCheck, ShieldX } from "lucide-react";
import Link from "next/link";
import { ProfileForm, StudentIdForm } from "@/components/app/account-forms";
import { MemberIdCard } from "@/components/app/member-id-card";
import { toMemberCardProfile } from "@/components/app/member-card-profile";
import { StatusBadge } from "@/components/app/status-badge";
import { SubmitButton } from "@/components/app/submit-button";
import { VERIFICATION_STATUS_LABELS } from "@borrowbuddy/shared";
import { requireProfile } from "@/lib/auth/guards";
import { getOutstandingTotal } from "@/lib/data/fines";
import { getProfileStamps } from "@/lib/data/stamps";
import { signOut } from "../actions";
import { setEmailNotifications } from "./actions";

export const metadata = { title: "You" };

export default async function MePage() {
  const profile = await requireProfile();
  // Stamps need a verified viewer; pending students see the card without them.
  const [outstanding, stamps] = await Promise.all([
    getOutstandingTotal(profile.id),
    profile.verification_status === "verified" ? getProfileStamps(profile.id) : null,
  ]);

  const tone =
    profile.verification_status === "verified"
      ? "success"
      : profile.verification_status === "pending"
        ? "warning"
        : "danger";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 dt:px-10">
      <p className="status-bracket text-[10px]">[ CREW FILE ]</p>
      <h1 className="type-title mt-3 text-[2rem] dt:text-[2.5rem]">
        {profile.full_name || "Your profile"}
      </h1>
      <p className="font-secondary mt-2 text-[10px] text-ink/50">{profile.email.toUpperCase()}</p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <StatusBadge tone={tone}>{VERIFICATION_STATUS_LABELS[profile.verification_status]}</StatusBadge>
        <StatusBadge tone="muted">Trust score {Math.round(profile.trust_score)}</StatusBadge>
        {profile.is_admin && <StatusBadge tone="info">Admin</StatusBadge>}
      </div>

      {profile.verification_status === "rejected" && profile.verification_note && (
        <p className="type-body mt-6 flex items-start gap-3 border border-warn/50 bg-warn/10 px-5 py-4 text-[13px] leading-6 text-warn">
          <ShieldX className="mt-0.5 size-4 shrink-0" />
          {profile.verification_note}
        </p>
      )}

      {profile.verification_status === "pending" && (
        <p className="type-body mt-6 flex items-start gap-3 border border-warn/40 bg-warn/5 px-5 py-4 text-[13px] leading-6 uppercase">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-warn" />
          Your student ID is in the review queue. You can browse and list in the meantime.
          Requests unlock once you&apos;re verified.
        </p>
      )}

      <MemberIdCard profile={toMemberCardProfile(profile)} stamps={stamps} stampView="owner" />

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Link
          className="flex items-center justify-between gap-4 border border-line bg-panel p-5 transition-colors hover:border-accent"
          href="/fines"
        >
          <div>
            <p className="flex items-center gap-2 font-secondary text-[11px] uppercase text-ink">
              <Receipt className="size-4 text-accent" />
              [ FINES ]
            </p>
            <p className="font-secondary mt-1 text-[9px] text-ink/50">
              {outstanding > 0 ? `₹${outstanding} OUTSTANDING` : "NOTHING OUTSTANDING"}
            </p>
          </div>
          <span className="font-secondary text-[9px] text-ink/40">OPEN →</span>
        </Link>

        <Link
          className="flex items-center justify-between gap-4 border border-line bg-panel p-5 transition-colors hover:border-accent"
          href="/map"
        >
          <div>
            <p className="flex items-center gap-2 font-secondary text-[11px] uppercase text-ink">
              <Map className="size-4 text-accent" />
              [ PICKUP MAP ]
            </p>
            <p className="font-secondary mt-1 text-[9px] text-ink/50">CAMPUS HANDOVER SPOTS</p>
          </div>
          <span className="font-secondary text-[9px] text-ink/40">OPEN →</span>
        </Link>
      </div>

      {profile.email_notifications !== undefined && (
        <section aria-labelledby="email-heading" className="mt-8 scroll-mt-24 border border-line bg-panel p-5" id="email">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-md">
              <h2 className="flex items-center gap-2 font-secondary text-[11px] uppercase text-ink" id="email-heading">
                <Mail className="size-4 text-accent" /> [ EMAIL UPDATES ]
              </h2>
              <p className="mt-2 text-[13px] normal-case leading-6 text-ink/70">
                {profile.email_notifications
                  ? `On. Requests, due dates, extensions and fines you haven't seen in the app go to ${profile.email}, at most one email every 5 minutes.`
                  : "Off. You'll still see everything in the app and on the bell."}
              </p>
            </div>
            <form action={setEmailNotifications}>
              <input name="enabled" type="hidden" value={profile.email_notifications ? "0" : "1"} />
              <SubmitButton pendingLabel="SAVING…" variant={profile.email_notifications ? "secondary" : "primary"}>
                {profile.email_notifications ? "Turn off" : "Turn on"}
              </SubmitButton>
            </form>
          </div>
        </section>
      )}

      <div className="mt-8 flex flex-col gap-6">
        <ProfileForm profile={profile} />
        {profile.verification_status !== "verified" && <StudentIdForm profile={profile} />}
      </div>

      <form action={signOut} className="mt-8">
        <SubmitButton pendingLabel="SIGNING OUT…" variant="secondary">
          <LogOut className="size-4" />
          Sign out
        </SubmitButton>
      </form>
    </div>
  );
}
