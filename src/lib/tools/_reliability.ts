/**
 * Shared reliability primitives for tools (retry, timeout, structured results).
 *
 * Goal: make external/tool calls fail *gracefully* and *legibly*. Instead of
 * throwing opaque exceptions that bubble unpredictably through the agent loop,
 * tools return a structured discriminated union the model can reason about, and
 * transient failures are retried with backoff before giving up.
 *
 * These helpers are pure and dependency-free so they can be unit-tested without
 * network or a running server.
 */

/**
 * Structured tool result. The success case carries `data`; the failure case
 * carries a human-readable `error` plus a `suggestion` telling the model what
 * to try next (a different tool, different arguments, or a manual fallback).
 *
 * Tools may also return plain objects (legacy style); this union is opt-in for
 * tools that want first-class, model-readable failure semantics.
 */
export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; suggestion: string; stale?: boolean };

export function ok<T>(data: T): ToolResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(
  error: string,
  suggestion = "Try rephrasing the request or use a different tool."
): ToolResult<T> {
  return { ok: false, error, suggestion };
}

/** Normalize any thrown value into a short, safe message. */
export function toMessage(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === "TimeoutError" || e.name === "AbortError") return "request timed out";
    return e.message;
  }
  return String(e);
}

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Race a promise against a timeout. Rejects with TimeoutError if `ms` elapses
 * first. Use for any operation that could hang (network, slow local work) so a
 * single stuck call cannot stall the whole agent loop.
 */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

export interface RetryOptions {
  /** Total attempts including the first (default 3). */
  attempts?: number;
  /** Base delay in ms for backoff (default 200). */
  baseDelayMs?: number;
  /** Max delay cap in ms (default 2000). */
  maxDelayMs?: number;
  /** Per-attempt timeout in ms. Omit to disable per-attempt timeouts. */
  timeoutMs?: number;
  /** Decide whether an error is worth retrying (default: retry all). */
  retryable?: (e: unknown) => boolean;
  /** Sleep impl (injectable for tests). */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run `fn` with retries and exponential backoff + full jitter. Optionally wraps
 * each attempt in a timeout. Returns the first successful value or throws the
 * last error after exhausting attempts.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const {
    attempts = 3,
    baseDelayMs = 200,
    maxDelayMs = 2000,
    timeoutMs,
    retryable = () => true,
    sleep = defaultSleep,
  } = opts;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return timeoutMs ? await withTimeout(fn(), timeoutMs) : await fn();
    } catch (e) {
      lastErr = e;
      if (attempt >= attempts || !retryable(e)) break;
      // Exponential backoff with full jitter: random in [0, min(cap, base*2^i)].
      const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delay = Math.floor(Math.random() * ceiling);
      await sleep(delay);
    }
  }
  throw lastErr;
}
