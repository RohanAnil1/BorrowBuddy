import type { Metadata } from "next";
import { AuthPanel } from "@/components/auth/auth-panel";
import { AuthShell } from "@/components/auth/auth-shell";
import { OpenAppReset } from "@/components/auth/open-app-reset";

export const metadata: Metadata = {
  title: "Open BorrowBuddy",
};

/** Where a reset link the Android app asked for lands, on its way back into the app. */
export default async function AppResetPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string }>;
}) {
  const { code } = await searchParams;
  const valid = typeof code === "string" && /^[\w-]{1,200}$/.test(code);
  const href = valid
    ? `borrowbuddy://auth/reset?code=${encodeURIComponent(code)}`
    : "borrowbuddy://auth/reset?error=link";

  return (
    <AuthShell>
      <AuthPanel mode="reset">
        <h2 className="type-title text-[1.75rem]">{valid ? "Back to the app" : "Link expired"}</h2>
        <p className="font-secondary mt-3 mb-8 text-[11px] leading-5 text-ink/60">
          {valid
            ? "YOUR RESET LINK OPENS IN THE BORROWBUDDY APP, WHERE YOU CHOOSE THE NEW PASSWORD."
            : "THAT RESET LINK HAS EXPIRED OR WAS ALREADY USED. ASK FOR A NEW ONE FROM THE APP'S SIGN-IN SCREEN."}
        </p>
        <OpenAppReset href={href} auto={valid} />
      </AuthPanel>
    </AuthShell>
  );
}
