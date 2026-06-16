"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Client-side auth context (Supabase).
 *
 * Replaces next-auth's SessionProvider + useSession(). Subscribes to Supabase
 * auth state changes so the UI updates instantly on sign-in / sign-out, and
 * exposes the credential + OAuth + sign-out helpers the UI needs.
 */

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean;
  signInWithPassword: (
    email: string,
    password: string
  ) => Promise<{ error: string | null }>;
  signUpWithPassword: (
    email: string,
    password: string
  ) => Promise<{ error: string | null }>;
  signInWithOAuth: (provider: "github" | "google") => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toAuthUser(u: User | null): AuthUser | null {
  if (!u) return null;
  const meta = u.user_metadata ?? {};
  return {
    id: u.id,
    name:
      (meta.name as string | undefined) ??
      (meta.full_name as string | undefined) ??
      u.email ??
      "User",
    email: u.email ?? "",
    image: (meta.avatar_url as string | undefined) ?? null,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(toAuthUser(data.user));
      setReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toAuthUser(session?.user ?? null));
      setReady(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const value: AuthContextValue = useMemo(
    () => ({
      user,
      ready,
      signInWithPassword: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        return { error: error?.message ?? null };
      },
      signUpWithPassword: async (email, password) => {
        const { error } = await supabase.auth.signUp({ email, password });
        return { error: error?.message ?? null };
      },
      signInWithOAuth: async (provider) => {
        await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: `${window.location.origin}/auth/callback`,
          },
        });
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [supabase, user, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Read the auth context. Mirrors the old `useAuth()` shape. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within <AuthProvider>.");
  }
  return ctx;
}
