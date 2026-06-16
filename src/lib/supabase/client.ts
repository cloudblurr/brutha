import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * Browser Supabase client (client components).
 *
 * Reads the public anon key + URL from NEXT_PUBLIC_* env. All requests are made
 * as the signed-in user, so Row Level Security enforces per-user data access.
 * A single instance is memoized per browser tab.
 */
let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (client) return client;
  client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return client;
}
