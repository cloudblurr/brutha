import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

/**
 * Server Supabase client (route handlers, server components, server actions).
 *
 * Bound to the request's cookies so it acts as the signed-in user — Row Level
 * Security then scopes every query to that user's data. Auth token refreshes
 * are written back to the cookie jar.
 *
 * In React Server Components the cookie store is read-only; the try/catch around
 * `set` swallows the resulting error (the session is still refreshed by the
 * middleware on the next request).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — safe to ignore; middleware
            // refreshes the session cookie on the next request.
          }
        },
      },
    }
  );
}
