import { xai } from "@ai-sdk/xai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

/**
 * Model provider abstraction (decouples the agent from xAI/Grok).
 *
 * BRUTHA defaults to xAI's Grok, but the agent must not be hardwired to a
 * single vendor. This factory resolves a `LanguageModel` from environment so
 * the same agent code can route through xAI, an OpenAI-compatible gateway
 * (FluxxAI, DigitalOcean Gradient, local vLLM/Ollama, OpenAI itself, …), or any
 * endpoint that speaks the OpenAI chat-completions protocol — with no agent
 * code changes.
 *
 * Resolution:
 *   AGENT_PROVIDER=xai (default)
 *     -> uses @ai-sdk/xai with XAI_API_KEY (model: XAI_MODEL or arg).
 *   AGENT_PROVIDER=openai-compatible
 *     -> uses AGENT_BASE_URL + AGENT_API_KEY (OpenAI-compatible).
 *        Model id comes from the arg / AGENT_MODEL / XAI_MODEL.
 *
 * Keeping XAI_* working unchanged preserves backward compatibility: existing
 * deployments need set nothing new.
 */

export type ProviderName = "xai" | "openai-compatible";

export function resolveProvider(): ProviderName {
  const raw = (process.env.AGENT_PROVIDER ?? "xai").trim().toLowerCase();
  return raw === "openai-compatible" ? "openai-compatible" : "xai";
}

/** Default model id for the active provider. */
export function defaultModelId(): string {
  return (
    process.env.AGENT_MODEL?.trim() ||
    process.env.XAI_MODEL?.trim() ||
    "grok-3"
  );
}

// Memoize the openai-compatible provider so we don't rebuild it per request.
let compatProvider: ReturnType<typeof createOpenAICompatible> | null = null;

function getCompatProvider() {
  if (compatProvider) return compatProvider;
  const baseURL = process.env.AGENT_BASE_URL?.trim();
  if (!baseURL) {
    throw new Error(
      "AGENT_PROVIDER=openai-compatible requires AGENT_BASE_URL (the OpenAI-compatible endpoint)."
    );
  }
  compatProvider = createOpenAICompatible({
    name: "brutha-compat",
    baseURL,
    apiKey: process.env.AGENT_API_KEY?.trim() || process.env.XAI_API_KEY?.trim(),
  });
  return compatProvider;
}

/**
 * Resolve a LanguageModel for the given model id (or the configured default).
 * This is the single entry point the agent + routes should use instead of
 * calling `xai(...)` directly.
 */
export function resolveModel(modelId: string = defaultModelId()): LanguageModel {
  switch (resolveProvider()) {
    case "openai-compatible":
      return getCompatProvider()(modelId);
    case "xai":
    default:
      return xai(modelId);
  }
}

/** Reset memoized state (tests). */
export function _resetModelFactory(): void {
  compatProvider = null;
}
