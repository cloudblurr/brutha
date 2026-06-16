import { saveSubscription, type BrowserSubscription } from "@/lib/push";
import { resolveRequestScope } from "@/lib/request-scope";
import { runWithScope } from "@/lib/scope";

export const runtime = "nodejs";

/**
 * POST /api/push/subscribe
 * Body: a browser PushSubscription JSON ({ endpoint, keys: { p256dh, auth } }).
 * Stores it against the signed-in user so notifications reach their devices.
 */
export async function POST(req: Request) {
  const scope = await resolveRequestScope();
  let body: BrowserSubscription;
  try {
    body = (await req.json()) as BrowserSubscription;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    return Response.json(
      { error: "Invalid subscription: endpoint and keys (p256dh, auth) required." },
      { status: 400 }
    );
  }
  try {
    runWithScope(scope, () =>
      saveSubscription(body, req.headers.get("user-agent"))
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to save subscription." },
      { status: 400 }
    );
  }
  return Response.json({ ok: true }, { status: 201 });
}
