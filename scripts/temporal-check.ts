/**
 * Temporal connectivity check.
 *
 * Verifies that the configured Temporal connection (Cloud or local) is
 * reachable and the namespace is usable, WITHOUT requiring a running worker.
 * It opens a client connection and issues a lightweight describe/list call.
 *
 * Run with:  npm run temporal:check
 *
 * Secrets: reads TEMPORAL_API_KEY from the environment only; nothing is logged
 * except a redacted connection summary.
 */
import { createTemporalClient, describeTemporalEnv } from "@/lib/temporal/client";

async function main() {
  const { client, connection, env } = await createTemporalClient();
  console.log(`[check] connected -> ${describeTemporalEnv(env)}`);

  try {
    // A cheap server round-trip that confirms auth + namespace work.
    const handle = client.workflow.getHandle("non-existent-workflow-id");
    try {
      await handle.describe();
      console.log("[check] describe() unexpectedly succeeded");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // A "not found" error means we reached the server and authenticated.
      if (/not found|NOT_FOUND|workflow execution/i.test(msg)) {
        console.log("[check] OK — server reachable and namespace authenticated.");
      } else {
        console.log(`[check] server responded with: ${msg}`);
      }
    }
  } finally {
    await connection.close();
  }
}

main().catch((err) => {
  console.error("[check] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
