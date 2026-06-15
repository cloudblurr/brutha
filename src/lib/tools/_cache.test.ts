import { describe, it, expect, beforeEach } from "vitest";
import { cached, clearToolCache } from "@/lib/tools/_cache";

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
});
