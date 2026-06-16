import { removeSubscription } from "@/lib/push";

export const runtime = "nodejs";

/**
 * POST /api/push/unsubscribe
 * Body: { endpoint }. Removes a stored subscription (e.g. user disabled
 * notifications or the browser rotated the subscription).
 */
export async function POST(req: Request) {
  let body: { endpoint?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.endpoint !== "string" || !body.endpoint) {
    return Response.json({ error: "Provide an 'endpoint'." }, { status: 400 });
  }
  removeSubscription(body.endpoint);
  return Response.json({ ok: true });
}
