import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const TYPES: EmailOtpType[] = ["email", "signup"];

/** Only same-site paths, defaulting to onboarding. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = String(value ?? "").trim();
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/onboarding";
}

/**
 * Redeems a sign-up confirmation link's token. Reached by POST only (the
 * /auth/confirm page submits it), so mail scanners that fetch links can't
 * use the one-time token up before the student clicks it.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const tokenHash = String(form.get("token_hash") ?? "");
  const type = String(form.get("type") ?? "") as EmailOtpType;
  const next = safeNext(form.get("next"));

  let confirmed = false;
  if (tokenHash && TYPES.includes(type)) {
    try {
      const supabase = await createClient();
      confirmed = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
    } catch {
      confirmed = false;
    }
  }

  // Relative Location keeps the redirect on this site.
  return new Response(null, {
    status: 303,
    headers: { Location: confirmed ? next : "/login?error=confirm" },
  });
}
