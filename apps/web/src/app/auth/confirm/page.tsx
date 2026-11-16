import type { Metadata } from "next";
import Link from "next/link";
import { AuthPanel } from "@/components/auth/auth-panel";
import { AuthShell } from "@/components/auth/auth-shell";
import { ConfirmEmailSubmit } from "@/components/auth/confirm-email-submit";

export const metadata: Metadata = {
  title: "Confirm your email",
};

/**
 * The sign-up confirmation email's link lands here. Opening the page changes
 * nothing (mail scanners open links too); it posts the token straight away,
 * which confirms the email, signs the student in on this device and opens
 * onboarding.
 */
export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash: tokenHash, type, next } = await searchParams;
  const valid =
    typeof tokenHash === "string" &&
    /^[\w-]{10,200}$/.test(tokenHash) &&
    (type === "email" || type === "signup");

  return (
    <AuthShell>
      <AuthPanel mode="signup">
        {valid ? (
          <>
            <h2 className="type-title text-[1.75rem]">Confirming your email</h2>
            <p className="font-secondary mt-3 mb-8 text-[11px] leading-5 text-ink/60">
              ONE MOMENT. YOU&apos;LL GO STRAIGHT TO ONBOARDING TO SET UP YOUR PASS.
            </p>
            <ConfirmEmailSubmit next={typeof next === "string" ? next : "/onboarding"} tokenHash={tokenHash} type={type} />
          </>
        ) : (
          <>
            <h2 className="type-title text-[1.75rem]">Link not valid</h2>
            <p className="font-secondary mt-3 mb-8 text-[11px] leading-5 text-ink/60">
              THIS CONFIRMATION LINK IS INCOMPLETE. OPEN THE LINK FROM YOUR EMAIL AGAIN, OR SIGN IN TO GET A NEW ONE.
            </p>
            <Link
              className="inline-flex w-full items-center justify-center rounded-lg bg-accent px-4 py-3 font-strong text-[13px] uppercase tracking-[0.04em] text-white transition-opacity hover:opacity-90"
              href="/login"
            >
              Go to sign in →
            </Link>
          </>
        )}
      </AuthPanel>
    </AuthShell>
  );
}
