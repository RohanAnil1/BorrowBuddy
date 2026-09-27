import type { Metadata } from "next";
import { AuthCredentialsForm } from "@/components/auth/auth-credentials-form";
import { AuthPanel } from "@/components/auth/auth-panel";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = {
  title: "Create account",
};

export default function SignupPage() {
  return (
    <AuthShell>
      <AuthPanel mode="signup">
        <h2 className="type-title text-[1.75rem]">Create your pass</h2>
        <p className="font-secondary mt-3 mb-8 text-[11px] leading-5 text-ink/60">
          COLLEGE EMAIL + PASSWORD FIRST. THEN NAME + STUDENT ID PHOTO. THEN ADMIN
          APPROVAL.
        </p>
        <AuthCredentialsForm mode="signup" />
      </AuthPanel>
    </AuthShell>
  );
}
