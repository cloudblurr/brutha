import { randomUUID } from "node:crypto";
import type { ModelMessage } from "ai";
import { createTemporalClient } from "./client";
import { getTemporalEnv } from "./env";
import { agentWorkflow } from "./workflows";
import type { RunAgentOutput } from "./activities";
import type { AgentConfig } from "@/lib/agent";

/**
 * Whether the durable (Temporal) execution path should be used.
 *
 * Enabled when EITHER:
 *  - a Temporal Cloud API key is configured (TEMPORAL_API_KEY), or
 *  - an explicit address is set (TEMPORAL_ADDRESS), or
 *  - durable mode is forced on for local dev (AGENT_DURABLE=1).
 *
 * Otherwise the app uses the default streaming path with no Temporal
 * dependency, so it still runs out-of-the-box without a Temporal server.
 */
export function isTemporalEnabled(): boolean {
  if (process.env.AGENT_DURABLE === "1") return true;
  if (process.env.AGENT_DURABLE === "0") return false;
  return Boolean(
    process.env.TEMPORAL_API_KEY?.trim() ||
      process.env.TEMPORAL_ADDRESS?.trim()
  );
}

export interface DurableAgentResult extends RunAgentOutput {
  workflowId: string;
}

/**
 * Run the agent as a durable Temporal workflow and await its final result.
 *
 * Opens a short-lived client connection, starts `agentWorkflow` on the
 * configured task queue, waits for completion, then closes the connection.
 * The heavy lifting (Grok calls + tools) happens in the worker's activity.
 */
export async function runDurableAgent(
  messages: ModelMessage[],
  overrides?: Partial<AgentConfig>
): Promise<DurableAgentResult> {
  const { client, connection, env } = await createTemporalClient();
  const workflowId = `brutha-agent-${randomUUID()}`;

  try {
    const handle = await client.workflow.start(agentWorkflow, {
      args: [{ messages, overrides }],
      taskQueue: env.taskQueue,
      workflowId,
      // Bound the total durable run so a stuck workflow cannot hang forever.
      workflowExecutionTimeout: "10 minutes",
    });

    const result = await handle.result();
    return { ...result, workflowId };
  } finally {
    await connection.close();
  }
}

export { getTemporalEnv };
