"use client";

import { useState } from "react";
import { LogIn } from "../icons";
import { useAuth } from "../AuthProvider";

/**
 * Client-side login form used by /login.
 *
 * OAuth buttons for providers configured via NEXT_PUBLIC_AUTH_PROVIDERS, plus an
 * email/password form backed by Supabase Auth. On success we redirect to
 * `redirectTo` (default "/"). A failed sign-in for a non-existent account falls
 * back to sign-up so the combined "Sign in / Sign up" UX is preserved.
 */

function configuredProviders(): ("github" | "google")[] {
  const raw = process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is "github" | "google" => s === "github" || s === "google");
}

export function LoginForm({
  redirectTo = "/",
  initialError,
}: {
  redirectTo?: string;
  initialError?: string;
}) {
  const { signInWithPassword, signUpWithPassword, signInWithOAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError ? "Could not sign you in. Please try again." : null
  );
  const providers = configuredProviders();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);

    let { error: err } = await signInWithPassword(email.trim(), password);
    if (err && /invalid login credentials/i.test(err)) {
      const up = await signUpWithPassword(email.trim(), password);
      err = up.error;
    }

    if (err) {
      setError(err);
      setBusy(false);
    } else {
      // Full reload so the server session cookie is picked up everywhere.
      window.location.href = redirectTo;
    }
  }

  return (
    <div className="space-y-3">
      {providers.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => signInWithOAuth(p)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-[var(--hover)]"
        >
          <LogIn className="h-[16px] w-[16px]" /> Continue with{" "}
          {p === "github" ? "GitHub" : "Google"}
        </button>
      ))}

      {providers.length > 0 && (
        <div className="flex items-center gap-2 py-1 text-[11px] text-[var(--fg-subtle)]">
          <span className="h-px flex-1 bg-[var(--border)]" /> or email{" "}
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-3">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          type="email"
          autoComplete="email"
          className="w-full rounded-lg border bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent,#6366f1)]"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
          autoComplete="current-password"
          className="w-full rounded-lg border bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent,#6366f1)]"
        />
        {error && (
          <p className="text-xs text-red-500 dark:text-red-300">{error}</p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--accent,#6366f1)] px-3 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          <LogIn className="h-[16px] w-[16px]" />
          {busy ? "Signing in…" : "Sign in / Sign up"}
        </button>
      </form>

      <p className="pt-2 text-center text-[11px] text-[var(--fg-subtle)]">
        New here? Signing in with an email creates your account.
      </p>
    </div>
  );
}
