import type { MetadataRoute } from "next";

/** Lets phones add the site to the home screen as an app (and, on iPhone, is what allows push there). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/today",
    name: "XAU Analytics",
    short_name: "XAU",
    description: "Gold (XAUUSD) direction, setups, news and alerts.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0a09",
    theme_color: "#0b0a09",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
