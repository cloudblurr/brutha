import { describe, it, expect, beforeEach, afterEach } from "vitest";

/**
 * Integration test for the chat endpoint (S3).
 *
 * We exercise the route handler's input/config validation branches directly
 * (no live Grok call): missing env -> 500, bad body -> 400. The route reads env
 * lazily via getEnvError, so we manipulate process.env per test.
 */
describe("/api/chat route (S3)", () => {
  const original = process.env.XAI_API_KEY;

  beforeEach(() => {
    delete process.env.XAI_API_KEY;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = original;
  });

  it("returns 500 with a clear message when XAI_API_KEY is missing", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [] }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/misconfigured/i);
  });

  it("returns 400 for an invalid body when env is valid", async () => {
    process.env.XAI_API_KEY = "test-key";
    const { POST } = await import("@/app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      body: "not json",
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
