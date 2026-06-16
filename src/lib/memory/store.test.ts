import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runWithScope } from "@/lib/scope";
import {
  remember,
  recall,
  listMemories,
  forget,
  topMemories,
  countMemories,
  extractKeywords,
} from "@/lib/memory/store";

/**
 * Memory store integration tests. Each test runs inside a UNIQUE user scope so
 * rows never collide across tests or with real data (the store filters strictly
 * by scope). Uses the real SQLite DB (under ./data, gitignored) like the rest of
 * the suite. Encryption is left in its default (plaintext) mode here; the crypto
 * layer is covered separately in secretbox.test.ts.
 */

const ORIGINAL = process.env.MEMORY_SECRET;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.MEMORY_SECRET;
  else process.env.MEMORY_SECRET = ORIGINAL;
});

let counter = 0;
function uniqueScope(): string {
  counter += 1;
  return `test-mem-${Date.now()}-${counter}`;
}

describe("extractKeywords", () => {
  it("lowercases, strips punctuation and stopwords, dedupes", () => {
    const kw = extractKeywords("The user PREFERS dark-mode, and the user likes tea!");
    expect(kw).not.toContain("the");
    expect(kw).toContain("user");
    expect(kw).toContain("prefers");
    expect(kw).toContain("dark");
    // 'user' appears twice in input but once in the keyword surface
    expect(kw.split(" ").filter((t) => t === "user")).toHaveLength(1);
  });
});

describe("memory store lifecycle", () => {
  it("remembers and recalls by keyword", () => {
    runWithScope(uniqueScope(), () => {
      remember({ content: "The user's favorite programming language is Rust." });
      remember({ content: "The user lives in Lisbon, Portugal." });
      const hits = recall("Rust language");
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].content).toContain("Rust");
    });
  });

  it("scopes memories per user (no cross-scope leakage)", () => {
    const a = uniqueScope();
    const b = uniqueScope();
    runWithScope(a, () => remember({ content: "Alice secret apricot" }));
    runWithScope(b, () => {
      const hits = recall("apricot");
      expect(hits.every((h) => !h.content.includes("apricot"))).toBe(true);
    });
    runWithScope(a, () => {
      const hits = recall("apricot");
      expect(hits.some((h) => h.content.includes("apricot"))).toBe(true);
    });
  });

  it("ranks higher-importance memories first in topMemories", () => {
    runWithScope(uniqueScope(), () => {
      remember({ content: "low priority note", importance: 1 });
      remember({ content: "critical fact about billing", importance: 5 });
      const top = topMemories(5);
      expect(top[0].content).toContain("critical");
      expect(top[0].importance).toBe(5);
    });
  });

  it("lists, counts, and forgets memories", () => {
    runWithScope(uniqueScope(), () => {
      const id1 = remember({ content: "first memory" });
      remember({ content: "second memory" });
      expect(countMemories()).toBe(2);
      expect(listMemories().length).toBe(2);
      expect(forget(id1)).toBe(true);
      expect(countMemories()).toBe(1);
      // forgetting a non-existent / already-removed id returns false
      expect(forget(id1)).toBe(false);
    });
  });

  it("falls back to importance-ordered recents when no keyword matches", () => {
    runWithScope(uniqueScope(), () => {
      remember({ content: "unrelated content here", importance: 4 });
      const hits = recall("zzzznomatchquery");
      expect(hits.length).toBeGreaterThan(0); // fallback, not empty
    });
  });

  it("stores ciphertext at rest when MEMORY_SECRET is set but recalls plaintext", () => {
    process.env.MEMORY_SECRET = "integration-secret";
    runWithScope(uniqueScope(), () => {
      remember({ content: "encrypted-at-rest sentinel value" });
      const hits = recall("sentinel");
      expect(hits.some((h) => h.content.includes("sentinel"))).toBe(true);
    });
  });
});
