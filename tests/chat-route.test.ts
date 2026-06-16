import { test, describe, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

/**
 * Integration test for the chat endpoint.
 *
 * Exercises the route handler's input/config validation branches directly
 * (no live Grok call): missing env -> 500, bad body -> 400. The route reads env
 * lazily via getEnvError, so we manipulate process.env per test.
 */
describe("/api/chat route", () => {
  // Supabase vars are required alongside the Puter inference token.
  const SUPA = {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
  };
  const original = {
    PUTER_AUTH_TOKEN: process.env.PUTER_AUTH_TOKEN,
    ...Object.fromEntries(Object.keys(SUPA).map((k) => [k, process.env[k]])),
  };

  beforeEach(() => {
    delete process.env.PUTER_AUTH_TOKEN;
    for (const [k, v] of Object.entries(SUPA)) process.env[k] = v;
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  test("returns 500 with a clear message when PUTER_AUTH_TOKEN is missing", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [] }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    assert.equal(res.status, 500);
    const json = (await res.json()) as { error: string };
    assert.match(json.error, /misconfigured/i);
  });

  test("returns 400 for an invalid body when env is valid", async () => {
    process.env.PUTER_AUTH_TOKEN = "puter-token";
    const { POST } = await import("@/app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      body: "not json",
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    assert.equal(res.status, 400);
  });
});
