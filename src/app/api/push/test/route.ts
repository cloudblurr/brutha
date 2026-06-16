import { sendPushToScope, isPushConfigured } from "@/lib/push";
import { resolveRequestScope } from "@/lib/request-scope";
import { runWithScope } from "@/lib/scope";

export const runtime = "nodejs";

/**
 * POST /api/push/test
 * Fires a test notification to all of the current user's subscribed devices.
 * Handy for verifying the end-to-end push pipeline from the Settings UI.
 */
export async function POST() {
  if (!isPushConfigured()) {
    return Response.json(
      { error: "Push is not configured (set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)." },
      { status: 503 }
    );
  }
  const scope = await resolveRequestScope();
  const results = await runWithScope(scope, () =>
    sendPushToScope({
      title: "BRUTHA",
      body: "Push notifications are working 🎉",
      url: "/",
      tag: "brutha-test",
    })
  );
  const sent = results.filter((r) => r.ok).length;
  return Response.json({ ok: true, devices: results.length, sent, results });
}
