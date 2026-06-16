import { describe, it, expect, vi } from "vitest";
import { withRetry, withTimeout, TimeoutError, ok, fail } from "@/lib/tools/_reliability";

const noSleep = () => Promise.resolve();

describe("withRetry", () => {
  it("returns on the first successful attempt", async () => {
    const fn = vi.fn(() => Promise.resolve("done"));
    const res = await withRetry(fn, { sleep: noSleep });
    expect(res).toBe("done");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries transient failures then succeeds", async () => {
    let calls = 0;
    const fn = vi.fn(() => {
      calls++;
      if (calls < 3) return Promise.reject(new Error("blip"));
      return Promise.resolve("ok");
    });
    const res = await withRetry(fn, { attempts: 3, sleep: noSleep });
    expect(res).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws the last error after exhausting attempts", async () => {
    const fn = vi.fn(() => Promise.reject(new Error("always fails")));
    await expect(withRetry(fn, { attempts: 3, sleep: noSleep })).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry when retryable() returns false", async () => {
    const fn = vi.fn(() => Promise.reject(new Error("4xx")));
    await expect(
      withRetry(fn, { attempts: 5, retryable: () => false, sleep: noSleep })
    ).rejects.toThrow("4xx");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("withTimeout", () => {
  it("resolves when the promise beats the timeout", async () => {
    await expect(withTimeout(Promise.resolve(42), 50)).resolves.toBe(42);
  });

  it("rejects with TimeoutError when the promise is too slow", async () => {
    const slow = new Promise((r) => setTimeout(() => r("late"), 50));
    await expect(withTimeout(slow, 5)).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe("ToolResult helpers", () => {
  it("ok() wraps data", () => {
    expect(ok({ x: 1 })).toEqual({ ok: true, data: { x: 1 } });
  });
  it("fail() includes a default suggestion", () => {
    const r = fail("boom");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.suggestion.length).toBeGreaterThan(0);
  });
});
