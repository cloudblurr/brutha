import { afterEach, describe, expect, it, vi } from "vitest";
import { webTools } from "@/lib/tools/web";
import { clearToolCache } from "@/lib/tools/_cache";

/**
 * Unit tests for the web tools' fetch hardening.
 *
 * Every web tool routes outbound calls through a shared `getJson` helper that
 * now applies a default AbortSignal.timeout(...). These tests verify that:
 *  - a TimeoutError/AbortError surfaces as the friendly "request timed out"
 *    message rather than an opaque DOMException, and
 *  - the tools degrade to a structured `{ error }` result instead of throwing,
 *    so the agent loop never hard-crashes on a flaky upstream.
 *
 * We stub the global `fetch` so no real network call is made.
 */

type ExecFn = (
  args: Record<string, unknown>,
  opts: { toolCallId: string; messages: [] }
) => Promise<unknown>;

function exec(tool: unknown): ExecFn {
  const e = (tool as { execute?: ExecFn }).execute;
  if (!e) throw new Error("tool has no execute fn");
  return e;
}

const OPTS = { toolCallId: "test", messages: [] as [] };

afterEach(() => {
  vi.restoreAllMocks();
  // Tool results are memoized for 5 min; clear between cases so a stubbed
  // failure in one test doesn't leak a cached value into the next.
  clearToolCache();
});

describe("web tools fetch hardening", () => {
  it("maps an AbortSignal timeout to a friendly 'request timed out' error", async () => {
    const timeout = new DOMException("The operation was aborted", "TimeoutError");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(timeout))
    );

    const res = (await exec(webTools.dictionary)({ word: "serendipity" }, OPTS)) as {
      error?: string;
    };
    expect(res.error).toBeTruthy();
    expect(res.error).toMatch(/request timed out/i);
  });

  it("returns a structured error (never throws) on a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("ENOTFOUND")))
    );

    const res = (await exec(webTools.cryptoPrice)({ coin: "bitcoin" }, OPTS)) as {
      error?: string;
    };
    expect(res.error).toBeTruthy();
    expect(res.error).toMatch(/crypto price lookup failed/i);
  });

  it("passes a timeout signal on every outbound request", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      // Assert the hardening is actually wired: a signal must be present.
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Promise.resolve(
        new Response(JSON.stringify({ title: "Test", extract: "x" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await exec(webTools.wikipedia)({ topic: "Test" }, OPTS);
    expect(fetchMock).toHaveBeenCalled();
  });
});
