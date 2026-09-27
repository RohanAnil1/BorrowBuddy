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
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <AuthShell>
      <AuthPanel mode="login">
        <h2 className="type-title text-[1.75rem]">Welcome back</h2>
        <p className="font-secondary mt-3 mb-8 text-[11px] leading-5 text-ink/60">
          YOUR COLLEGE EMAIL AND PASSWORD. THAT&apos;S THE DOOR.
        </p>
        <AuthCredentialsForm mode="login" next={next} />
      </AuthPanel>
    </AuthShell>
  );
}
