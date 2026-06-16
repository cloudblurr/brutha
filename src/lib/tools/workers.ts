import { tool } from "ai";
import { z } from "zod";
import { currentDb } from "../scope";

/**
 * Worker tools — background agent jobs, backed by the Supabase `workers` table.
 *
 * Creating a worker simply INSERTs a row (status 'queued'). A Postgres trigger
 * (`workers_dispatch`, see migrations) then calls the `run-worker` Edge Function
 * over HTTP, which executes the agent loop and writes status/result/progress
 * back using the service-role key. The UI subscribes to changes via Realtime.
 *
 * This replaces the old Temporal + in-process worker store. Per-user isolation
 * is enforced by Row Level Security: the request-scoped Supabase client
 * (`currentDb()`) carries the user's JWT, so a user can only ever see, create,
 * or delete their own workers.
 */

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export const workerTools = {
  createWorker: tool({
    description:
      "Spawn a BRUTHA Worker to handle a task 'in the background'. Use when the user explicitly wants something done in the background or asynchronously. Returns the worker id; the user can check back for the result later (it does not block).",
    inputSchema: z.object({
      task: z.string().describe("What the background worker should do."),
      title: z
        .string()
        .optional()
        .describe("Short label for the worker (defaults to the task text)."),
    }),
    execute: async ({ task, title }) => {
      try {
        const trimmed = task.trim();
        if (!trimmed) return { error: "Provide a non-empty task." };
        const { data, error } = await currentDb()
          .from("workers")
          .insert({
            title: (title?.trim() || trimmed).slice(0, 80),
            task: trimmed,
            status: "queued",
          })
          .select("id, title, status")
          .single();
        if (error) throw error;
        return {
          spawned: true,
          id: data.id,
          title: data.title,
          status: data.status,
          note: "Worker queued. It runs in the background; check back with listWorkers or getWorkerResult.",
        };
      } catch (e) {
        return { error: `Failed to spawn worker: ${errMsg(e)}` };
      }
    },
  }),

  listWorkers: tool({
    description:
      "List the user's background workers and their statuses (queued/running/done/error), most recent first.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const { data, error } = await currentDb()
          .from("workers")
          .select("id, title, status, progress, created_at")
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        return { count: data.length, workers: data };
      } catch (e) {
        return { error: `Failed to list workers: ${errMsg(e)}` };
      }
    },
  }),

  getWorkerResult: tool({
    description:
      "Fetch a single background worker's full record by id — its status and, when finished, its result or error.",
    inputSchema: z.object({ id: z.string().describe("The worker id (uuid).") }),
    execute: async ({ id }) => {
      try {
        const { data, error } = await currentDb()
          .from("workers")
          .select("id, title, task, status, result, error, progress, created_at, updated_at")
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;
        if (!data) return { error: `No worker with id ${id}.` };
        return { worker: data };
      } catch (e) {
        return { error: `Failed to get worker: ${errMsg(e)}` };
      }
    },
  }),

  deleteWorker: tool({
    description: "Delete a background worker by id.",
    inputSchema: z.object({ id: z.string() }),
    execute: async ({ id }) => {
      try {
        const { data, error } = await currentDb()
          .from("workers")
          .delete()
          .eq("id", id)
          .select("id");
        if (error) throw error;
        return data.length
          ? { deleted: true, id }
          : { error: `No worker with id ${id}.` };
      } catch (e) {
        return { error: `Failed to delete worker: ${errMsg(e)}` };
      }
    },
  }),
};
