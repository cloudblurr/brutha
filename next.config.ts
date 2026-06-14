import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / server-only modules must not be bundled by Turbopack; keep them
  // external so they load via Node's require at runtime.
  serverExternalPackages: ["better-sqlite3", "nodemailer"],
};

export default nextConfig;
