/**
 * Next.js instrumentation hook — runs once when the server process starts.
 *
 * We use it to resume BRUTHA Workers that were interrupted by a restart: any
 * job left 'running'/'queued' in the DB is re-queued and re-executed so
 * background work isn't silently lost across deploys/crashes.
 *
 * Guarded to the Node.js server runtime (not edge) since it touches SQLite.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { resumeOrphanedWorkers } = await import("./lib/workers");
    const n = resumeOrphanedWorkers();
    if (n > 0) console.log(`[workers] resumed ${n} orphaned worker(s) on boot`);
  } catch (e) {
    console.error("[workers] failed to resume orphaned workers:", e);
  }
}
