import { currentDb, type Db } from "./scope";

/**
 * Per-user key/value settings, backed by the Supabase `settings` table.
 *
 * Replaces the old SQLite settings store. Row Level Security scopes rows to the
 * owner (auth.uid()), so callers don't pass a scope — the bound Supabase client
 * is the scope. Pass an explicit `db` only when running outside a request
 * context (e.g. an admin/service path) where there's no AsyncLocalStorage.
 */

/** Read a single setting value for the current user. Returns null when unset. */
export async function getSetting(
  key: string,
  db: Db = currentDb()
): Promise<string | null> {
  const { data, error } = await db
    .from("settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) return null;
  return data?.value ?? null;
}

/** Upsert a single setting value for the current user. */
export async function setSetting(
  key: string,
  value: string,
  db: Db = currentDb()
): Promise<void> {
  const { error } = await db
    .from("settings")
    .upsert({ key, value }, { onConflict: "owner,key" });
  if (error) throw error;
}
