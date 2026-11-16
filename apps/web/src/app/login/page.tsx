import type { Metadata } from "next";
import { AuthCredentialsForm } from "@/components/auth/auth-credentials-form";
import { AuthPanel } from "@/components/auth/auth-panel";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; ended?: string; confirmed?: string; error?: string }>;
}) {
  const { next, ended, confirmed, error } = await searchParams;

  return (
    <AuthShell>
      <AuthPanel mode="login">
        <h2 className="type-title text-[1.75rem]">Welcome back</h2>
        <p className="font-secondary mt-3 mb-8 text-[11px] leading-5 text-ink/60">
          YOUR COLLEGE EMAIL AND PASSWORD. THAT&apos;S THE DOOR.
        </p>
        {confirmed === "1" && (
          <p className="mb-6 border border-accent/50 bg-accent/10 px-4 py-3 font-secondary text-[10px] leading-5 text-accent">
            [ EMAIL CONFIRMED. SIGN IN HERE OR IN THE APP TO SET UP YOUR PASS. ]
          </p>
        )}
        {error === "confirm" && (
          <p className="mb-6 border border-warn/50 bg-warn/10 px-4 py-3 font-secondary text-[10px] leading-5 text-warn">
            [ THAT CONFIRMATION LINK HAS EXPIRED OR WAS ALREADY USED. SIGN IN TO GET A NEW ONE. ]
          </p>
        )}
        {ended === "1" && (
          <p className="mb-6 border border-warn/50 bg-warn/10 px-4 py-3 font-secondary text-[10px] leading-5 text-warn">
            [ YOU&apos;VE BEEN SIGNED OUT. SIGN IN AGAIN TO CONTINUE. ]
          </p>
        )}
        <AuthCredentialsForm mode="login" next={next} />
      </AuthPanel>
    </AuthShell>
  );
}
