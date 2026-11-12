/**
 * Public liveness probe for the offline page and the Android offline gate.
 * Reaching this handler proves the web app is up (`app`); `data` reports
 * whether Supabase answered its own health check within a short deadline.
 * No auth, no user data, never cached.
 */
const DATA_TIMEOUT_MS = 3000;

async function dataServiceReachable(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;
  try {
    const response = await fetch(`${url.replace(/\/+$/, "")}/auth/v1/health`, {
      headers: { apikey: key },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(DATA_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const data = await dataServiceReachable();
  return Response.json(
    { app: true, data },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
