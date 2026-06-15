import pino from "pino";

/**
 * Structured logging (S13).
 *
 * A single shared pino logger. In development it pretty-prints; in production
 * it emits JSON lines suitable for shipping to a remote sink (Azure Monitor,
 * Loggly, etc.). Log level is configurable via LOG_LEVEL (default: info).
 *
 * Secrets must never be logged — only pass tool names, durations, request IDs,
 * and sanitized fields to these helpers.
 */
const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
  base: { service: "brutha" },
  redact: {
    // Defense-in-depth: never emit these even if accidentally passed.
    paths: [
      "XAI_API_KEY",
      "TEMPORAL_API_KEY",
      "SMTP_PASS",
      "apiKey",
      "password",
      "authorization",
    ],
    censor: "[REDACTED]",
  },
});

/** Generate a short request id for correlating log lines within a request. */
export function newRequestId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Log a single tool execution with timing. Returns the result unchanged so it
 * can wrap an awaited call inline.
 */
export async function logToolRun<T>(
  ctx: { requestId?: string; tool: string },
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    logger.info(
      { requestId: ctx.requestId, tool: ctx.tool, ms: Date.now() - start },
      "tool ok"
    );
    return result;
  } catch (err) {
    logger.error(
      {
        requestId: ctx.requestId,
        tool: ctx.tool,
        ms: Date.now() - start,
        err: err instanceof Error ? { message: err.message, stack: err.stack } : err,
      },
      "tool error"
    );
    throw err;
  }
}
