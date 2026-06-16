import { describe, it, expect, beforeEach } from "vitest";
import { cached, clearToolCache, cacheStats, TTL } from "@/lib/tools/_cache";

describe("tool cache (S7)", () => {
  beforeEach(() => clearToolCache());

  it("returns the same in-flight promise for concurrent identical keys", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return "value";
    };
    const [a, b] = await Promise.all([cached("k", fn), cached("k", fn)]);
    expect(a).toBe("value");
    expect(b).toBe("value");
    expect(calls).toBe(1); // single-flight
  });

  it("caches resolved values across sequential calls", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      return calls;
    };
    const first = await cached("seq", fn);
    const second = await cached("seq", fn);
    expect(first).toBe(1);
    expect(second).toBe(1); // served from cache, fn not re-run
    expect(calls).toBe(1);
  });

  it("does not memoize failures", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new Error("fail");
    };
    await expect(cached("err", fn)).rejects.toThrow("fail");
    await expect(cached("err", fn)).rejects.toThrow("fail");
    expect(calls).toBe(2); // retried, not cached
  });

  it("respects a short per-entry TTL (value expires)", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      return calls;
    };
    const first = await cached("ttl", fn, 20);
    expect(first).toBe(1);
    // Within TTL: cached.
    expect(await cached("ttl", fn, 20)).toBe(1);
    // After TTL: recomputed.
    await new Promise((r) => setTimeout(r, 30));
    expect(await cached("ttl", fn, 20)).toBe(2);
    expect(calls).toBe(2);
  });

  it("exposes a longer TTL preset for static data", () => {
    expect(TTL.static).toBeGreaterThan(TTL.live);
    expect(TTL.live).toBeGreaterThan(TTL.realtime);
  });

  it("tracks hit/miss stats and hitRate", async () => {
    clearToolCache();
    const fn = async () => "x";
    await cached("s", fn); // miss
    await cached("s", fn); // hit
    await cached("s", fn); // hit
    const stats = cacheStats();
    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(2);
    expect(stats.hitRate).toBeCloseTo(0.667, 2);
    expect(stats.size).toBeGreaterThanOrEqual(1);
  });
});
