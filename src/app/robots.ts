import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/siteCopy";

// Read APP_URL when asked, not at build time, so the sitemap link carries the deployed address.
export const dynamic = "force-dynamic";

/** Only the public pages are for search engines: the app behind sign-in, the admin area and the API are not. */
const PRIVATE_PATHS = ["/admin", "/api", "/today", "/setup", "/chart", "/news", "/performance", "/bot", "/plans", "/settings", "/glossary", "/pay", "/locked", "/reset"];

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
    ...(origin ? { sitemap: `${origin}/sitemap.xml`, host: origin } : {}),
  };
}
