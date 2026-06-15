import {
  ToolLoopAgent,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
  type ModelMessage,
} from "ai";
import { xai } from "@ai-sdk/xai";
import { getAllTools, getToolsForFeatures, type FeatureFlags } from "./tool-registry";

/**
 * All tools the agent can use, composed via the tool registry (src/lib/
 * tool-registry.ts). The registry groups built-in tools by category and
 * supports plugin-registered tools through `registerTool`.
 *
 * Categories:
 *  - utility:  calculate, conversions, password, hash, base64, uuid, random,
 *              dice, qr, color, text counting
 *  - web:      weather, forecast, fetchUrl, wikipedia, dictionary, currency,
 *              crypto price, IP info, country info, top news
 *  - storage:  contacts (CRUD), notes (CRUD + FTS), tasks/reminders (CRUD)
 *  - email:    sendEmail (SMTP, optional; defaults to TEST_EMAIL_TO)
 *  - datetime: dateDiff, daysUntil, addToDate, dayOfWeek, ICS calendar event
 *  - text:     translate, slugify, changeCase, regexExtract, numberToWords,
 *              formatJson, csvToJson, parseUrl, sortList
 *  - extras:   jokes, quotes, sunrise/sunset, distance, BMI, activity
 *
 * Tools run on the server. Grok decides when to call them; the AI SDK executes
 * the matching `execute` fn and feeds the result back into the loop.
 */
export const tools = getAllTools();

/**
 * Agent-level tuning knobs (all overridable via environment).
 *
 * These are the "fine-tuning" surface for BRUTHA: rather than training model
 * weights (xAI does not expose Grok fine-tuning), we tune the agent's behavior
 * — which model it uses, how deterministic it is, and how many tool/model
 * steps it may take before stopping.
 */
export interface AgentConfig {
  /** Grok model id, e.g. "grok-3", "grok-4". */
  model: string;
  /** Sampling temperature. Lower = more deterministic tool use. */
  temperature: number;
  /** Max number of model<->tool steps before the loop stops. */
  maxSteps: number;
}

function numFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Resolve agent config from environment with sane defaults. */
export function resolveAgentConfig(
  overrides: Partial<AgentConfig> = {}
): AgentConfig {
  return {
    model: overrides.model ?? process.env.XAI_MODEL ?? "grok-3",
    // Default to a low temperature so tool selection is stable and repeatable.
    temperature: overrides.temperature ?? numFromEnv("AGENT_TEMPERATURE", 0.2),
    maxSteps: overrides.maxSteps ?? numFromEnv("AGENT_MAX_STEPS", 14),
  };
}

export const SYSTEM_PROMPT = `You are BRUTHA, a highly capable AI assistant powered by xAI's Grok, with a large toolbox.

Prefer using a tool over guessing. Highlights of what you can do:
- Math & conversions: calculate, convertUnits, convertCurrency, convertTimeZone, numberToWords.
- Dates: dateDiff, daysUntil, addToDate, dayOfWeek, createCalendarEvent (.ics).
- Time & weather: getCurrentTime, getWeather, forecast, sunriseSunset.
- Knowledge & web: wikipedia, dictionary, fetchUrl, countryInfo, cryptoPrice, ipInfo, topNews, translate.
- Geo: distanceBetween, sunriseSunset.
- Memory: contacts (save/find/list/update/delete), notes (save/search/list/delete),
  tasks (add/list/complete/delete).
- Text & data: slugify, changeCase, regexExtract, formatJson, csvToJson, parseUrl, sortList.
- Generators: generatePassword, generateUuid, hashText, encodeBase64, qrCode, randomNumber, rollDice.
- Health/fun: calculateBmi, getJoke, getQuote, activitySuggestion.
- Email: sendEmail (defaults to the configured test recipient; reports if not configured).
- Image generation (when enabled): generateImage — create a picture from a text prompt. Only call when the user explicitly asks for an image; return the URL.
- Background work (when enabled): createWorker / listWorkers / getWorkerResult — spawn a BRUTHA Worker for tasks the user wants done "in the background" and report the worker id, then let them check back.

Tool-routing guidance:
- Pick the single most specific tool for the request. Do not chain tools you do not need.
- For anything involving live or factual data (prices, weather, time, definitions, web
  pages), call the matching tool instead of answering from memory — your training data
  may be stale.
- Reuse results already in the conversation; do not re-call a tool for data you already have.
- If asked to email someone whose address you don't know, call findContact first, then sendEmail.
- Pass arguments that exactly match each tool's schema; if a required value is missing,
  ask one concise clarifying question rather than guessing.
- After a tool runs, explain the result briefly in plain language.
- If a tool returns an error, tell the user clearly and suggest a fix.
- Be concise, friendly, and accurate. If you truly can't help, say so honestly.`;

/** Build a fresh ToolLoopAgent for the given (resolved) config + features. */
export function buildAgent(
  config: AgentConfig = resolveAgentConfig(),
  features?: Partial<FeatureFlags>
) {
  return new ToolLoopAgent({
    model: xai(config.model),
    instructions: SYSTEM_PROMPT,
    tools: features ? getToolsForFeatures(features) : tools,
    temperature: config.temperature,
    stopWhen: stepCountIs(config.maxSteps),
  });
}

/**
 * Default singleton agent, built from environment config. Kept as a named
 * export for backwards compatibility with existing imports.
 */
export const grokAgent = buildAgent();

/**
 * Run the agent to completion (non-streaming) and return the final text plus
 * the full message history. This is the entry point used by the Temporal
 * activity for durable execution — it is deterministic-friendly (no streaming,
 * returns a plain serializable result).
 */
export async function runAgentToCompletion(
  messages: ModelMessage[],
  overrides: Partial<AgentConfig> = {}
): Promise<{ text: string; config: AgentConfig }> {
  const config = resolveAgentConfig(overrides);
  const agent = buildAgent(config);
  const result = await agent.generate({ messages });
  return { text: result.text, config };
}

/** Convenience: accept UI messages (as posted by the chat client). */
export async function runAgentFromUIMessages(
  uiMessages: UIMessage[],
  overrides: Partial<AgentConfig> = {}
): Promise<{ text: string; config: AgentConfig }> {
  const messages = await convertToModelMessages(uiMessages);
  return runAgentToCompletion(messages, overrides);
}
