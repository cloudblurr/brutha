import { currentDb } from "./scope";

/**
 * BRUTHA Workers — background agent jobs, backed by Supabase.
 *
 * A "worker" is a self-contained task the agent runs autonomously in the
 * background. Creating one simply INSERTs a row into public.workers with status
 * 'queued'; a Postgres trigger (see migrations) then invokes the `run-worker`
 * Edge Function over HTTP, which executes the agent and writes the result back.
 * The UI subscribes to row changes via Supabase Realtime for live updates.
 *
 * This replaces the old Temporal + in-process setImmediate machinery, which
 * required a long-running worker process and could not run on Vercel.
 *
 * Per-user isolation is enforced by Row Level Security on public.workers.
 */

export interface Worker {
  id: string;
  owner: string;
  title: string;
  task: string;
  status: "queued" | "running" | "done" | "error";
  result: string | null;
  error: string | null;
  progress: string | null;
  created_at: string;
  updated_at: string;
}

/** Create (queue) a worker owned by the current user. Returns the new row. */
export async function createWorker(
  title: string,
  task: string
): Promise<Worker> {
  const { data, error } = await currentDb()
    .from("workers")
    .insert({ title, task })
    .select("*")
    .single();
  if (error) throw error;
  return data as Worker;
}

/** Fetch a single worker by id (RLS scopes it to the owner). */
export async function getWorker(id: string): Promise<Worker | null> {
  const { data, error } = await currentDb()
    .from("workers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  return (data as Worker) ?? null;
}

/** List the current user's workers, most recent first. */
export async function listWorkers(limit = 50): Promise<Worker[]> {
  const { data, error } = await currentDb()
    .from("workers")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as Worker[]) ?? [];
}
