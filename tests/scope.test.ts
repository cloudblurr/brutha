import { test, describe } from "vitest";
import assert from "node:assert/strict";
import { runWithDb, currentDb, currentUserId, type Db } from "../src/lib/scope";

/**
 * Scope is now an RLS-bound Supabase client + user id carried in
 * AsyncLocalStorage (replaces the old text-"scope" string). We don't need a
 * real Supabase client to test propagation — a sentinel object is enough to
 * assert the right context flows through awaits and nesting.
 */

// A stand-in for the Supabase client; identity is all these tests check.
function fakeDb(tag: string): Db {
  return { __tag: tag } as unknown as Db;
}

describe("currentDb / currentUserId (AsyncLocalStorage)", () => {
  test("currentUserId is null outside any context", () => {
    assert.equal(currentUserId(), null);
  });

  test("currentDb throws outside any context (programming error)", () => {
    assert.throws(() => currentDb(), /No Supabase context bound/);
  });

  test("binds db + userId inside the callback", () => {
    const db = fakeDb("alice");
    runWithDb(db, "alice", () => {
      assert.equal(currentDb(), db);
      assert.equal(currentUserId(), "alice");
    });
  });

  test("propagates across awaits", async () => {
    const db = fakeDb("bob");
    await runWithDb(db, "bob", async () => {
      await Promise.resolve();
      assert.equal(currentUserId(), "bob");
      assert.equal(currentDb(), db);
    });
  });

  test("nested contexts restore the outer value", () => {
    const outer = fakeDb("outer");
    const inner = fakeDb("inner");
    runWithDb(outer, "outer", () => {
      runWithDb(inner, "inner", () => {
        assert.equal(currentUserId(), "inner");
        assert.equal(currentDb(), inner);
      });
      assert.equal(currentUserId(), "outer");
      assert.equal(currentDb(), outer);
    });
    assert.equal(currentUserId(), null);
  });

  test("concurrent contexts do not leak into each other", async () => {
    const results: string[] = [];
    await Promise.all([
      runWithDb(fakeDb("a"), "a", async () => {
        await new Promise((r) => setTimeout(r, 5));
        results.push(currentUserId()!);
      }),
      runWithDb(fakeDb("b"), "b", async () => {
        results.push(currentUserId()!);
      }),
    ]);
    assert.deepEqual(results.sort(), ["a", "b"]);
  });
});
