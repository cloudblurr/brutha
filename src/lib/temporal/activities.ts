import { log } from "@temporalio/activity";
import type { ModelMessage } from "ai";
import {
  runAgentToCompletion,
  type AgentConfig,
} from "@/lib/agent";

/**
 * Input for the agent activity. Messages are already converted to plain
 * ModelMessage objects (serializable) by the workflow's caller.
 */
export interface RunAgentInput {
  messages: ModelMessage[];
  overrides?: Partial<AgentConfig>;
}

export interface RunAgentOutput {
  text: string;
  config: AgentConfig;
  steps: number;
  hitStepLimit: boolean;
}

/**
 * Temporal activity that runs the agent loop to completion.
 *
 * This executes OUTSIDE the workflow sandbox (in the regular Node.js worker),
 * so it has full access to the network, SQLite, and the AI SDK. Because it is
 * an activity, Temporal records its result durably and can retry it on
 * transient failure per the workflow's retry policy.
 */
export async function runAgentActivity(
  input: RunAgentInput
): Promise<RunAgentOutput> {
  const { messages, overrides } = input;
  log.info("runAgentActivity: starting agent loop", {
    messageCount: messages.length,
    overrides: overrides ?? {},
  });

  const result = await runAgentToCompletion(messages, overrides);

  log.info("runAgentActivity: agent finished", {
    model: result.config.model,
    chars: result.text.length,
    steps: result.steps,
    hitStepLimit: result.hitStepLimit,
  });

  return {
    text: result.text,
    config: result.config,
    steps: result.steps,
    hitStepLimit: result.hitStepLimit,
  };
}
