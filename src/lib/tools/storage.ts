import { tool } from "ai";
import { z } from "zod";
import { getDb } from "../db";
import { currentScope } from "../scope";

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Storage tools (contacts, notes, tasks) are PER-USER scoped.
 *
 * Every row carries a `scope` column equal to its owner's user id (or "global"
 * for the unauthenticated single-operator fallback). The scope for the current
 * request is read from AsyncLocalStorage via `currentScope()` — set at the
 * request boundary by the chat/workers routes. All reads, updates and deletes
 * filter by scope so users can only ever see and mutate their own data.
 */

export const storageTools = {
  // ---------- Contacts ----------
  saveContact: tool({
    description:
      "Save or store a person's contact information (name, and optionally email, phone, notes) for later lookup.",
    inputSchema: z.object({
      name: z.string().describe("The person's full name"),
      email: z.string().optional(),
      phone: z.string().optional(),
      notes: z.string().optional(),
    }),
    execute: async ({ name, email, phone, notes }) => {
      try {
        const info = getDb()
          .prepare(
            "INSERT INTO contacts (name, email, phone, notes, scope) VALUES (?, ?, ?, ?, ?)"
          )
          .run(name, email ?? null, phone ?? null, notes ?? null, currentScope());
        return { saved: true, id: Number(info.lastInsertRowid), name };
      } catch (e) {
        return { error: `Failed to save contact: ${errMsg(e)}` };
      }
    },
  }),

  findContact: tool({
    description:
      "Look up saved contacts by name, email, or phone (partial matches). Use before emailing someone whose address you don't have.",
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }) => {
      try {
        const like = `%${query}%`;
        const rows = getDb()
          .prepare(
            `SELECT id, name, email, phone, notes FROM contacts
             WHERE scope = ? AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)
             ORDER BY name LIMIT 10`
          )
          .all(currentScope(), like, like, like);
        return { count: rows.length, contacts: rows };
      } catch (e) {
        return { error: `Failed to search contacts: ${errMsg(e)}` };
      }
    },
  }),

  listContacts: tool({
    description: "List all saved contacts.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const rows = getDb()
          .prepare(
            "SELECT id, name, email, phone FROM contacts WHERE scope = ? ORDER BY name LIMIT 100"
          )
          .all(currentScope());
        return { count: rows.length, contacts: rows };
      } catch (e) {
        return { error: `Failed to list contacts: ${errMsg(e)}` };
      }
    },
  }),

  updateContact: tool({
    description:
      "Update fields of an existing contact by id. Only provided fields change.",
    inputSchema: z.object({
      id: z.number().int(),
      name: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      notes: z.string().optional(),
    }),
    execute: async ({ id, name, email, phone, notes }) => {
      try {
        const sets: string[] = [];
        const vals: unknown[] = [];
        if (name !== undefined) {
          sets.push("name = ?");
          vals.push(name);
        }
        if (email !== undefined) {
          sets.push("email = ?");
          vals.push(email);
        }
        if (phone !== undefined) {
          sets.push("phone = ?");
          vals.push(phone);
        }
        if (notes !== undefined) {
          sets.push("notes = ?");
          vals.push(notes);
        }
        if (sets.length === 0) return { error: "No fields to update." };
        vals.push(id, currentScope());
        const info = getDb()
          .prepare(`UPDATE contacts SET ${sets.join(", ")} WHERE id = ? AND scope = ?`)
          .run(...vals);
        return info.changes
          ? { updated: true, id }
          : { error: `No contact with id ${id}.` };
      } catch (e) {
        return { error: `Failed to update contact: ${errMsg(e)}` };
      }
    },
  }),

  deleteContact: tool({
    description: "Delete a contact by id.",
    inputSchema: z.object({ id: z.number().int() }),
    execute: async ({ id }) => {
      try {
        const info = getDb()
          .prepare("DELETE FROM contacts WHERE id = ? AND scope = ?")
          .run(id, currentScope());
        return info.changes
          ? { deleted: true, id }
          : { error: `No contact with id ${id}.` };
      } catch (e) {
        return { error: `Failed to delete contact: ${errMsg(e)}` };
      }
    },
  }),

  // ---------- Notes ----------
  saveNote: tool({
    description:
      "Save a freeform note or piece of information for later retrieval.",
    inputSchema: z.object({
      content: z.string(),
      title: z.string().optional(),
    }),
    execute: async ({ content, title }) => {
      try {
        const info = getDb()
          .prepare("INSERT INTO notes (title, content, scope) VALUES (?, ?, ?)")
          .run(title ?? null, content, currentScope());
        return { saved: true, id: Number(info.lastInsertRowid), title };
      } catch (e) {
        return { error: `Failed to save note: ${errMsg(e)}` };
      }
    },
  }),

  searchNotes: tool({
    description: "Full-text search over saved notes by keyword.",
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }) => {
      try {
        const fts = query
          .split(/\s+/)
          .filter(Boolean)
          .map((t) => `"${t.replace(/"/g, '""')}"`)
          .join(" OR ");
        if (!fts) return { count: 0, notes: [] };
        const rows = getDb()
          .prepare(
            `SELECT n.id, n.title, n.content, n.createdAt
             FROM notes_fts f JOIN notes n ON n.id = f.rowid
             WHERE notes_fts MATCH ? AND n.scope = ? ORDER BY rank LIMIT 10`
          )
          .all(fts, currentScope());
        return { count: rows.length, notes: rows };
      } catch (e) {
        return { error: `Failed to search notes: ${errMsg(e)}` };
      }
    },
  }),

  listNotes: tool({
    description: "List recent saved notes.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const rows = getDb()
          .prepare(
            "SELECT id, title, content, createdAt FROM notes WHERE scope = ? ORDER BY id DESC LIMIT 50"
          )
          .all(currentScope());
        return { count: rows.length, notes: rows };
      } catch (e) {
        return { error: `Failed to list notes: ${errMsg(e)}` };
      }
    },
  }),

  deleteNote: tool({
    description: "Delete a note by id.",
    inputSchema: z.object({ id: z.number().int() }),
    execute: async ({ id }) => {
      try {
        const info = getDb()
          .prepare("DELETE FROM notes WHERE id = ? AND scope = ?")
          .run(id, currentScope());
        return info.changes
          ? { deleted: true, id }
          : { error: `No note with id ${id}.` };
      } catch (e) {
        return { error: `Failed to delete note: ${errMsg(e)}` };
      }
    },
  }),

  // ---------- Tasks / reminders ----------
  addTask: tool({
    description:
      "Add a to-do task or reminder, optionally with a due date/time (ISO or natural text).",
    inputSchema: z.object({
      task: z.string(),
      due: z.string().optional().describe("Due date/time, e.g. '2026-07-01' or 'tomorrow 9am'"),
    }),
    execute: async ({ task, due }) => {
      try {
        const info = getDb()
          .prepare("INSERT INTO tasks (task, due, scope) VALUES (?, ?, ?)")
          .run(task, due ?? null, currentScope());
        return { added: true, id: Number(info.lastInsertRowid), task, due };
      } catch (e) {
        return { error: `Failed to add task: ${errMsg(e)}` };
      }
    },
  }),

  listTasks: tool({
    description: "List tasks. By default shows only open (not done) tasks.",
    inputSchema: z.object({
      includeDone: z.boolean().optional().describe("Include completed tasks"),
    }),
    execute: async ({ includeDone }) => {
      try {
        const doneClause = includeDone ? "" : "AND done = 0";
        const rows = getDb()
          .prepare(
            `SELECT id, task, due, done FROM tasks WHERE scope = ? ${doneClause} ORDER BY done, id LIMIT 100`
          )
          .all(currentScope());
        return { count: rows.length, tasks: rows };
      } catch (e) {
        return { error: `Failed to list tasks: ${errMsg(e)}` };
      }
    },
  }),

  completeTask: tool({
    description: "Mark a task as done by id.",
    inputSchema: z.object({ id: z.number().int() }),
    execute: async ({ id }) => {
      try {
        const info = getDb()
          .prepare("UPDATE tasks SET done = 1 WHERE id = ? AND scope = ?")
          .run(id, currentScope());
        return info.changes
          ? { completed: true, id }
          : { error: `No task with id ${id}.` };
      } catch (e) {
        return { error: `Failed to complete task: ${errMsg(e)}` };
      }
    },
  }),

  deleteTask: tool({
    description: "Delete a task by id.",
    inputSchema: z.object({ id: z.number().int() }),
    execute: async ({ id }) => {
      try {
        const info = getDb()
          .prepare("DELETE FROM tasks WHERE id = ? AND scope = ?")
          .run(id, currentScope());
        return info.changes
          ? { deleted: true, id }
          : { error: `No task with id ${id}.` };
      } catch (e) {
        return { error: `Failed to delete task: ${errMsg(e)}` };
      }
    },
  }),
};
