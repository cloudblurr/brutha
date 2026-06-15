import { listWorkers, getWorker, createWorker } from "@/lib/workers";
import { resolveRequestScope } from "@/lib/request-scope";

export const runtime = "nodejs";

/**
 * BRUTHA Workers API for the UI panel. All operations are scoped to the
 * signed-in user (or the "global" fallback when unauthenticated).
 *
 * GET           -> list the user's workers (most recent first)
 * GET ?id=...   -> a single worker's full record (for polling), if owned
 * POST {title,task} -> create a worker owned by the current user
 */

export async function GET(req: Request) {
  const scope = await resolveRequestScope();
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const w = getWorker(id);
    if (!w || w.scope !== scope) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json(w);
  }
  return Response.json({ workers: listWorkers(scope) });
}

export async function POST(req: Request) {
  const scope = await resolveRequestScope();
  let body: { title?: unknown; task?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { title, task } = body;
  if (typeof task !== "string" || !task.trim()) {
    return Response.json({ error: "Provide a non-empty 'task'." }, { status: 400 });
  }
  const w = createWorker(
    typeof title === "string" && title.trim() ? title.trim() : task.slice(0, 40),
    task.trim(),
    scope
  );
  return Response.json(w, { status: 201 });
}
