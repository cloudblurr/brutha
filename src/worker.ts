import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "@/lib/temporal/activities";
import { getTemporalEnv, describeTemporalEnv } from "@/lib/temporal/env";

/**
 * BRUTHA durable-execution worker.
 *
 * Polls the configured task queue, runs `agentWorkflow` (in the deterministic
 * workflow sandbox) and executes `runAgentActivity` (the actual Grok agent
 * loop) in this Node.js process. Connects to Temporal Cloud when
 * TEMPORAL_API_KEY is set, otherwise to a local dev server.
 *
 * Run with:  npm run worker
 */
async function run() {
  const env = getTemporalEnv();
  console.log(`[worker] connecting -> ${describeTemporalEnv(env)}`);

  const connection = await NativeConnection.connect({
    address: env.address,
    tls: env.tls,
    apiKey: env.apiKey,
  });

  try {
    const worker = await Worker.create({
      connection,
      namespace: env.namespace,
      taskQueue: env.taskQueue,
      // Point the bundler at the workflows module. Workflows are bundled and
      // run in an isolated sandbox, so this path must export the workflow fns.
      workflowsPath: require.resolve("@/lib/temporal/workflows"),
      activities,
    });

    console.log(
      `[worker] ready. namespace=${env.namespace} taskQueue=${env.taskQueue}`
    );
    await worker.run();
  } finally {
    await connection.close();
  }
}

run().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
