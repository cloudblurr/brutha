import { getDb } from "../db";
import { currentScope } from "../scope";
import { encryptString, tryDecryptString, isEncryptionEnabled } from "../crypto/secretbox";

/**
 * Deep, persistent agent memory store (per-user scoped, encrypted at rest).
 *
 * Memories are durable facts/preferences/context the agent recalls across
 * sessions. The sensitive `content` is encrypted via lib/crypto/secretbox; a
 * separate non-sensitive `keywords` surface powers FTS recall WITHOUT needing
 * to decrypt every row at query time. Recall ranking blends FTS relevance with
 * the stored `importance` (1-5) and recency.
 */

export type MemoryKind = "fact" | "preference" | "context" | "event";

export interface MemoryRecord {
  id: number;
  kind: MemoryKind;
  content: string;
  importance: number;
  createdAt: string;
  lastUsedAt: string | null;
}

interface MemoryRow {
  id: number;
  kind: MemoryKind;
  content: string; // encrypted/tagged envelope
  importance: number;
  createdAt: string;
  lastUsedAt: string | null;
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "to", "of",
  "in", "on", "at", "for", "with", "as", "by", "that", "this", "it", "i", "you",
  "my", "your", "me", "we", "he", "she", "they", "be", "has", "have", "had",
  "do", "does", "did", "will", "would", "can", "could", "should",
]);

/**
 * Extract a lowercase keyword surface from content for FTS. Deliberately lossy
 * and non-reversible — it's a search aid, not the data. Strips punctuation and
 * common stopwords; keeps tokens >= 2 chars.
 */
export function extractKeywords(text: string): string {
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  // Dedupe, preserve order.
  return Array.from(new Set(tokens)).join(" ");
}

/** Persist a memory for the current user scope. Returns the new id. */
export function remember(params: {
  content: string;
  kind?: MemoryKind;
  importance?: number;
  keywords?: string;
}): number {
  const content = params.content.trim();
  if (!content) throw new Error("Memory content must not be empty.");
  const kind = params.kind ?? "fact";
  const importance = Math.min(5, Math.max(1, params.importance ?? 3));
  const keywords = (params.keywords ?? extractKeywords(content)).trim();
  const info = getDb()
    .prepare(
      `INSERT INTO memories (scope, kind, content, keywords, importance)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(currentScope(), kind, encryptString(content), keywords, importance);
  return Number(info.lastInsertRowid);
}

function decodeRow(r: MemoryRow): MemoryRecord {
  return {
    id: r.id,
    kind: r.kind,
    content: tryDecryptString(r.content),
    importance: r.importance,
    createdAt: r.createdAt,
    lastUsedAt: r.lastUsedAt,
  };
}

/** Build an FTS5 MATCH expression (OR of quoted prefix terms). */
function ftsQuery(query: string): string {
  return extractKeywords(query)
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '""')}"*`)
    .join(" OR ");
}

/**
 * Recall the most relevant memories for a query, ranked by FTS relevance with a
 * boost from importance. Updates lastUsedAt on the returned rows so recency
 * reflects actual use. Falls back to importance-ordered recent memories when
 * the query yields no keyword matches.
 */
export function recall(query: string, limit = 5): MemoryRecord[] {
  const scope = currentScope();
  const match = ftsQuery(query);
  let rows: MemoryRow[] = [];
  if (match) {
    rows = getDb()
      .prepare(
        `SELECT m.id, m.kind, m.content, m.importance, m.createdAt, m.lastUsedAt
         FROM memories_fts f JOIN memories m ON m.id = f.rowid
         WHERE memories_fts MATCH ? AND m.scope = ?
         ORDER BY (rank - m.importance * 0.5) ASC
         LIMIT ?`
      )
      .all(match, scope, limit) as MemoryRow[];
  }
  if (rows.length === 0) {
    rows = getDb()
      .prepare(
        `SELECT id, kind, content, importance, createdAt, lastUsedAt
         FROM memories WHERE scope = ?
         ORDER BY importance DESC, id DESC LIMIT ?`
      )
      .all(scope, limit) as MemoryRow[];
  }
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => "?").join(",");
    getDb()
      .prepare(
        `UPDATE memories SET lastUsedAt = datetime('now')
         WHERE id IN (${placeholders}) AND scope = ?`
      )
      .run(...ids, scope);
  }
  return rows.map(decodeRow);
}

/** The top-importance memories for a scope (used to seed the system prompt). */
export function topMemories(limit = 8): MemoryRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT id, kind, content, importance, createdAt, lastUsedAt
       FROM memories WHERE scope = ?
       ORDER BY importance DESC, COALESCE(lastUsedAt, createdAt) DESC, id DESC
       LIMIT ?`
    )
    .all(currentScope(), limit) as MemoryRow[];
  return rows.map(decodeRow);
}

/** List recent memories for review (most recent first). */
export function listMemories(limit = 50): MemoryRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT id, kind, content, importance, createdAt, lastUsedAt
       FROM memories WHERE scope = ? ORDER BY id DESC LIMIT ?`
    )
    .all(currentScope(), limit) as MemoryRow[];
  return rows.map(decodeRow);
}

/** Forget (delete) a memory by id within the current scope. Returns true if removed. */
export function forget(id: number): boolean {
  const info = getDb()
    .prepare("DELETE FROM memories WHERE id = ? AND scope = ?")
    .run(id, currentScope());
  return info.changes > 0;
}

/** Count memories in the current scope. */
export function countMemories(): number {
  const r = getDb()
    .prepare("SELECT COUNT(*) AS n FROM memories WHERE scope = ?")
    .get(currentScope()) as { n: number };
  return r.n;
}

export { isEncryptionEnabled };
