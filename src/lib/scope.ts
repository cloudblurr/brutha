import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";

/**
 * Request-scoped Supabase context.
 *
 * Tools (contacts, notes, tasks) need a Supabase client that acts as the
 * current user so Row Level Security scopes every query to that user's data.
 * The AI SDK's tool `execute` functions don't receive a client, and threading
 * one through every signature would be invasive.
 *
 * Instead we stash an RLS-scoped Supabase client in AsyncLocalStorage at the
 * request boundary (the chat route, or the worker Edge Function for background
 * jobs), and any tool reads it back via `currentDb()`. AsyncLocalStorage
 * propagates across awaits, so the value is correct through the agent's async
 * tool loop.
 *
 * This replaces the old text "scope" string: RLS now enforces ownership, so the
 * client itself *is* the scope.
 */

export type Db = SupabaseClient<Database>;

interface ScopeStore {
  db: Db;
  userId: string;
}

const storage = new AsyncLocalStorage<ScopeStore>();

/**
 * Run `fn` with the given RLS-scoped Supabase client + user id bound to the
 * async context. Everything awaited inside (including agent tool calls) sees it.
 */
export function runWithDb<T>(db: Db, userId: string, fn: () => T): T {
  return storage.run({ db, userId }, fn);
}

/**
 * The current request's RLS-scoped Supabase client. Throws if called outside a
 * `runWithDb(...)` context — a programming error, since every tool invocation
 * is wrapped at the request boundary.
 */
export function currentDb(): Db {
  const store = storage.getStore();
  if (!store) {
    throw new Error(
      "No Supabase context bound. A tool ran outside runWithDb() — wrap the agent call at the request boundary."
    );
  }
  return store.db;
}

/** The current user's id, or null when no context is bound. */
export function currentUserId(): string | null {
  return storage.getStore()?.userId ?? null;
}
