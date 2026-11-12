import { AsyncLocalStorage } from "node:async_hooks";
import { createServerClient } from "@supabase/ssr";
import { createClient as createTokenClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getClientEnv } from "@/lib/env";

/**
 * Native clients (the Android app) call API routes with a Supabase access
 * token instead of cookies. A route runs its work inside `withBearerToken`, and
 * every createClient() in that scope (including the shared data layer) talks to
 * Postgres as that user, so RLS applies exactly as it does on the web.
 */
const bearerScope = new AsyncLocalStorage<string>();

export function withBearerToken<T>(token: string, run: () => T): T {
  return bearerScope.run(token, run);
}

export function tokenClient(token: string) {
  const env = getClientEnv();
  return createTokenClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function createClient() {
  const token = bearerScope.getStore();
  if (token) return tokenClient(token) as unknown as Awaited<ReturnType<typeof cookieClient>>;
  return cookieClient();
}

async function cookieClient() {
  const cookieStore = await cookies();
  const env = getClientEnv();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, the proxy refreshes sessions instead.
        }
      },
    },
  });
}
