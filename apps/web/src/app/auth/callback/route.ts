import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["recovery", "signup", "invite", "magiclink", "email_change", "email"];

/** Only same-site paths: "/reset-password" yes, "//evil.example" or "https://…" no. */
function safeNext(value: string | null): string {
  const next = (value ?? "").trim();
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/home";
}

/**
 * Where Supabase email links land. Two link formats are accepted:
 * - `?code=` (Supabase's default): exchanged with the code verifier cookie,
 *   so it works in the browser that asked for the email;
 * - `?token_hash=&type=` (a customised email template): verified directly,
 *   so it works on any device.
 * A failed reset link goes back to /forgot-password to ask for a fresh one.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // A reset the Android app asked for: only the app holds the code verifier,
  // so hand the code over untouched (useless to anyone without that verifier).
  if (searchParams.get("app") === "reset") {
    return NextResponse.redirect(
      code ? `${origin}/auth/app-reset?code=${encodeURIComponent(code)}` : `${origin}/auth/app-reset?error=link`,
    );
  }

  let signedIn = false;
  try {
    const supabase = await createClient();
    if (tokenHash && type && OTP_TYPES.includes(type)) {
      signedIn = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
    } else if (code) {
      signedIn = !(await supabase.auth.exchangeCodeForSession(code)).error;
    }
  } catch {
    signedIn = false;
  }

  if (signedIn) return NextResponse.redirect(`${origin}${next}`);

  const isReset = next === "/reset-password" || type === "recovery";
  return NextResponse.redirect(isReset ? `${origin}/forgot-password?error=link` : `${origin}/login?error=auth`);
}
