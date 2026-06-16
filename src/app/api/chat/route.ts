import {
  convertToModelMessages,
  type UIMessage,
  type ModelMessage,
} from "ai";
import { buildAgent, buildInstructions } from "@/lib/agent";
import type { FeatureFlags } from "@/lib/tool-registry";
import { runDurableAgent, isTemporalEnabled } from "@/lib/temporal/run";
import { getEnvError } from "@/lib/env";
import { logger, newRequestId } from "@/lib/logger";
import { resolveRequestScope } from "@/lib/request-scope";
import { runWithScope } from "@/lib/scope";
import { increment, Metric } from "@/lib/metrics";
import { topMemories } from "@/lib/memory/store";

// Stream responses; this route runs on the Node.js runtime (required for
// better-sqlite3 and nodemailer).
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const requestId = newRequestId();
  const startedAt = Date.now();
  increment(Metric.chatRequests);

  // S5: validate environment up front; fail fast with a clear message.
  const envError = getEnvError();
  if (envError) {
    logger.error({ requestId, envError }, "env validation failed");
    return new Response(
      JSON.stringify({
        error: `Server is misconfigured (${envError}). Copy .env.example to .env.local and add your key.`,
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  let messages: UIMessage[];
  let features: Partial<FeatureFlags> | undefined;
  try {
    const body = await req.json();
    messages = body.messages;
    if (!Array.isArray(messages)) throw new Error("messages must be an array");
    // Optional per-request feature flags from the composer toggles.
    if (body.features && typeof body.features === "object") {
      features = body.features as Partial<FeatureFlags>;
    }
  } catch {
    logger.warn({ requestId }, "invalid request body");
    return new Response(JSON.stringify({ error: "Invalid request body." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const modelMessages: ModelMessage[] = await convertToModelMessages(messages);
  const scope = await resolveRequestScope();
  logger.info(
    { requestId, messages: modelMessages.length, durable: isTemporalEnabled(), scope },
    "chat request"
  );

  // --- Durable path -------------------------------------------------------
  // When Temporal is configured (TEMPORAL_ADDRESS/API key, or an explicit
  // local dev server via AGENT_DURABLE=1), run the agent as a durable Temporal
  // workflow. The run survives worker restarts and is retried on transient
  // failure. This path is non-streaming: it returns the final text as JSON.
  if (isTemporalEnabled()) {
    try {
      const result = await runDurableAgent(modelMessages);
      increment(Metric.temporalDurableOk);
      logger.info(
        { requestId, workflowId: result.workflowId, ms: Date.now() - startedAt },
        "durable run ok"
      );
      return new Response(
        JSON.stringify({
          text: result.text,
          durable: true,
          workflowId: result.workflowId,
          config: result.config,
          hitStepLimit: result.hitStepLimit,
          steps: result.steps,
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    } catch (err) {
      // Fall through to streaming mode if Temporal is misconfigured/unreachable
      // so the chat keeps working instead of hard-failing. Count it so the
      // silent fallback is observable via /api/health (not just logs).
      increment(Metric.temporalFallback);
      logger.error(
        {
          requestId,
          err: err instanceof Error ? err.message : String(err),
        },
        "durable execution failed, falling back to streaming"
      );
    }
  }

  // --- Streaming path (default) ------------------------------------------
  // Bind the user's data scope for the whole streamed run so tool calls
  // (contacts/notes/tasks/workers) operate on the right user's data. The
  // AsyncLocalStorage context established here propagates through the agent's
  // async tool loop.
  return runWithScope(scope, () => {
    // Seed the agent with the user's durable memory so it starts each turn
    // already knowing established context. Best-effort: memory must never break
    // a chat run, so any failure falls back to the base instructions.
    let instructions: string | undefined;
    try {
      const memories = topMemories(8);
      instructions = buildInstructions({ memories });
    } catch (err) {
      logger.warn(
        { requestId, err: err instanceof Error ? err.message : String(err) },
        "memory context load failed; using base instructions"
      );
      instructions = undefined;
    }
    const agent = buildAgent(undefined, features, instructions);
    return agent.stream({ messages: modelMessages }).then((result) =>
      result.toUIMessageStreamResponse({
        // S1.3: never leak raw stack traces to the client; send a friendly
        // fallback message if the stream errors mid-flight.
        onError: (error) => {
          logger.error(
            {
              requestId,
              err: error instanceof Error ? error.stack ?? error.message : error,
            },
            "streaming error"
          );
          return "Sorry, I ran into a problem. Please try again.";
        },
      })
    );
  });
}
