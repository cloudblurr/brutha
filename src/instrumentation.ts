/**
 * Next.js instrumentation hook — runs once when the server process starts.
 *
 * Background workers are now Supabase-native: a row inserted into public.workers
 * with status 'queued' fires a Postgres trigger (workers_dispatch) that invokes
 * the run-worker Edge Function over HTTP. Worker execution therefore lives in
 * Supabase, not in this Next.js process, so there is nothing to resume on boot —
 * a 'queued' row is picked up by the function independently of server restarts.
 *
 * The hook is kept (Next calls it automatically) as the place to wire future
 * server-start side effects.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // No-op: worker dispatch/resume is handled by Supabase (DB trigger ->
  // run-worker Edge Function). See supabase/migrations + supabase/functions.
}
