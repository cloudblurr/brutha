import { headers } from "next/headers";

/**
 * Admin gate for tool-discovery surfaces (/admin/tools, /api/tools).
 *
 * These expose the full capability fingerprint of the deployment, so they
 * should not be world-readable in production. Behavior:
 *   - If ADMIN_SECRET is NOT set, access is open (preserves zero-config local
 *     dev — the page is still noindex and unlinked).
 *   - If ADMIN_SECRET IS set, the caller must present it via either the
 *     `x-admin-secret` header or an `?admin_key=` query param. Otherwise the
 *     surface behaves as if it does not exist (404), avoiding confirmation that
 *     an admin area is present.
 */

export function adminSecret(): string | undefined {
  const s = process.env.ADMIN_SECRET?.trim();
  return s && s.length > 0 ? s : undefined;
}

/** Constant-time-ish string compare to avoid trivial timing leaks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Check a Request (API routes) against the admin secret. */
export function isAdminRequest(req: Request): boolean {
  const secret = adminSecret();
  if (!secret) return true; // open when unconfigured
  const headerVal = req.headers.get("x-admin-secret");
  if (headerVal && safeEqual(headerVal, secret)) return true;
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("admin_key");
    if (q && safeEqual(q, secret)) return true;
  } catch {
    /* ignore malformed url */
  }
  return false;
}

/**
 * Check the incoming server-component request (via next/headers) for the admin
 * secret. Used by the /admin/tools page. Returns true when access is allowed.
 */
export async function isAdminContext(searchKey?: string): Promise<boolean> {
  const secret = adminSecret();
  if (!secret) return true;
  const h = await headers();
  const headerVal = h.get("x-admin-secret");
  if (headerVal && safeEqual(headerVal, secret)) return true;
  if (searchKey && safeEqual(searchKey, secret)) return true;
  return false;
}
