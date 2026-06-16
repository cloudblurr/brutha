import { createClient } from "./supabase/server";
import { runWithDb, type Db } from "./scope";

/**
 * Resolve the per-request Supabase context (an RLS-scoped client + the
 * signed-in user's id) from the request cookies, and run `fn` with it bound.
 *
 * Returns null user when unauthenticated — callers that require auth should
 * check and return 401 before invoking the agent.
 *
 * This is the Supabase replacement for the old `resolveRequestScope()` +
 * `runWithScope()` pairing.
 */
export async function withRequestContext<T>(
  fn: (ctx: { db: Db; userId: string }) => T | Promise<T>
): Promise<{ userId: string | null; value?: T }> {
  const db = (await createClient()) as unknown as Db;
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) return { userId: null };

  const value = await runWithDb(db, user.id, () => fn({ db, userId: user.id }));
  return { userId: user.id, value };
}

/** Just the signed-in user's id for the current request (or null). */
export async function resolveUserId(): Promise<string | null> {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  return user?.id ?? null;
}
