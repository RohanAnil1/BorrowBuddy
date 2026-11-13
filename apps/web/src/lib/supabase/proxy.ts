import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getClientEnv, isSupabaseConfigured } from "@/lib/env-client";

/**
 * Refreshes the Supabase auth session on every matched request and returns
 * the signed-in user's id (if any) so the proxy can make routing decisions.
 */
export async function updateSession(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return { response: NextResponse.next({ request }), user: null };
  }

  let response = NextResponse.next({ request });
  const env = getClientEnv();

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getClaims() refreshes an expired session like getUser() did, but checks
  // the JWT against the project's cached ES256 signing keys locally instead
  // of asking the Auth server on every navigation. The proxy only routes on
  // "signed in or not"; pages still call getUser() (requireProfile) before
  // reading anything private, so revoked sessions are still caught there.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? { id: data.claims.sub } : null;

  return { response, user };
}
