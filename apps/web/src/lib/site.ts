/** The site's public address. Everything a person or a search engine should see lives here. */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://borrowbuddy.online").replace(/\/$/, "");

/**
 * The old production address. Pages there redirect to SITE_URL; /api/* stays
 * reachable because installed Android builds still call it.
 */
export const LEGACY_HOST = "borrow-buddy-web.vercel.app";
