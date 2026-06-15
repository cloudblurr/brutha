import { test, describe } from "vitest";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/lib/users";

describe("password hashing (scrypt)", () => {
  test("hash format is scrypt$salt$hash", () => {
    const h = hashPassword("correct horse battery staple");
    const parts = h.split("$");
    assert.equal(parts.length, 3);
    assert.equal(parts[0], "scrypt");
    assert.ok(parts[1].length > 0);
    assert.ok(parts[2].length > 0);
  });

  test("verify accepts the correct password", () => {
    const h = hashPassword("hunter2");
    assert.equal(verifyPassword("hunter2", h), true);
  });

  test("verify rejects the wrong password", () => {
    const h = hashPassword("hunter2");
    assert.equal(verifyPassword("hunter3", h), false);
  });

  test("salts are random — same password hashes differently", () => {
    assert.notEqual(hashPassword("same"), hashPassword("same"));
  });

  test("verify is safe against malformed/empty stored hashes", () => {
    assert.equal(verifyPassword("x", null), false);
    assert.equal(verifyPassword("x", ""), false);
    assert.equal(verifyPassword("x", "not-a-hash"), false);
    assert.equal(verifyPassword("x", "scrypt$onlytwo"), false);
    assert.equal(verifyPassword("x", "bcrypt$aa$bb"), false);
  });
});
