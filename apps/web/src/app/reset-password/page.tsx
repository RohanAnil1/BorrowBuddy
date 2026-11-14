import type { Metadata } from "next";
import Link from "next/link";
import { AuthPanel } from "@/components/auth/auth-panel";
import { AuthShell } from "@/components/auth/auth-shell";
import { NewPasswordForm } from "@/components/auth/new-password-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Choose a new password",
};

export default async function ResetPasswordPage() {
  // The reset email's link signs the student in first (see /auth/callback).
  let email: string | undefined;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    email = user?.email ?? undefined;
  } catch {
    email = undefined;
  }

  return (
    <AuthShell>
      <AuthPanel mode="reset">
        {email ? (
          <>
            <h2 className="type-title text-[1.75rem]">Choose a new password</h2>
            <p className="font-secondary mt-3 mb-8 text-[11px] leading-5 text-ink/60">
              FOR {email.toUpperCase()}.
            </p>
            <NewPasswordForm />
          </>
        ) : (
          <>
            <h2 className="type-title text-[1.75rem]">Link expired</h2>
            <p className="font-secondary mt-3 mb-8 text-[11px] leading-5 text-ink/60">
              THIS PAGE NEEDS A FRESH RESET LINK. LINKS WORK ONCE, EXPIRE AFTER AN HOUR, AND OPEN IN THE BROWSER YOU
              ASKED FROM.
            </p>
            <Link
              className="inline-flex w-full items-center justify-center rounded-lg bg-accent px-4 py-3 font-strong text-[13px] uppercase tracking-[0.04em] text-white transition-opacity hover:opacity-90"
              href="/forgot-password"
            >
              Send me a new link →
            </Link>
          </>
        )}
      </AuthPanel>
    </AuthShell>
  );
}
