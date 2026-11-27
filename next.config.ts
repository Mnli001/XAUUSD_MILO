import type { NextConfig } from "next";

/**
 * Sent with every response. No script CSP on purpose: Next.js inlines bootstrap scripts, and a nonce-based policy
 * would need a proxy and dynamic rendering everywhere. The CSP here only carries directives that cannot break
 * scripts: nobody may frame the site (clickjacking), no plugins, no <base> rewriting.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" }, // ignored by browsers on plain-http localhost
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "@resvg/resvg-js", "web-push"],
  // Server Actions keep Next's default 1 MB body limit: no action takes a file upload any more.
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // the service worker must always be fetched fresh, so a fix reaches every installed app at once
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Content-Type", value: "application/javascript; charset=utf-8" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
