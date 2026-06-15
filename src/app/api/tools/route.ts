import { getToolManifest } from "@/lib/tool-registry";

export const runtime = "nodejs";

/**
 * Tool discovery manifest (S8). Serves a JSON list of all registered tool
 * names grouped by category. Consumed by the /admin/tools page and useful for
 * contributors/automation.
 */
export async function GET() {
  return new Response(JSON.stringify(getToolManifest(), null, 2), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
