import { createClient } from "./supabase/server";

/**
 * Server-side auth helpers (Supabase).
 *
 * Replaces the old next-auth `auth()` export. Components / routes that need the
 * signed-in user call `getCurrentUser()`, which reads the session from the
 * request cookies via the SSR Supabase client. Row Level Security does the
 * actual per-user data enforcement; these helpers just surface identity.
 */

export interface CurrentUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

/** The signed-in user for the current request, or null if unauthenticated. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const meta = user.user_metadata ?? {};
  return {
    id: user.id,
    email: user.email ?? null,
    name:
      (meta.name as string | undefined) ??
      (meta.full_name as string | undefined) ??
      user.email ??
      null,
    avatarUrl: (meta.avatar_url as string | undefined) ?? null,
  };
}

/** The signed-in user's id, or null when unauthenticated. */
export async function getCurrentUserId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id ?? null;
}
