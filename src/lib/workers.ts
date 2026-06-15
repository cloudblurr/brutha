import { randomUUID } from "node:crypto";
import type { UIMessage } from "ai";
import { getDb } from "./db";
import { runWithScope, normalizeScope } from "./scope";
import { isTemporalEnabled, runDurableAgent } from "./temporal/run";

/**
 * BRUTHA Workers — background agent jobs (per-user scoped + durable).
 *
 * A "worker" is a self-contained task the agent runs autonomously in the
 * background. Workers are owned by the user who created them (the `scope`
 * column) and only surfaced to that user.
 *
 * Durability:
 *  - When Temporal is enabled (see isTemporalEnabled), the task runs as a
 *    durable Temporal workflow: it survives process restarts and gets
 *    Temporal's automatic activity retries. We persist the workflowId so the
 *    job can be reconciled later.
 *  - Otherwise it falls back to in-process execution (setImmediate). To make
 *    even the fallback robust, any worker left in 'running' when the process
 *    exits is re-queued and resumed on next boot (see resumeOrphanedWorkers).
 */

export interface Worker {
  id: string;
  scope: string;
  title: string;
  task: string;
  status: "queued" | "running" | "done" | "error";
  result: string | null;
  error: string | null;
  progress: string | null;
  workflowId: string | null;
  durable: number;
  createdAt: string;
  updatedAt: string;
}

export function createWorker(
  title: string,
  task: string,
  scope = "global"
): Worker {
  const id = randomUUID();
  const durable = isTemporalEnabled() ? 1 : 0;
  getDb()
    .prepare(
      `INSERT INTO workers (id, scope, title, task, status, durable)
       VALUES (?, ?, ?, ?, 'queued', ?)`
    )
    .run(id, normalizeScope(scope), title, task, durable);
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
    .all(normalizeScope(scope), limit) as Worker[];
}

function setStatus(
  id: string,
  status: Worker["status"],
  fields: { result?: string; error?: string; workflowId?: string } = {}
) {
  getDb()
    .prepare(
      `UPDATE workers
       SET status = @status,
           result = COALESCE(@result, result),
           error = COALESCE(@error, error),
           workflowId = COALESCE(@workflowId, workflowId),
           updatedAt = datetime('now')
       WHERE id = @id`
    )
    .run({
      id,
      status,
      result: fields.result ?? null,
      error: fields.error ?? null,
      workflowId: fields.workflowId ?? null,
    });
}

/** Execute a single worker task to completion, updating its status. */
export async function runWorker(id: string): Promise<void> {
  const w = getWorker(id);
  if (!w || w.status !== "queued") return;
  setStatus(id, "running");
  setProgress(id, "Starting…");

  // Bind the creator's data scope so the background agent's tools (contacts,
  // notes, tasks) read/write the right user's data — not the global scope.
  await runWithScope(w.scope, async () => {
    try {
      if (isTemporalEnabled()) {
        await runDurableWorker(w);
      } else {
        await runInProcessWorker(w);
      }
    } catch (e) {
      setStatus(id, "error", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });
}

/**
 * Durable path: run the task as a Temporal workflow. The workflow id is
 * persisted immediately so a restart mid-run can reconcile the result.
 */
async function runDurableWorker(w: Worker): Promise<void> {
  const { convertToModelMessages } = await import("ai");
  const uiMessages: UIMessage[] = [
    { id: randomUUID(), role: "user", parts: [{ type: "text", text: w.task }] },
  ];
  const messages = await convertToModelMessages(uiMessages);
  const result = await runDurableAgent(messages);
  setStatus(w.id, "done", {
    result: result.text,
    workflowId: result.workflowId,
  });
}

/** Set a live progress line on a running worker (best-effort). */
function setProgress(id: string, progress: string) {
  try {
    getDb()
      .prepare(
        `UPDATE workers SET progress = ?, updatedAt = datetime('now') WHERE id = ?`
      )
      .run(progress, id);
  } catch {
    /* progress is non-critical */
  }
}

/** In-process fallback path. */
async function runInProcessWorker(w: Worker): Promise<void> {
  // Lazy import to avoid a circular dependency
  // (agent -> tool-registry -> tools/workers -> workers -> agent).
  const { runAgentFromUIMessages } = await import("./agent");
  const { text } = await runAgentFromUIMessages(
    [
      {
        id: randomUUID(),
        role: "user",
        parts: [{ type: "text", text: w.task }],
      },
    ],
    {},
    (label) => setProgress(w.id, label)
  );
  setStatus(w.id, "done", { result: text });
}

/**
 * Resume workers that were interrupted by a process restart.
 *
 * Any worker still marked 'running' (or stuck 'queued') when the server boots
 * is presumed orphaned — its in-process execution died with the old process.
 * We re-queue and restart them so background work is not silently lost. Called
 * once at server startup (see instrumentation.ts).
 */
export function resumeOrphanedWorkers(): number {
  const db = getDb();
  const orphans = db
    .prepare(
      `SELECT id FROM workers WHERE status IN ('running', 'queued') ORDER BY createdAt`
    )
    .all() as { id: string }[];
  for (const { id } of orphans) {
    db.prepare(
      `UPDATE workers SET status = 'queued', updatedAt = datetime('now') WHERE id = ?`
    ).run(id);
    setImmediate(() => void runWorker(id));
  }
  return orphans.length;
}
