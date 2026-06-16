import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Puter.js as the model provider (OpenAI-compatible transport).
 *
 * BRUTHA's inference runs on xAI's Grok models served through Puter.js. Puter
 * exposes an OpenAI-compatible endpoint, so we point the Vercel AI SDK at it
 * with the account auth token as the API key — keeping the whole server-side
 * agent (ToolLoopAgent + tool-calling loop) unchanged. Model ids are namespaced
 * `x-ai/...` (e.g. `x-ai/grok-4-1-fast`, `x-ai/grok-4.3`).
 *
 * The token is your Puter account credential (puter.com/dashboard#account). It
 * is server-only — all usage bills to that single account (Puter's normal
 * "User-Pays" per-user browser flow is not used here; this is a backend token).
 */

export const PUTER_BASE_URL = "https://api.puter.com/puterai/openai/v1";

/** Default Grok model (fast, supports tool-calling + a large context window). */
export const DEFAULT_PUTER_MODEL = "x-ai/grok-4-1-fast";

let provider: ReturnType<typeof createOpenAICompatible> | null = null;

/** Memoized Puter (OpenAI-compatible) provider bound to the auth token. */
export function getPuterProvider() {
  if (provider) return provider;
  const apiKey = process.env.PUTER_AUTH_TOKEN;
  if (!apiKey) {
    throw new Error(
      "PUTER_AUTH_TOKEN is not set. Get it from puter.com/dashboard#account and add it to your environment."
    );
  }
  provider = createOpenAICompatible({
    name: "puter",
    baseURL: PUTER_BASE_URL,
    apiKey,
  });
  return provider;
}

/** A Puter-served chat model by id (defaults to {@link DEFAULT_PUTER_MODEL}). */
export function puterModel(modelId: string = DEFAULT_PUTER_MODEL) {
  return getPuterProvider()(modelId);
}
