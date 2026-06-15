import {
  convertToModelMessages,
  type UIMessage,
  type ModelMessage,
} from "ai";
import { grokAgent } from "@/lib/agent";
import { runDurableAgent, isTemporalEnabled } from "@/lib/temporal/run";

// Stream responses; this route runs on the Node.js runtime (required for
// better-sqlite3 and nodemailer).
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!process.env.XAI_API_KEY) {
    return new Response(
      JSON.stringify({
        error:
          "XAI_API_KEY is not set. Copy .env.example to .env.local and add your key.",
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  let messages: UIMessage[];
  try {
    const body = await req.json();
    messages = body.messages;
    if (!Array.isArray(messages)) throw new Error("messages must be an array");
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const modelMessages: ModelMessage[] = await convertToModelMessages(messages);

  // --- Durable path -------------------------------------------------------
  // When Temporal is configured (TEMPORAL_ADDRESS/API key, or an explicit
  // local dev server via AGENT_DURABLE=1), run the agent as a durable Temporal
  // workflow. The run survives worker restarts and is retried on transient
  // failure. This path is non-streaming: it returns the final text as JSON.
  if (isTemporalEnabled()) {
    try {
      const result = await runDurableAgent(modelMessages);
      return new Response(
        JSON.stringify({
          text: result.text,
          durable: true,
          workflowId: result.workflowId,
          config: result.config,
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    } catch (err) {
      // Fall through to streaming mode if Temporal is misconfigured/unreachable
      // so the chat keeps working instead of hard-failing.
      console.error(
        "[chat] durable execution failed, falling back to streaming:",
        err instanceof Error ? err.message : err
      );
    }
  }

  // --- Streaming path (default) ------------------------------------------
  const result = await grokAgent.stream({ messages: modelMessages });
  return result.toUIMessageStreamResponse();
}
