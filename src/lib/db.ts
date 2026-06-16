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
  {
    version: 4,
    name: "per-user-scoping",
    up: (d) => {
      // Add a `scope` column to every per-user table so rows can be filtered by
      // owner. Existing rows belong to the pre-auth single-operator 'global'
      // scope, preserving backward compatibility. Once a user signs in, their
      // user id becomes the scope.
      //
      // SQLite's ALTER TABLE ADD COLUMN can't add a NOT NULL column without a
      // constant default, but a DEFAULT 'global' is constant, so this is safe
      // and backfills existing rows to 'global' automatically.
      d.exec(`
        ALTER TABLE contacts ADD COLUMN scope TEXT NOT NULL DEFAULT 'global';
        ALTER TABLE notes    ADD COLUMN scope TEXT NOT NULL DEFAULT 'global';
        ALTER TABLE tasks    ADD COLUMN scope TEXT NOT NULL DEFAULT 'global';

        CREATE INDEX IF NOT EXISTS contacts_scope ON contacts (scope);
        CREATE INDEX IF NOT EXISTS notes_scope    ON notes (scope);
        CREATE INDEX IF NOT EXISTS tasks_scope     ON tasks (scope);
      `);

      // Durable-workers bookkeeping: a worker may be backed by a Temporal
      // workflow. Track its id and the durability mode so the app can resume /
      // reconcile after a restart.
      d.exec(`
        ALTER TABLE workers ADD COLUMN workflowId TEXT;
        ALTER TABLE workers ADD COLUMN durable    INTEGER NOT NULL DEFAULT 0;
      `);

      // Users table for Auth.js (credentials provider hashes live here; OAuth
      // users are upserted on sign-in). Auth.js itself uses JWT sessions in
      // this setup, so we only persist the canonical user record + optional
      // password hash for the dev credentials provider.
      d.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id           TEXT PRIMARY KEY,
          email        TEXT UNIQUE NOT NULL,
          name         TEXT,
          image        TEXT,
          passwordHash TEXT,
          provider     TEXT NOT NULL DEFAULT 'credentials',
          createdAt    TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    },
  },
  {
    version: 5,
    name: "worker-progress",
    up: (d) => {
      // Live progress line for a running worker (e.g. "Step 2 · calling
      // getWeather"). Updated by the agent's onStepFinish hook and polled by
      // the Workers panel so users see motion instead of a frozen "running".
      d.exec(`ALTER TABLE workers ADD COLUMN progress TEXT;`);
    },
  },
  {
    version: 6,
    name: "push-subscriptions",
    up: (d) => {
      // Web Push subscriptions for installable-PWA notifications. Each row is
      // one browser/device subscription, scoped to the owning user so a push
      // (reminder fired, background worker finished, alert) reaches only that
      // user's devices. The endpoint is unique; re-subscribing upserts.
      d.exec(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          scope     TEXT NOT NULL DEFAULT 'global',
          endpoint  TEXT NOT NULL UNIQUE,
          p256dh    TEXT NOT NULL,
          auth      TEXT NOT NULL,
          userAgent TEXT,
          createdAt TEXT NOT NULL DEFAULT (datetime('now')),
          lastUsedAt TEXT
        );
        CREATE INDEX IF NOT EXISTS push_subscriptions_scope
          ON push_subscriptions (scope);
      `);
    },
  },
  {
    version: 7,
    name: "agent-memory",
    up: (d) => {
      // Deep, persistent agent memory: durable per-user facts/context the agent
      // recalls across sessions. `content` is stored ENCRYPTED-AT-REST (an
      // opaque envelope from lib/crypto/secretbox) when MEMORY_SECRET is set,
      // and as tagged plaintext otherwise — so the column is always a string and
      // the store decrypts on read. `keywords` holds a lowercase, non-sensitive
      // search surface (extracted terms) so FTS works WITHOUT decrypting every
      // row. `kind` groups memories (fact/preference/context/event); importance
      // (1-5) biases recall ranking; lastUsedAt supports recency.
      d.exec(`
        CREATE TABLE IF NOT EXISTS memories (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          scope      TEXT NOT NULL DEFAULT 'global',
          kind       TEXT NOT NULL DEFAULT 'fact',
          content    TEXT NOT NULL,
          keywords   TEXT NOT NULL DEFAULT '',
          importance INTEGER NOT NULL DEFAULT 3,
          createdAt  TEXT NOT NULL DEFAULT (datetime('now')),
          lastUsedAt TEXT
        );
        CREATE INDEX IF NOT EXISTS memories_scope ON memories (scope);
        CREATE INDEX IF NOT EXISTS memories_scope_importance
          ON memories (scope, importance);

        -- FTS over the non-sensitive keyword surface only.
        CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts
          USING fts5(keywords, content='memories', content_rowid='id');

        CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
          INSERT INTO memories_fts(rowid, keywords) VALUES (new.id, new.keywords);
        END;
        CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
          INSERT INTO memories_fts(memories_fts, rowid, keywords)
          VALUES ('delete', old.id, old.keywords);
        END;
        CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
          INSERT INTO memories_fts(memories_fts, rowid, keywords)
          VALUES ('delete', old.id, old.keywords);
          INSERT INTO memories_fts(rowid, keywords) VALUES (new.id, new.keywords);
        END;
      `);

      // Tag notes with their source so voice-captured notes are first-class and
      // filterable. Existing rows default to 'typed'.
      d.exec(`ALTER TABLE notes ADD COLUMN source TEXT NOT NULL DEFAULT 'typed';`);
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

  // Ensure the data directory exists and is writable. On serverless platforms
  // (Vercel) or misconfigured container volumes the filesystem is read-only or
  // owned by another uid — fail with an actionable message instead of a cryptic
  // SQLITE_CANTOPEN surfacing as a 500 deep inside a route.
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.accessSync(DATA_DIR, fs.constants.W_OK);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Data directory '${DATA_DIR}' is not writable (${detail}). ` +
        `BRUTHA stores its SQLite DB and uploads here and needs a PERSISTENT, ` +
        `WRITABLE disk. This will NOT work on Vercel/serverless (read-only FS). ` +
        `Deploy on a host with a writable volume mounted at this path, owned by ` +
        `the runtime user (uid 1001 in the provided Docker image). See DEPLOYMENT.md.`
    );
  }

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  runMigrations(db);

  return db;
}
