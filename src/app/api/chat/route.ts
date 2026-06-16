import {
  convertToModelMessages,
  type UIMessage,
  type ModelMessage,
} from "ai";
import { buildAgent } from "@/lib/agent";
import type { FeatureFlags } from "@/lib/tool-registry";
import { getEnvError } from "@/lib/env";
import { logger, newRequestId } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { runWithDb, type Db } from "@/lib/scope";

// Stream responses; this route runs on the Node.js runtime (nodemailer, etc.).
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const requestId = newRequestId();
  const startedAt = Date.now();

  // S5: validate environment up front; fail fast with a clear message.
  const envError = getEnvError();
  if (envError) {
    logger.error({ requestId, envError }, "env validation failed");
    return new Response(
      JSON.stringify({
        error: `Server is misconfigured (${envError}). Copy .env.example to .env.local and add the required values.`,
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

  // Resolve the signed-in user + an RLS-scoped Supabase client from cookies.
  // Tools (contacts/notes/tasks/workers) read this client via currentDb(), so
  // every query is automatically scoped to the user by Row Level Security.
  const supabase = (await createClient()) as unknown as Db;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const modelMessages: ModelMessage[] = await convertToModelMessages(messages);
  logger.info(
    { requestId, messages: modelMessages.length, userId: user.id },
    "chat request"
  );

  // Bind the user's RLS-scoped Supabase client for the whole streamed run so
  // tool calls operate on the right user's data. AsyncLocalStorage propagates
  // the context through the agent's async tool loop.
  return runWithDb(supabase, user.id, () => {
    const agent = buildAgent(undefined, features);
    return agent.stream({ messages: modelMessages }).then((result) =>
      result.toUIMessageStreamResponse({
        // S1.3: never leak raw stack traces to the client; send a friendly
        // fallback message if the stream errors mid-flight.
        onError: (error) => {
          logger.error(
            {
              requestId,
              ms: Date.now() - startedAt,
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
