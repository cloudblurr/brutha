import { tool } from "ai";
import { z } from "zod";
import { createWorker, listWorkers, getWorker } from "../workers";

/**
 * BRUTHA Workers tools. Let the agent spawn and inspect background agent jobs
 * in response to natural-language requests like "in the background, research X
 * and write me a summary". Gated behind the `workers` feature flag (agent.ts).
 */
export const workerTools = {
  createWorker: tool({
    description:
      "Spawn a BRUTHA Worker: a background task that runs autonomously and produces a result the user can check later. Use when the user asks to do something 'in the background', 'as a worker', or a long task they don't want to wait for. Returns the worker id.",
    inputSchema: z.object({
      title: z.string().describe("Short human-friendly title for the task."),
      task: z
        .string()
        .describe("The full, self-contained instruction the background agent should carry out."),
    }),
    execute: async ({ title, task }) => {
      try {
        const w = createWorker(title, task);
        return { spawned: true, id: w.id, title: w.title, status: w.status };
      } catch (e) {
        return { error: `Failed to spawn worker: ${e instanceof Error ? e.message : String(e)}` };
      }
    },
  }),

  listWorkers: tool({
    description: "List the user's BRUTHA Workers (background tasks) and their statuses.",
    inputSchema: z.object({}),
    execute: async () => {
      const workers = listWorkers().map((w) => ({
        id: w.id,
        title: w.title,
        status: w.status,
        createdAt: w.createdAt,
      }));
      return { workers, count: workers.length };
    },
  }),

  getWorkerResult: tool({
    description: "Get the result/status of a specific BRUTHA Worker by id.",
    inputSchema: z.object({ id: z.string() }),
    execute: async ({ id }) => {
      const w = getWorker(id);
      if (!w) return { error: `No worker with id ${id}` };
      return { id: w.id, title: w.title, status: w.status, result: w.result, error: w.error };
    },
  }),
};
