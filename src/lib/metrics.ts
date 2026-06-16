/**
 * Lightweight in-process metrics counters.
 *
 * No external metrics backend is assumed; this is a tiny, dependency-free
 * counter map so operationally-important events (e.g. Temporal durable
 * execution falling back to streaming) are observable via /api/health instead
 * of being buried in logs. Counters reset on process restart — they're a
 * live-process signal, not long-term storage.
 */

const counters = new Map<string, number>();

/** Increment a named counter by `n` (default 1). */
export function increment(name: string, n = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + n);
}

/** Read a single counter (0 if unset). */
export function getCounter(name: string): number {
  return counters.get(name) ?? 0;
}

/** Snapshot all counters as a plain object (for /api/health, debugging). */
export function snapshotMetrics(): Record<string, number> {
  return Object.fromEntries(counters);
}

/** Reset all counters (tests). */
export function resetMetrics(): void {
  counters.clear();
}

/** Canonical metric names so producers and consumers can't drift. */
export const Metric = {
  temporalFallback: "temporal.fallback_to_streaming",
  temporalDurableOk: "temporal.durable_ok",
  chatRequests: "chat.requests",
  pushSent: "push.sent",
  pushFailed: "push.failed",
  pushSubscriptionExpired: "push.subscription_expired",
} as const;
