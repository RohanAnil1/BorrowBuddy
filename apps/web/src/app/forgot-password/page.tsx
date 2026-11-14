import type { Metadata } from "next";
import { AuthPanel } from "@/components/auth/auth-panel";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot password",
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; error?: string }>;
}) {
  const { email, error } = await searchParams;
  // The Android app opens this page with the address already typed in.
  const prefill = typeof email === "string" && /^[^\s@]+@bennett\.edu\.in$/i.test(email) ? email : undefined;

  return (
    <AuthShell>
      <AuthPanel mode="reset">
        <h2 className="type-title text-[1.75rem]">Forgot your password?</h2>
        <p className="font-secondary mt-3 mb-8 text-[11px] leading-5 text-ink/60">
          ENTER YOUR COLLEGE EMAIL. WE&apos;LL SEND A ONE-TIME LINK TO CHOOSE A NEW ONE.
        </p>
        <ForgotPasswordForm email={prefill} linkFailed={error === "link"} />
      </AuthPanel>
    </AuthShell>
  );
}
