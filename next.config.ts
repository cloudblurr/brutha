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

// Supabase project origin (for connect-src: REST, Realtime WS, Storage). Falls
// back to allowing all https/wss if not set at build time so the app still works.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseOrigin = (() => {
  try {
    return supabaseUrl ? new URL(supabaseUrl).origin : "";
  } catch {
    return "";
  }
})();
const supabaseWs = supabaseOrigin.replace(/^http/, "ws");
const connectSrc = ["'self'", supabaseOrigin, supabaseWs]
  .filter(Boolean)
  .join(" ");

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Allow images served from Supabase Storage signed URLs.
  `img-src 'self' data: blob: ${supabaseOrigin}`.trim(),
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
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
  // Native / server-only modules must not be bundled; keep them external so they
  // load via Node's require at runtime.
  serverExternalPackages: ["nodemailer"],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
