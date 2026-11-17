import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Only the public pages are worth indexing; everything else needs a login. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/signup", "/login"],
        disallow: ["/api/", "/auth/", "/admin", "/home", "/dashboard", "/items", "/loans", "/chat", "/me", "/my", "/users", "/campus", "/map", "/notifications", "/onboarding", "/pending", "/reset-password", "/forgot-password"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
