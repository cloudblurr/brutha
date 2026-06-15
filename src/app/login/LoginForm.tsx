"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { LogIn } from "../icons";

/**
 * Client-side login form used by /login.
 *
 * Mirrors the SettingsModal sign-in UX but as a full page: OAuth buttons for
 * whichever providers the server has configured (discovered via
 * /api/auth/providers) plus an email/password credentials form. On success
 * Auth.js redirects to `callbackUrl` (default "/").
 */

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "Invalid email or password.",
  OAuthAccountNotLinked:
    "That email is already linked to a different sign-in method.",
  default: "Could not sign you in. Please try again.",
};

export function LoginForm({
  callbackUrl = "/",
  initialError,
}: {
  callbackUrl?: string;
  initialError?: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError ? ERROR_MESSAGES[initialError] ?? ERROR_MESSAGES.default : null
  );
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((d: Record<string, { id: string; name: string }>) =>
        setProviders(
          Object.values(d ?? {}).filter(
            (p) => p.id === "github" || p.id === "google"
          )
        )
      )
      .catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    const res = await signIn("credentials", {
      email: email.trim(),
      password,
      redirect: false,
    });
    if (res?.error) {
      setError(ERROR_MESSAGES.CredentialsSignin);
      setBusy(false);
    } else {
      // Full reload so the server session is picked up everywhere.
      window.location.href = callbackUrl;
    }
  }

  return (
    <div className="space-y-3">
      {providers.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => signIn(p.id, { callbackUrl })}
          className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-[var(--hover)]"
        >
          <LogIn className="h-[16px] w-[16px]" /> Continue with {p.name}
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
