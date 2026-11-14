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
  searchParams: Promise<{ next?: string; ended?: string }>;
}) {
  const { next, ended } = await searchParams;

  return (
    <AuthShell>
      <AuthPanel mode="login">
        <h2 className="type-title text-[1.75rem]">Welcome back</h2>
        <p className="font-secondary mt-3 mb-8 text-[11px] leading-5 text-ink/60">
          YOUR COLLEGE EMAIL AND PASSWORD. THAT&apos;S THE DOOR.
        </p>
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
