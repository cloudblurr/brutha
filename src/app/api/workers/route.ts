import { listWorkers, getWorker, createWorker } from "@/lib/workers";

export const runtime = "nodejs";

/**
 * BRUTHA Workers API for the UI panel.
 *
 * GET           -> list all workers (most recent first)
 * GET ?id=...   -> a single worker's full record (for polling)
 * POST {title,task} -> create a worker directly from the UI
 */

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const w = getWorker(id);
    if (!w) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(w);
  }
  return Response.json({ workers: listWorkers() });
}

export async function POST(req: Request) {
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
    task.trim()
  );
  return Response.json(w, { status: 201 });
}
