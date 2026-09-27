import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Ignore — always bounce to the login screen.
  }
  // Relative Location keeps the redirect same-origin for fetch() callers.
  return new Response(null, { status: 303, headers: { Location: "/login" } });
}
