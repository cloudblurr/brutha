import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

/**
 * Local SQLite store for contacts, notes, and tasks. The DB file lives in
 * ./data (gitignored). A single shared connection is reused across requests.
 *
 * Schema changes are applied through a lightweight versioned migration system
 * (S12): each migration has an integer version and an `up` function. The
 * current schema version is tracked in a `meta` table, and any pending
 * migrations run automatically on first connection.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "agent.db");

let db: Database.Database | null = null;

interface Migration {
  version: number;
  name: string;
  up: (d: Database.Database) => void;
}

/**
 * Ordered list of migrations. To evolve the schema, append a new entry with the
 * next version number — never edit a migration that has already shipped.
 */
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial-schema",
    up: (d) => {
      d.exec(`
        CREATE TABLE IF NOT EXISTS contacts (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          name      TEXT NOT NULL,
          email     TEXT,
          phone     TEXT,
          notes     TEXT,
          createdAt TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS notes (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          title     TEXT,
          content   TEXT NOT NULL,
          createdAt TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS tasks (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          task      TEXT NOT NULL,
          due       TEXT,
          done      INTEGER NOT NULL DEFAULT 0,
          createdAt TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Full-text index over notes (kept in sync via triggers).
        CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts
          USING fts5(title, content, content='notes', content_rowid='id');

        CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
          INSERT INTO notes_fts(rowid, title, content)
          VALUES (new.id, new.title, new.content);
        END;
        CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
          INSERT INTO notes_fts(notes_fts, rowid, title, content)
          VALUES ('delete', old.id, old.title, old.content);
        END;
        CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
          INSERT INTO notes_fts(notes_fts, rowid, title, content)
          VALUES ('delete', old.id, old.title, old.content);
          INSERT INTO notes_fts(rowid, title, content)
          VALUES (new.id, new.title, new.content);
        END;
      `);
    },
  },
  {
    version: 2,
    name: "settings-kv",
    up: (d) => {
      // Generic key/value settings store. Used today for the email "from"
      // identity configured during onboarding. The `scope` column is forward-
      // looking: it defaults to 'global' (single-operator), but once a real
      // users/auth system exists, per-user settings can be stored by setting
      // scope to a user id — no schema change required.
      d.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          scope     TEXT NOT NULL DEFAULT 'global',
          key       TEXT NOT NULL,
          value     TEXT NOT NULL,
          updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (scope, key)
        );
      `);
    },
  },
  {
    version: 3,
    name: "workers",
    up: (d) => {
      // BRUTHA Workers: background agent jobs created from natural language.
      // Each row is a task the agent runs autonomously in the background. The
      // app polls / lists these; status transitions queued -> running ->
      // done|error.
      d.exec(`
        CREATE TABLE IF NOT EXISTS workers (
          id        TEXT PRIMARY KEY,
          scope     TEXT NOT NULL DEFAULT 'global',
          title     TEXT NOT NULL,
          task      TEXT NOT NULL,
          status    TEXT NOT NULL DEFAULT 'queued',
          result    TEXT,
          error     TEXT,
          createdAt TEXT NOT NULL DEFAULT (datetime('now')),
          updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS workers_scope_status
          ON workers (scope, status);
      `);
    },
  },
];

/**
 * Read a single setting value for a scope (defaults to the global/operator
 * scope). Returns null when unset. Scope is forward-looking: pass a user id
 * once auth exists to get per-user settings.
 */
export function getSetting(key: string, scope = "global"): string | null {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE scope = ? AND key = ?")
    .get(scope, key) as { value: string } | undefined;
  return row ? row.value : null;
}

/** Upsert a single setting value for a scope. */
export function setSetting(key: string, value: string, scope = "global"): void {
  getDb()
    .prepare(
      `INSERT INTO settings (scope, key, value, updatedAt)
       VALUES (@scope, @key, @value, datetime('now'))
       ON CONFLICT(scope, key) DO UPDATE SET value = @value, updatedAt = datetime('now')`
    )
    .run({ scope, key, value });
}

/** Read the current schema version (0 if the meta table is empty/new). */
function getSchemaVersion(d: Database.Database): number {
  d.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  const row = d
    .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
    .get() as { value: string } | undefined;
  return row ? Number(row.value) : 0;
}

function setSchemaVersion(d: Database.Database, version: number): void {
  d.prepare(
    `INSERT INTO meta (key, value) VALUES ('schema_version', @v)
     ON CONFLICT(key) DO UPDATE SET value = @v`
  ).run({ v: String(version) });
}

/** Run any migrations whose version is greater than the current schema version. */
function runMigrations(d: Database.Database): void {
  const current = getSchemaVersion(d);
  const pending = MIGRATIONS.filter((m) => m.version > current).sort(
    (a, b) => a.version - b.version
  );
  for (const m of pending) {
    const tx = d.transaction(() => {
      m.up(d);
      setSchemaVersion(d, m.version);
    });
    tx();
    console.log(`[db] applied migration ${m.version} (${m.name})`);
  }
}

export function getDb(): Database.Database {
  if (db) return db;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  runMigrations(db);

  return db;
}
