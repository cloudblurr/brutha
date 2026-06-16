import { getPushPublicKey, isPushConfigured } from "@/lib/push";

export const runtime = "nodejs";

/**
 * GET /api/push/public-key
 * Returns the VAPID public key the browser needs to call
 * pushManager.subscribe(), plus whether push is configured at all. Safe to
 * expose: the public key is meant to be public.
 */
export async function GET() {
  return Response.json({
    configured: isPushConfigured(),
    publicKey: getPushPublicKey(),
  });
}
