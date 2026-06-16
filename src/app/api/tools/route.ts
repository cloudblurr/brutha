import { getToolManifest } from "@/lib/tool-registry";
import { isAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";

/**
 * Tool discovery manifest (S8). Serves a JSON list of all registered tool
 * names grouped by category. Consumed by the /admin/tools page and useful for
 * contributors/automation.
 *
 * Gated by ADMIN_SECRET when configured (see lib/admin-auth): without the
 * secret the endpoint returns 404 so the capability surface isn't exposed in
 * production. Open when ADMIN_SECRET is unset (local dev).
 */
export async function GET(req: Request) {
  if (!isAdminRequest(req)) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(JSON.stringify(getToolManifest(), null, 2), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
