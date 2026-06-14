import { convertToModelMessages, type UIMessage } from "ai";
import { grokAgent } from "@/lib/agent";

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

  // Run the agent loop and stream UI message chunks back to the client.
  const result = await grokAgent.stream({
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
