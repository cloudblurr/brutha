import { ToolLoopAgent, tool, stepCountIs } from "ai";
import { xai } from "@ai-sdk/xai";
import { z } from "zod";

/**
 * Tool definitions. These run on the server. The agent (Grok) decides when to
 * call them; the AI SDK executes the `execute` fn and feeds the result back
 * into the model loop until it produces a final answer.
 */
export const tools = {
  /** Deterministic math so the model doesn't have to "guess" arithmetic. */
  calculate: tool({
    description:
      "Evaluate a basic arithmetic expression (+, -, *, /, parentheses, decimals). Use this whenever the user asks for a calculation.",
    inputSchema: z.object({
      expression: z
        .string()
        .describe("A math expression, e.g. '(3 + 4) * 12 / 2'"),
    }),
    execute: async ({ expression }) => {
      if (!/^[\d\s+\-*/().]+$/.test(expression)) {
        return { error: "Expression contains unsupported characters." };
      }
      try {
        // Constrained to the safe character set validated above.
        const result = Function(`"use strict"; return (${expression});`)();
        if (typeof result !== "number" || !Number.isFinite(result)) {
          return { error: "Expression did not evaluate to a finite number." };
        }
        return { expression, result };
      } catch {
        return { error: "Could not evaluate expression." };
      }
    },
  }),

  /** Returns the current server time — models have no clock otherwise. */
  getCurrentTime: tool({
    description:
      "Get the current date and time. Use this for any question about 'now', today's date, or the current time.",
    inputSchema: z.object({
      timeZone: z
        .string()
        .optional()
        .describe("IANA time zone, e.g. 'America/New_York'. Defaults to UTC."),
    }),
    execute: async ({ timeZone }) => {
      try {
        const now = new Date();
        return {
          iso: now.toISOString(),
          formatted: now.toLocaleString("en-US", {
            timeZone: timeZone || "UTC",
            dateStyle: "full",
            timeStyle: "long",
          }),
          timeZone: timeZone || "UTC",
        };
      } catch {
        return { error: `Invalid time zone: ${timeZone}` };
      }
    },
  }),
};

const SYSTEM_PROMPT = `You are Grok Agent, a helpful AI assistant powered by xAI's Grok.

You can use tools to answer questions accurately:
- Use 'calculate' for any arithmetic instead of computing in your head.
- Use 'getCurrentTime' for any question about the current date or time.

Be concise, friendly, and direct. When you use a tool, briefly explain the
result in plain language. If you don't know something and have no tool for it,
say so honestly.`;

/**
 * The agent. ToolLoopAgent runs the model -> tool -> model loop automatically,
 * stopping after a final text answer or when the step limit is reached.
 *
 * Model is configurable via XAI_MODEL (defaults to grok-3). The xai() provider
 * reads the XAI_API_KEY environment variable automatically.
 */
export const grokAgent = new ToolLoopAgent({
  model: xai(process.env.XAI_MODEL || "grok-3"),
  instructions: SYSTEM_PROMPT,
  tools,
  stopWhen: stepCountIs(8),
});
