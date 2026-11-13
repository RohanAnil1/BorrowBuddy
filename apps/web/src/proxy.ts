import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/signup",
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
