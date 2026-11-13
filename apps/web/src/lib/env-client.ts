/**
 * Browser-safe env access. Deliberately zod-free: the Supabase browser client
 * and storage URLs load on every app page, and validating three public
 * strings with zod pulled ~90 KB (gzipped) of schema runtime into each one.
 * Server-side env validation stays on zod in `env.ts`.
 */

export type ClientEnv = {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  NEXT_PUBLIC_APP_URL: string;
};

/** True when the public Supabase keys are present. Lets the app render
 *  (landing, login) before a Supabase project has been wired up. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

function requireUrl(name: string, value: string | undefined): string {
  try {
    if (value) {
      new URL(value);
      return value;
    }
  } catch {
    // fall through to the same message a missing value gets
  }
  throw new Error(`${name} must be a valid URL`);
}

/** Safe to call from the browser; only exposes NEXT_PUBLIC_* values. */
export function getClientEnv(): ClientEnv {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is required");
  return {
    NEXT_PUBLIC_SUPABASE_URL: requireUrl("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL
      ? requireUrl("NEXT_PUBLIC_APP_URL", process.env.NEXT_PUBLIC_APP_URL)
      : "http://localhost:3000",
  };
}
