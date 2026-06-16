import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

/**
 * Encryption-at-rest for sensitive stored data (agent memory), using only Node's
 * built-in crypto — no external dependency.
 *
 * Design goals:
 *  - **Authenticated encryption**: AES-256-GCM (confidentiality + integrity).
 *  - **Key derivation**: the 32-byte key is derived from the MEMORY_SECRET env
 *    var via scrypt, so the operator supplies a passphrase, not raw key bytes.
 *  - **Graceful fallback ("fallback security")**: when MEMORY_SECRET is unset,
 *    encryption is DISABLED and data is stored as tagged plaintext. The app
 *    keeps working (no hard failure), and `isEncryptionEnabled()` lets the UI /
 *    health endpoint report the true state. Encrypting later is non-destructive:
 *    decrypt() transparently reads old plaintext rows.
 *
 * Stored format (string):
 *   - encrypted:  "enc:v1:<saltHex>:<ivHex>:<tagHex>:<cipherHex>"
 *   - plaintext:  "plain:v1:<utf8>"
 * The explicit prefixes make every row self-describing, so a store can mix
 * encrypted and plaintext rows (e.g. data written before/after a key was set)
 * and still read all of them.
 */

const ENC_PREFIX = "enc:v1:";
const PLAIN_PREFIX = "plain:v1:";

function getSecret(): string | null {
  const s = process.env.MEMORY_SECRET?.trim();
  return s && s.length > 0 ? s : null;
}

/** True when a MEMORY_SECRET is configured and data will be encrypted at rest. */
export function isEncryptionEnabled(): boolean {
  return getSecret() !== null;
}

/** Derive a 32-byte AES key from the secret + per-record salt (scrypt). */
function deriveKey(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret, salt, 32);
}

/**
 * Encrypt a UTF-8 string for storage. When no secret is configured, returns a
 * tagged-plaintext envelope instead (so the value is still self-describing).
 */
export function encryptString(plaintext: string): string {
  const secret = getSecret();
  if (!secret) return PLAIN_PREFIX + plaintext;

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(secret, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return (
    ENC_PREFIX +
    [salt.toString("hex"), iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(
      ":"
    )
  );
}

/**
 * Decrypt a stored envelope back to its UTF-8 string. Transparently handles:
 *  - encrypted rows (requires the matching MEMORY_SECRET),
 *  - tagged-plaintext rows (no secret needed),
 *  - legacy/untagged values (returned as-is).
 * Throws only when an encrypted row can't be decrypted (wrong/absent secret or
 * tampered ciphertext) — callers decide whether to surface or skip it.
 */
export function decryptString(stored: string): string {
  if (stored.startsWith(PLAIN_PREFIX)) {
    return stored.slice(PLAIN_PREFIX.length);
  }
  if (!stored.startsWith(ENC_PREFIX)) {
    // Untagged legacy value — treat as plaintext.
    return stored;
  }
  const secret = getSecret();
  if (!secret) {
    throw new Error(
      "Cannot decrypt: data is encrypted but MEMORY_SECRET is not set."
    );
  }
  const body = stored.slice(ENC_PREFIX.length);
  const [saltHex, ivHex, tagHex, cipherHex] = body.split(":");
  if (!saltHex || !ivHex || !tagHex || !cipherHex) {
    throw new Error("Cannot decrypt: malformed encrypted envelope.");
  }
  const key = deriveKey(secret, Buffer.from(saltHex, "hex"));
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(cipherHex, "hex")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

/**
 * Best-effort decrypt: returns the plaintext, or a redaction placeholder when a
 * row can't be decrypted (e.g. the secret was rotated). Never throws — use in
 * list/recall paths where one unreadable row must not break the whole result.
 */
export function tryDecryptString(stored: string): string {
  try {
    return decryptString(stored);
  } catch {
    return "[unreadable: encrypted with a different key]";
  }
}
