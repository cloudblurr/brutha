import { test, describe } from "vitest";
import assert from "node:assert/strict";
import { normalizeScope, GLOBAL_SCOPE, currentScope, runWithScope } from "../src/lib/scope";

describe("scope normalization", () => {
  test("empty / null / whitespace collapse to the global scope", () => {
    assert.equal(normalizeScope(null), GLOBAL_SCOPE);
    assert.equal(normalizeScope(undefined), GLOBAL_SCOPE);
    assert.equal(normalizeScope(""), GLOBAL_SCOPE);
    assert.equal(normalizeScope("   "), GLOBAL_SCOPE);
  });

  test("a real user id is preserved (trimmed)", () => {
    assert.equal(normalizeScope("user-123"), "user-123");
    assert.equal(normalizeScope("  user-123  "), "user-123");
  });
});

describe("runWithScope / currentScope (AsyncLocalStorage)", () => {
  test("defaults to global outside any scope", () => {
    assert.equal(currentScope(), GLOBAL_SCOPE);
  });

  test("binds the scope inside the callback", () => {
    runWithScope("alice", () => {
      assert.equal(currentScope(), "alice");
    });
  });

  test("propagates across awaits", async () => {
    await runWithScope("bob", async () => {
      await Promise.resolve();
      assert.equal(currentScope(), "bob");
    });
  });

  test("nested scopes restore the outer value", () => {
    runWithScope("outer", () => {
      runWithScope("inner", () => {
        assert.equal(currentScope(), "inner");
      });
      assert.equal(currentScope(), "outer");
    });
    assert.equal(currentScope(), GLOBAL_SCOPE);
  });

  test("concurrent scopes do not leak into each other", async () => {
    const results: string[] = [];
    await Promise.all([
      runWithScope("a", async () => {
        await new Promise((r) => setTimeout(r, 5));
        results.push(currentScope());
      }),
      runWithScope("b", async () => {
        results.push(currentScope());
      }),
    ]);
    assert.deepEqual(results.sort(), ["a", "b"]);
  });
});
