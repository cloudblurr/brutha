import { proxyActivities, defineQuery, setHandler } from "@temporalio/workflow";
import type {
  RunAgentInput,
  RunAgentOutput,
} from "./activities";

/**
 * Workflow-side proxy for the agent activity.
 *
 * Retry + timeout policy gives us the durable-execution guarantees: if the
 * worker crashes mid-run, or the activity throws transiently (e.g. a network
 * blip calling the Grok API), Temporal retries the activity without losing the
 * conversation. The workflow itself is deterministic and replay-safe because it
 * does no I/O — all side effects live in the activity.
 */
const { runAgentActivity } = proxyActivities<{
  runAgentActivity(input: RunAgentInput): Promise<RunAgentOutput>;
}>({
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "2s",
    backoffCoefficient: 2,
    maximumInterval: "30s",
    maximumAttempts: 4,
  },
});

/** Query to inspect the latest result while/after the workflow runs. */
export const getResultQuery = defineQuery<RunAgentOutput | null>("getResult");

/**
 * Durable agent workflow.
 *
 * Drives one full agent run (model + tool loop) as a durable Temporal
 * execution. The actual reasoning/tool work happens inside `runAgentActivity`;
 * the workflow orchestrates it and exposes the result via a query.
 */
export async function agentWorkflow(
  input: RunAgentInput
): Promise<RunAgentOutput> {
  let latest: RunAgentOutput | null = null;
  setHandler(getResultQuery, () => latest);

  const result = await runAgentActivity(input);
  latest = result;
  return result;
}
