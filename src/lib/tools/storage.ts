import { tool } from "ai";
import { z } from "zod";
import { currentDb } from "../scope";
import type { Database } from "../supabase/database.types";

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Storage tools (contacts, notes, tasks) — backed by Supabase Postgres.
 *
 * Per-user isolation is enforced by Row Level Security: every table has an
 * `owner` column defaulting to auth.uid(), and policies restrict all access to
 * `owner = auth.uid()`. The Supabase client bound to the request (via
 * `currentDb()`) carries the user's JWT, so RLS scopes every read/write to that
 * user automatically — no manual scope filtering needed.
 *
 * Notes full-text search uses the Postgres `search_notes` RPC (tsvector +
 * websearch_to_tsquery), the direct replacement for the old SQLite FTS5 table.
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
        const { data, error } = await currentDb()
          .from("contacts")
          .insert({ name, email: email ?? null, phone: phone ?? null, notes: notes ?? null })
          .select("id")
          .single();
        if (error) throw error;
        return { saved: true, id: data.id, name };
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
        const { data, error } = await currentDb()
          .from("contacts")
          .select("id, name, email, phone, notes")
          .or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
          .order("name")
          .limit(10);
        if (error) throw error;
        return { count: data.length, contacts: data };
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
        const { data, error } = await currentDb()
          .from("contacts")
          .select("id, name, email, phone")
          .order("name")
          .limit(100);
        if (error) throw error;
        return { count: data.length, contacts: data };
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
        const patch: Database["public"]["Tables"]["contacts"]["Update"] = {};
        if (name !== undefined) patch.name = name;
        if (email !== undefined) patch.email = email;
        if (phone !== undefined) patch.phone = phone;
        if (notes !== undefined) patch.notes = notes;
        if (Object.keys(patch).length === 0) return { error: "No fields to update." };
        const { data, error } = await currentDb()
          .from("contacts")
          .update(patch)
          .eq("id", id)
          .select("id");
        if (error) throw error;
        return data.length
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
        const { data, error } = await currentDb()
          .from("contacts")
          .delete()
          .eq("id", id)
          .select("id");
        if (error) throw error;
        return data.length
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
        const { data, error } = await currentDb()
          .from("notes")
          .insert({ title: title ?? null, content })
          .select("id")
          .single();
        if (error) throw error;
        return { saved: true, id: data.id, title };
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
        const q = query.trim();
        if (!q) return { count: 0, notes: [] };
        const { data, error } = await currentDb().rpc("search_notes", {
          q,
          max_results: 10,
        });
        if (error) throw error;
        return { count: data.length, notes: data };
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
        const { data, error } = await currentDb()
          .from("notes")
          .select("id, title, content, created_at")
          .order("id", { ascending: false })
          .limit(50);
        if (error) throw error;
        return { count: data.length, notes: data };
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
        const { data, error } = await currentDb()
          .from("notes")
          .delete()
          .eq("id", id)
          .select("id");
        if (error) throw error;
        return data.length
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
        const { data, error } = await currentDb()
          .from("tasks")
          .insert({ task, due: due ?? null })
          .select("id")
          .single();
        if (error) throw error;
        return { added: true, id: data.id, task, due };
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
        let q = currentDb()
          .from("tasks")
          .select("id, task, due, done");
        if (!includeDone) q = q.eq("done", false);
        const { data, error } = await q
          .order("done")
          .order("id")
          .limit(100);
        if (error) throw error;
        return { count: data.length, tasks: data };
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
        const { data, error } = await currentDb()
          .from("tasks")
          .update({ done: true })
          .eq("id", id)
          .select("id");
        if (error) throw error;
        return data.length
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
        const { data, error } = await currentDb()
          .from("tasks")
          .delete()
          .eq("id", id)
          .select("id");
        if (error) throw error;
        return data.length
          ? { deleted: true, id }
          : { error: `No task with id ${id}.` };
      } catch (e) {
        return { error: `Failed to delete task: ${errMsg(e)}` };
      }
    },
  }),
};
