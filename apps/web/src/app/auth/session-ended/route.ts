import { createClient } from "@/lib/supabase/server";

/**
 * Where a browser lands when its sign-in no longer works (the account's
 * profile was deleted). Clears this browser's sign-in, then asks for a fresh one.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // The cookie may already be unusable; the login page still loads.
  }
  return new Response(null, { status: 303, headers: { Location: "/login?ended=1" } });
}
