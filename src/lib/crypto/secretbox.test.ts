import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  encryptString,
  decryptString,
  tryDecryptString,
  isEncryptionEnabled,
} from "@/lib/crypto/secretbox";

/**
 * The encryption-at-rest helper has two modes driven by MEMORY_SECRET. We test
 * both, plus the cross-mode read path (encrypted data is unreadable without the
 * key, tagged-plaintext is always readable).
 */

const ORIGINAL = process.env.MEMORY_SECRET;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.MEMORY_SECRET;
  else process.env.MEMORY_SECRET = ORIGINAL;
});

describe("secretbox — plaintext fallback (no MEMORY_SECRET)", () => {
  beforeEach(() => {
    delete process.env.MEMORY_SECRET;
  });

  it("reports encryption disabled", () => {
    expect(isEncryptionEnabled()).toBe(false);
  });

  it("round-trips via a tagged-plaintext envelope", () => {
    const env = encryptString("hello world");
    expect(env.startsWith("plain:v1:")).toBe(true);
    expect(decryptString(env)).toBe("hello world");
  });

  it("reads untagged legacy values as plaintext", () => {
    expect(decryptString("legacy raw value")).toBe("legacy raw value");
  });
});

describe("secretbox — encrypted (MEMORY_SECRET set)", () => {
  beforeEach(() => {
    process.env.MEMORY_SECRET = "test-passphrase-123";
  });

  it("reports encryption enabled", () => {
    expect(isEncryptionEnabled()).toBe(true);
  });

  it("produces an opaque envelope and round-trips", () => {
    const secret = "the user's SSN is 000-00-0000";
    const env = encryptString(secret);
    expect(env.startsWith("enc:v1:")).toBe(true);
    expect(env).not.toContain("000-00-0000"); // ciphertext, not plaintext
    expect(decryptString(env)).toBe(secret);
  });

  it("uses a random salt+iv so identical plaintext encrypts differently", () => {
    expect(encryptString("same")).not.toBe(encryptString("same"));
  });

  it("fails to decrypt when the secret is wrong (tamper/rotation safety)", () => {
    const env = encryptString("secret data");
    process.env.MEMORY_SECRET = "a-different-passphrase";
    expect(() => decryptString(env)).toThrow();
    // best-effort path returns a placeholder instead of throwing
    expect(tryDecryptString(env)).toContain("unreadable");
  });

  it("cannot decrypt encrypted data once the secret is removed", () => {
    const env = encryptString("secret data");
    delete process.env.MEMORY_SECRET;
    expect(() => decryptString(env)).toThrow(/MEMORY_SECRET is not set/);
  });
});
