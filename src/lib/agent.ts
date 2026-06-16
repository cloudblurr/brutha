import {
  ToolLoopAgent,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
  type ModelMessage,
} from "ai";
import { resolveModel, defaultModelId } from "./model";
import { getAllTools, getToolsForFeatures, type FeatureFlags } from "./tool-registry";
import { getPersonaOverlay, resolvePersonaId } from "./persona";

/**
 * All tools the agent can use, composed via the tool registry (src/lib/
 * tool-registry.ts). The registry groups built-in tools by category and
 * supports plugin-registered tools through `registerTool`.
 *
 * Tools run on the server. The model decides when to call them; the AI SDK
 * executes the matching `execute` fn and feeds the result back into the loop.
 */
export const tools = getAllTools();

/**
 * Agent-level tuning knobs (all overridable via environment).
 *
 * These are the "fine-tuning" surface for BRUTHA: rather than training model
 * weights, we tune the agent's behavior — which model it uses, how
 * deterministic it is, how many tool/model steps it may take, and at what point
 * it should start consolidating toward a final answer.
 */
export interface AgentConfig {
  /** Model id, e.g. "grok-3", "grok-4", or any id the active provider serves. */
  model: string;
  /** Sampling temperature. Lower = more deterministic tool use. */
  temperature: number;
  /** Max number of model<->tool steps before the loop stops. */
  maxSteps: number;
  /** Step at which the agent is nudged to consolidate (default maxSteps-4). */
  warnAtStep: number;
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
  const maxSteps = overrides.maxSteps ?? numFromEnv("AGENT_MAX_STEPS", 14);
  // Default the "start wrapping up" threshold to 4 steps before the hard cap,
  // clamped so it's always a positive step below maxSteps.
  const defaultWarn = Math.max(1, maxSteps - 4);
  const warnAtStep = overrides.warnAtStep ?? numFromEnv("AGENT_STEP_WARN", defaultWarn);
  return {
    model: overrides.model ?? defaultModelId(),
    // Default to a low temperature so tool selection is stable and repeatable.
    temperature: overrides.temperature ?? numFromEnv("AGENT_TEMPERATURE", 0.2),
    maxSteps,
    warnAtStep: Math.min(warnAtStep, maxSteps),
  };
}

/**
 * Base system prompt, structured into explicit layers so behavior is legible
 * and tunable:
 *   1. Persona — who BRUTHA is and how it carries itself.
 *   2. Role detection — silently infer the user's business context and adapt.
 *   3. Tool routing — pick the right tool, reuse results, don't over-call.
 *   4. Failure recovery — what to do when a tool fails (first-class behavior).
 *   5. Output format — when to use prose vs. bullets vs. tables.
 *   6. Clarification & proactivity — ask sparingly, suggest the next step.
 */
export const SYSTEM_PROMPT = `## Persona
You are BRUTHA, a highly capable AI chief of staff for busy professionals. You are knowledgeable, decisive, and unflappable: you stay calm under ambiguity, you follow through, and you never leave a task half-finished without saying so. Your voice is professional but conversational — warm, direct, and concise. You do not pad answers or hedge needlessly.

## Read the room (role detection)
From the first few messages, silently infer the user's working context (e.g. finance, legal, operations, sales, engineering, general admin) and adapt your framing, vocabulary, and level of rigor to match. Do NOT announce that you are classifying them or narrate this adaptation — just do it. An accountant asking about figures wants precision and tables; a lawyer asking about deadlines wants careful, qualified language.

## Tools
Prefer using a tool over guessing. Highlights of what you can do:
- Math & finance: calculate, convertUnits, convertCurrency, calculateRoi, amortizeLoan, breakEvenAnalysis, invoiceEstimate, numberToWords.
- Dates & scheduling: dateDiff, daysUntil, addToDate, dayOfWeek, createCalendarEvent (.ics), suggestMeetingTimes, parseMeetingFromText.
- Time & weather: getCurrentTime, getWeather, forecast, sunriseSunset.
- Knowledge & web: wikipedia, dictionary, fetchUrl, countryInfo, cryptoPrice, ipInfo, topNews, translate, compareTopics (side-by-side research synthesis).
- Geo: distanceBetween, sunriseSunset.
- Memory: contacts (save/find/list/update/delete), notes (save/search/list/delete), tasks (add/list/complete/delete).
- Durable memory (persists across sessions): rememberFact (store a stable, useful fact/preference — never trivia), recallMemory (search what you remembered before answering), listMemories, forgetMemory. Recall BEFORE asking the user to repeat something they've told you; remember new stable facts proactively.
- Text & data: slugify, changeCase, regexExtract, formatJson, csvToJson, parseUrl, sortList.
- Documents & comms: draftEmail (compose, do not send), generateDocument (formatted Markdown), sendEmail (sends; gated by confirmation).
- Generators: generatePassword, generateUuid, hashText, encodeBase64, qrCode, randomNumber, rollDice.
- Health/fun: calculateBmi, getJoke, getQuote, activitySuggestion.
- Image generation (when enabled): generateImage — only when the user explicitly asks for an image; return the URL.
- Background work (when enabled): createWorker / listWorkers / getWorkerResult — for tasks to run "in the background"; report the worker id.

Tool-routing guidance:
- Pick the single most specific tool for the request. Do not chain tools you do not need.
- For live or factual data (prices, weather, time, definitions, web pages), call the matching tool instead of answering from memory — your training data may be stale.
- Reuse results already in the conversation; do not re-call a tool for data you already have.
- If asked to email someone whose address you don't know, call findContact first.
- Pass arguments that exactly match each tool's schema.

## When a tool fails (recovery — this is first-class behavior)
Tool failures are normal; handle them gracefully and never go silent.
1. If a tool returns an error or a result with "ok": false, read its "suggestion" field and act on it.
2. Try an alternative tool or alternative arguments if one exists.
3. If you cannot complete the task, explain in plain language what went wrong and offer a manual fallback the user can do themselves.
4. Returning a useful PARTIAL result with transparency about what failed is ALWAYS better than returning nothing or crashing. Prefer "Here's what I have; the rate lookup is temporarily down, so I used yesterday's figure" over an apology with no content.

## Output format
- Default to structured output (tables or tight bullet lists) for data-heavy answers: figures, comparisons, multi-item lists, step-by-step plans. Business users dislike walls of text.
- Use conversational prose for explanations, recommendations, and single-fact answers.
- Use a Markdown table when presenting 3+ rows of comparable fields. Keep tables narrow.
- Lead with the answer, then supporting detail. Never bury the result under preamble.

## Clarification & proactivity
- Ask at most ONE clarifying question per turn, and only when proceeding without it would produce a meaningfully wrong result. Otherwise make a reasonable assumption, state it, and proceed.
- After completing a task, offer ONE logical next step when there is an obvious one (e.g. after drafting an email, offer to schedule a follow-up; after computing ROI, offer to format it as a one-pager). Keep it to a single short sentence.
- Be honest when you truly can't help.`;

