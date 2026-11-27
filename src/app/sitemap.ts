import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/siteCopy";

export const dynamic = "force-dynamic";

/** The pages anyone can open: the landing page, sign-in, registration, the VPS guide and the legal texts. */
const PUBLIC_PATHS = ["/", "/register", "/login", "/guide/vps", "/privacy", "/terms"];

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin() ?? "http://localhost:3000";
  return PUBLIC_PATHS.map((path) => ({
    url: `${origin}${path === "/" ? "" : path}`,
    changeFrequency: path === "/" ? "daily" : "monthly",
    priority: path === "/" ? 1 : path === "/register" ? 0.8 : 0.4,
  }));
}
