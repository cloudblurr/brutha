import { LRUCache } from "lru-cache";

/**
 * Lightweight in-memory cache + in-flight de-duplication for cheap, repeatable
 * tool calls (S7), e.g. getWeather and fetchUrl.
 *
 * - Caches resolved values for a short TTL so repeated identical calls within a
 *   chat session are cheap.
 * - Stores the in-flight Promise so concurrent identical calls share one
 *   network request (de-bounce / single-flight) instead of stampeding.
 */
const cache = new LRUCache<string, Promise<unknown>>({
  max: 500,
  ttl: 1000 * 60 * 5, // 5 minutes
  // Keep rejected promises out of the cache so failures aren't memoized.
  allowStale: false,
});

/**
 * Run `fn` with caching keyed by `key`. Concurrent calls with the same key
 * share a single execution; the result is cached for the TTL. On rejection the
 * entry is evicted so the next call retries.
 */
export function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = cache.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const p = fn().catch((err) => {
    cache.delete(key); // don't memoize failures
    throw err;
  });
  cache.set(key, p as Promise<unknown>);
  return p;
}

/** Clear the cache (useful in tests). */
export function clearToolCache(): void {
  cache.clear();
}