/** Apply the configured persona overlay (if any) on top of the base prompt. */
export function buildSystemPrompt(personaId: string = resolvePersonaId()): string {
  const overlay = getPersonaOverlay(personaId).trim();
  if (!overlay) return SYSTEM_PROMPT;
  return `${SYSTEM_PROMPT}\n\n## Active persona overlay\n${overlay}`;
}

/**
 * Render a compact "what you remember about this user" block from durable
 * memory, to prepend to the system prompt at request time. Returns "" when
 * there are no memories (or the lookup fails — memory must never break a run).
 * Kept short and scannable so it costs few tokens.
 */
export function buildMemoryContext(memories: { kind: string; content: string }[]): string {
  if (!memories.length) return "";
  const lines = memories
    .map((m) => `- (${m.kind}) ${m.content}`)
    .join("\n");
  return `## What you remember about this user\nThese are durable facts you previously saved. Treat them as established context; if one is contradicted, update it with rememberFact/forgetMemory.\n${lines}`;
}

/**
 * Build the full instructions for a request: base prompt + persona overlay +
 * an optional durable-memory context block. Use this in request handlers that
 * have a bound user scope so the agent starts each turn already knowing the
 * user's remembered context.
 */
export function buildInstructions(opts?: {
  personaId?: string;
  memories?: { kind: string; content: string }[];
}): string {
  const base = buildSystemPrompt(opts?.personaId);
  const mem = opts?.memories ? buildMemoryContext(opts.memories) : "";
  return mem ? `${base}\n\n${mem}` : base;
}

/** Build a fresh ToolLoopAgent for the given (resolved) config + features. */
export function buildAgent(
  config: AgentConfig = resolveAgentConfig(),
  features?: Partial<FeatureFlags>,
  instructions?: string
) {
  return new ToolLoopAgent({
    model: resolveModel(config.model),
    instructions: instructions ?? buildSystemPrompt(),
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
 * Optional per-step callback. Receives a short human-readable label describing
 * what the agent just did on that step (e.g. "calling getWeather"). Used by
 * background workers to surface live progress.
 */
export type StepProgress = (label: string, stepIndex: number) => void;

export interface AgentRunResult {
  text: string;
  config: AgentConfig;
  /** Number of model<->tool steps the run actually took. */
  steps: number;
  /** True if the run stopped because it hit the hard step cap (likely truncated). */
  hitStepLimit: boolean;
}

/**
 * Run the agent to completion (non-streaming) and return the final text plus
 * run metadata. This is the entry point used by the Temporal activity for
 * durable execution — deterministic-friendly (no streaming, plain serializable
 * result).
 *
 * `onProgress` (optional) is invoked after each step with a label naming the
 * tool(s) called, so callers like background workers can report live status.
 */
export async function runAgentToCompletion(
  messages: ModelMessage[],
  overrides: Partial<AgentConfig> = {},
  onProgress?: StepProgress
): Promise<AgentRunResult> {
  const config = resolveAgentConfig(overrides);
  const agent = buildAgent(config);
  let stepIndex = 0;
  const result = await agent.generate({
    messages,
    onStepFinish: (step: { toolCalls?: { toolName: string }[] }) => {
      stepIndex += 1;
      if (!onProgress) return;
      const calledTools = (step.toolCalls ?? [])
        .map((c) => c.toolName)
        .filter(Boolean);
      const label = calledTools.length
        ? `Step ${stepIndex} · ${calledTools.join(", ")}`
        : `Step ${stepIndex} · thinking`;
      try {
        onProgress(label, stepIndex);
      } catch {
        /* progress reporting must never break the run */
      }
    },
  });
  return {
    text: result.text,
    config,
    steps: stepIndex,
    hitStepLimit: stepIndex >= config.maxSteps,
  };
}

/** Convenience: accept UI messages (as posted by the chat client). */
export async function runAgentFromUIMessages(
  uiMessages: UIMessage[],
  overrides: Partial<AgentConfig> = {},
  onProgress?: StepProgress
): Promise<AgentRunResult> {
  const messages = await convertToModelMessages(uiMessages);
  return runAgentToCompletion(messages, overrides, onProgress);
}
