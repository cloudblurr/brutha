import { generateText } from "ai";
import { resolveModel } from "@/lib/model";
import { getEnvError } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Prompt Enhance.
 *
 * Takes a rough user prompt and rewrites it into a clearer, more effective
 * prompt — without answering it. Used by the "enhance" button in the composer.
 */

const ENHANCE_SYSTEM = `You rewrite a user's rough chat prompt into a clearer, more effective version.
Rules:
- Return ONLY the improved prompt text. No preamble, no quotes, no explanation.
- Preserve the user's intent and language. Do NOT answer the prompt.
- Make it specific and well-structured; add helpful constraints only if clearly implied.
- Keep it concise — usually 1-4 sentences. Never invent facts the user didn't provide.`;

export async function POST(req: Request) {
  const envError = getEnvError();
  if (envError) {
    return Response.json({ error: `Server misconfigured (${envError}).` }, { status: 500 });
  }

  let prompt: unknown;
  try {
    ({ prompt } = await req.json());
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof prompt !== "string" || !prompt.trim()) {
    return Response.json({ error: "Provide a non-empty 'prompt'." }, { status: 400 });
  }
  if (prompt.length > 4000) {
    return Response.json({ error: "Prompt too long to enhance (max 4000 chars)." }, { status: 400 });
  }

  try {
    const { text } = await generateText({
      model: resolveModel(),
      system: ENHANCE_SYSTEM,
      prompt: `Rewrite this prompt:\n\n${prompt.trim()}`,
      temperature: 0.4,
    });
    const enhanced = text.trim();
    return Response.json({ enhanced: enhanced || prompt.trim() });
  } catch (e) {
    return Response.json(
      { error: `Enhance failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }
}
