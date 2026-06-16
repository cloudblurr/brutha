import { withRequestContext } from "@/lib/request-scope";

export const runtime = "nodejs";

/**
 * BRUTHA Workers API for the UI panel. All operations are scoped to the
 * signed-in user via Supabase Row Level Security (the request-bound client
 * carries the user's JWT). Unauthenticated requests get 401.
 *
 * GET           -> list the user's workers (most recent first)
 * GET ?id=...   -> a single worker's full record (for polling), if owned
 * POST {title,task} -> create a worker owned by the current user
 *
 * Creating a worker inserts a 'queued' row; a Postgres trigger dispatches the
 * run-worker Edge Function which executes it and writes the result back.
 */

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");

  const { userId, value } = await withRequestContext(async ({ db }) => {
    if (id) {
      const { data, error } = await db
        .from("workers")
        .select(
          "id, title, task, status, result, error, progress, created_at, updated_at"
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return { kind: "one" as const, worker: data };
    }
    const { data, error } = await db
      .from("workers")
      .select("id, title, task, status, result, error, progress, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return { kind: "list" as const, workers: data };
  });

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (value?.kind === "one") {
    if (!value.worker) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json(value.worker);
  }
  return Response.json({ workers: value?.workers ?? [] });
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
  const cleanTask = task.trim();
  const cleanTitle =
    typeof title === "string" && title.trim() ? title.trim() : cleanTask.slice(0, 40);

  const { userId, value } = await withRequestContext(async ({ db }) => {
    const { data, error } = await db
      .from("workers")
      .insert({ title: cleanTitle, task: cleanTask, status: "queued" })
      .select("id, title, task, status, created_at")
      .single();
    if (error) throw error;
    return data;
  });

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(value, { status: 201 });
}
