import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

/**
 * Local SQLite store for contacts and notes. The DB file lives in ./data
 * (gitignored). A single shared connection is reused across requests.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "agent.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
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

  return db;
}
