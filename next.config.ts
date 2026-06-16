import type { NextConfig } from "next";

/**
 * Content-Security-Policy and related security headers (S6).
 *
 * Notes:
 *  - `'unsafe-inline'` is required for Next.js's injected hydration styles and
 *    the app's CSS-variable inline styles. `'unsafe-eval'` is only needed in
 *    development (React refresh / Turbopack), so it is added conditionally.
 *  - All external API calls made by tools happen server-side, so the browser's
 *    connect-src only needs 'self'.
 */
const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  // Produce a standalone server bundle for small Docker images (S17).
  output: "standalone",

  // Native / server-only modules must not be bundled by Turbopack; keep them
  // external so they load via Node's require at runtime.
  serverExternalPackages: ["better-sqlite3", "nodemailer"],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Allow the service worker to control the whole origin and never be
        // cached stale (the SW updates itself; the file itself must be fresh).
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Content-Type", value: "application/manifest+json" },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
    ];
  },
};

export default nextConfig;
