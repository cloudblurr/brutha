import { randomUUID } from "node:crypto";
import { getDb } from "./db";

/**
 * BRUTHA Workers — background agent jobs.
 *
 * A "worker" is a self-contained task the agent runs autonomously in the
 * background (e.g. "research X and summarize", "draft 5 subject lines"). The
 * user creates them via natural language; the agent calls the createWorker
 * tool, which enqueues a row and kicks off async execution.
 *
 * Execution model: this runs in-process (setImmediate) using the same agent
 * pipeline, non-streaming. It deliberately mirrors the shape that the existing
 * Temporal scaffolding (src/lib/temporal) could later back for true durability
 * — swap runTask's body for a Temporal workflow start and the rest is
 * unchanged.
 */

export interface Worker {
  id: string;
  scope: string;
  title: string;
  task: string;
  status: "queued" | "running" | "done" | "error";
  result: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export function createWorker(
  title: string,
  task: string,
  scope = "global"
): Worker {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO workers (id, scope, title, task, status)
       VALUES (?, ?, ?, ?, 'queued')`
    )
    .run(id, scope, title, task);
  // Kick off async execution without blocking the request.
  setImmediate(() => void runWorker(id));
  return getWorker(id)!;
}

export function getWorker(id: string): Worker | null {
  const row = getDb().prepare("SELECT * FROM workers WHERE id = ?").get(id);
  return (row as Worker) ?? null;
}

export function listWorkers(scope = "global", limit = 50): Worker[] {
  return getDb()
    .prepare(
      `SELECT * FROM workers WHERE scope = ? ORDER BY createdAt DESC LIMIT ?`
    )
    .all(scope, limit) as Worker[];
}

function setStatus(
  id: string,
  status: Worker["status"],
  fields: { result?: string; error?: string } = {}
) {
  getDb()
    .prepare(
      `UPDATE workers
       SET status = @status, result = COALESCE(@result, result),
           error = COALESCE(@error, error), updatedAt = datetime('now')
       WHERE id = @id`
    )
    .run({
      id,
      status,
      result: fields.result ?? null,
      error: fields.error ?? null,
    });
}

/** Execute a single worker task to completion, updating its status. */
export async function runWorker(id: string): Promise<void> {
  const w = getWorker(id);
  if (!w || w.status !== "queued") return;
  setStatus(id, "running");
  try {
    // Lazy import to avoid a circular dependency
    // (agent -> tool-registry -> tools/workers -> workers -> agent).
    const { runAgentFromUIMessages } = await import("./agent");
    const { text } = await runAgentFromUIMessages([
      {
        id: randomUUID(),
        role: "user",
        parts: [{ type: "text", text: w.task }],
      },
    ]);
    setStatus(id, "done", { result: text });
  } catch (e) {
    setStatus(id, "error", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
