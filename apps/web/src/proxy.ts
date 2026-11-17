import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { LEGACY_HOST, SITE_URL } from "@/lib/site";

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  // Reached from the reset email; the page itself checks for the reset session.
  "/reset-password",
  "/auth",
  "/about",
  "/offline",
  "/offline.html",
  "/offline-assets",
  "/manifest.webmanifest",
];

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export async function proxy(request: NextRequest) {
  // One address for everyone: www goes to the bare domain.
  if (request.headers.get("host") === `www.${new URL(SITE_URL).host}`) {
    return NextResponse.redirect(`${SITE_URL}${request.nextUrl.pathname}${request.nextUrl.search}`, 308);
  }
  // The old vercel.app address sends people (and search engines) to the real domain.
  // API calls are left alone: installed Android builds still use that address.
  if (
    request.headers.get("host") === LEGACY_HOST &&
    (request.method === "GET" || request.method === "HEAD") &&
    !request.nextUrl.pathname.startsWith("/api/") &&
    // Sign-in links already started here finish here (their cookies live on this host).
    !request.nextUrl.pathname.startsWith("/auth/")
  ) {
    return NextResponse.redirect(`${SITE_URL}${request.nextUrl.pathname}${request.nextUrl.search}`, 308);
  }

  // Connection probes must answer without a session refresh round-trip to Supabase.
  if (
    request.nextUrl.pathname === "/offline.html" ||
    request.nextUrl.pathname.startsWith("/offline-assets/") ||
    request.nextUrl.pathname === "/api/health"
  ) {
    return NextResponse.next();
  }
  const { response, user } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  // Native apps send a Supabase access token; the route itself verifies it.
  if (pathname.startsWith("/api/") && /^Bearer\s+\S+/i.test(request.headers.get("authorization") ?? "")) {
    return NextResponse.next();
  }

  if (!user && pathname.startsWith("/api/")) {
    // API callers (Buddy) need a status code, not a login page.
    return NextResponse.json({ error: "Sign in first.", code: "unauthenticated" }, { status: 401 });
  }

  if (!user && !isPublicRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|webmanifest|js|woff2?)$).*)",
  ],
};
