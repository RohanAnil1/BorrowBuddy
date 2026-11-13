import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    // This browser only; the default ("global") would also sign the student's phones out.
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Ignore — always bounce to the login screen.
  }
  // Relative Location keeps the redirect same-origin for fetch() callers.
  return new Response(null, { status: 303, headers: { Location: "/login" } });
}
