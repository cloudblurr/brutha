import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Service-role Supabase client (server-only, privileged).
 *
 * Bypasses Row Level Security. Use ONLY in trusted server contexts that must
 * act outside a single user's scope — e.g. the worker dispatch path writing a
 * job's status/result back, or admin maintenance. NEVER import this into client
 * code: it carries the SUPABASE_SERVICE_ROLE_KEY.
 */
let admin: ReturnType<typeof createSupabaseClient<Database>> | null = null;

export function createAdminClient() {
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  admin = createSupabaseClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return admin;
}
