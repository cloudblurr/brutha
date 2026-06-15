import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { getDb } from "./db";

/**
 * User records for authentication.
 *
 * - OAuth users (GitHub/Google) are upserted on sign-in by email.
 * - Credentials users (dev fallback / email+password) store a scrypt hash.
 *
 * Password hashing uses Node's built-in scrypt (no external dependency). The
 * stored format is `scrypt$<saltHex>$<hashHex>`.
 */

export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  passwordHash: string | null;
  provider: string;
  createdAt: string;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = scryptSync(password, salt, expected.length);
  // timingSafeEqual throws if lengths differ; guard first.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function findUserByEmail(email: string): UserRecord | null {
  const row = getDb()
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.toLowerCase().trim());
  return (row as UserRecord) ?? null;
}

export function findUserById(id: string): UserRecord | null {
  const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id);
  return (row as UserRecord) ?? null;
}

/**
 * Create a credentials user. Throws if the email already exists.
 */
export function createCredentialsUser(
  email: string,
  password: string,
  name?: string
): UserRecord {
  const existing = findUserByEmail(email);
  if (existing) throw new Error("An account with that email already exists.");
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO users (id, email, name, passwordHash, provider)
       VALUES (?, ?, ?, ?, 'credentials')`
    )
    .run(id, email.toLowerCase().trim(), name ?? null, hashPassword(password));
  return findUserById(id)!;
}

/**
 * Upsert an OAuth user by email. Updates name/image on each sign-in.
 */
export function upsertOAuthUser(params: {
  email: string;
  name?: string | null;
  image?: string | null;
  provider: string;
}): UserRecord {
  const email = params.email.toLowerCase().trim();
  const existing = findUserByEmail(email);
  if (existing) {
    getDb()
      .prepare(
        `UPDATE users SET name = COALESCE(?, name), image = COALESCE(?, image)
         WHERE id = ?`
      )
      .run(params.name ?? null, params.image ?? null, existing.id);
    return findUserById(existing.id)!;
  }
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO users (id, email, name, image, provider)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, email, params.name ?? null, params.image ?? null, params.provider);
  return findUserById(id)!;
}
