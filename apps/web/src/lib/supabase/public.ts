import { createClient } from "@supabase/supabase-js";
import { getClientEnv } from "@/lib/env";

/**
 * Cookie-less anonymous client for public, cacheable reads (the landing page).
 * Session-less by design so pages that use it can stay statically rendered.
 */
export function createPublicClient() {
  const env = getClientEnv();

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
