"use client";

import { SessionProvider } from "next-auth/react";

/**
 * Client-side Auth.js session provider. Wraps the app so components can use
 * `useSession()` (and our `useAuth()` wrapper) to read the signed-in user.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
