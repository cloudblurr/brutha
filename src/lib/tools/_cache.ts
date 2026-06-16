import { LRUCache } from "lru-cache";

/**
 * Lightweight in-memory cache + in-flight de-duplication for cheap, repeatable
 * tool calls (S7), e.g. getWeather and fetchUrl.
 *
 * - Caches resolved values for a (per-entry) TTL so repeated identical calls
 *   within a chat session are cheap.
 * - Stores the in-flight Promise so concurrent identical calls share one
 *   network request (de-bounce / single-flight) instead of stampeding.
 *
 * Per-data-type TTLs: live data (prices, weather, news) should expire fast,
 * while stable reference data (dictionary, country facts) can be cached much
 * longer. Callers pass a TTL via `cached(key, fn, ttlMs)`; see TTL presets
 * below for canonical values.
 */

/** Canonical TTL presets (ms) so call sites stay consistent and self-documenting. */
export const TTL = {
  /** Real-time-ish data: crypto/news. ~1 min. */
  realtime: 60_000,
  /** Live but slower-moving: weather, currency. ~5 min. */
  live: 5 * 60_000,
  /** Fetched web pages / API reads. ~5 min. */
  page: 5 * 60_000,
  /** Reference data that rarely changes: dictionary, country info. ~24h. */
  static: 24 * 60 * 60_000,
} as const;

const DEFAULT_TTL = TTL.live;
// LRUCache requires `ttl` at construction to enable per-entry ttl overrides.
const cache = new LRUCache<string, Promise<unknown>>({
  max: 500,
  ttl: DEFAULT_TTL,
  // Keep rejected promises out of the cache so failures aren't memoized.
  allowStale: false,
  // Don't let an old entry's TTL reset on read; freshness is by data type.
  updateAgeOnGet: false,
});

let hits = 0;
let misses = 0;

/**
 * Run `fn` with caching keyed by `key`. Concurrent calls with the same key
 * share a single execution; the result is cached for `ttlMs` (default 5 min).
 * On rejection the entry is evicted so the next call retries.
 */
export function cached<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL
): Promise<T> {
  const existing = cache.get(key) as Promise<T> | undefined;
  if (existing) {
    hits++;
    return existing;
  }
  misses++;

  const p = fn().catch((err) => {
    cache.delete(key); // don't memoize failures
    throw err;
  });
  cache.set(key, p as Promise<unknown>, { ttl: ttlMs });
  return p;
}

/** Snapshot of cache effectiveness (for /api/health and debugging). */
export function cacheStats(): {
  size: number;
  max: number;
  hits: number;
  misses: number;
  hitRate: number;
} {
  const total = hits + misses;
  return {
    size: cache.size,
    max: cache.max,
    hits,
    misses,
    hitRate: total === 0 ? 0 : Math.round((hits / total) * 1000) / 1000,
  };
}

/** Clear the cache (useful in tests). Also resets stats. */
export function clearToolCache(): void {
  cache.clear();
  hits = 0;
  misses = 0;
}
