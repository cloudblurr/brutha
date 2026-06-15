import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped user context.
 *
 * Tools (contacts, notes, tasks, workers) need to know *which user* is making
 * the request so they can read/write only that user's data. The AI SDK's
 * tool `execute` functions don't receive a user id, and threading one through
 * every signature would be invasive and error-prone.
 *
 * Instead we stash the current scope in an AsyncLocalStorage store at the
 * request boundary (the chat / workers / settings routes call
 * `runWithScope(scope, fn)`), and any tool reads it back via `currentScope()`.
 * AsyncLocalStorage propagates across awaits within the same async context, so
 * the value is correct even through the agent's async tool loop.
 *
 * The scope value is the signed-in user's id, or the string "global" for the
 * pre-auth / unauthenticated single-operator fallback. Using "global" as the
 * default keeps all existing behaviour and data intact when no user is signed
 * in.
 */

export const GLOBAL_SCOPE = "global";

interface ScopeStore {
  scope: string;
}

const storage = new AsyncLocalStorage<ScopeStore>();

/**
 * Run `fn` with the given user scope bound to the async context. Everything
 * awaited inside `fn` (including agent tool calls) sees this scope.
 */
export function runWithScope<T>(scope: string | null | undefined, fn: () => T): T {
  return storage.run({ scope: normalizeScope(scope) }, fn);
}

/** The current request's user scope, or "global" when none is bound. */
export function currentScope(): string {
  return storage.getStore()?.scope ?? GLOBAL_SCOPE;
}

/** Normalize a possibly-empty scope to a safe non-empty value. */
export function normalizeScope(scope: string | null | undefined): string {
  const s = (scope ?? "").trim();
  return s || GLOBAL_SCOPE;
}
