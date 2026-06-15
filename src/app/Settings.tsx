"use client";

import { useEffect, useState } from "react";
import { useSession, signIn as nextSignIn, signOut as nextSignOut } from "next-auth/react";
import { Settings, User, X, LogIn, LogOut, Sun, Moon } from "./icons";

/**
 * Settings menu + Profile modal backed by real Auth.js sessions.
 *
 * `useAuth()` wraps next-auth's useSession() and exposes the same shape the UI
 * already consumed from the old mock (user / ready / signOut), plus credential
 * + OAuth sign-in helpers. OAuth buttons only render for providers the server
 * actually has configured (discovered via /api/auth/providers).
 */

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

export function useAuth() {
  const { data, status } = useSession();
  const user: AuthUser | null = data?.user
    ? {
        id: data.user.id,
        name: data.user.name ?? data.user.email ?? "User",
        email: data.user.email ?? "",
        image: data.user.image,
      }
    : null;
  return {
    user,
    ready: status !== "loading",
    signOut: () => nextSignOut({ redirect: false }),
  };
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Avatar button that opens the settings/profile menu. */
export function AccountButton({
  user,
  onOpen,
}: {
  user: AuthUser | null;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Account and settings"
      className="msg-action grid h-9 w-9 place-items-center rounded-full"
    >
      {user ? (
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--accent,#6366f1)] text-[11px] font-semibold text-white">
          {initials(user.name)}
        </span>
      ) : (
        <User className="h-[18px] w-[18px]" />
      )}
    </button>
  );
}

export function SettingsModal({
  open,
  onClose,
  user,
  signOut,
  theme,
  onToggleTheme,
}: {
  open: boolean;
  onClose: () => void;
  user: AuthUser | null;
  signOut: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [oauthProviders, setOauthProviders] = useState<
    { id: string; name: string }[]
  >([]);
  const [emailFrom, setEmailFrom] = useState("");
  const [emailStatus, setEmailStatus] = useState<string | null>(null);

  // Load the email identity + which OAuth providers are configured.
  useEffect(() => {
    if (!open) return;
    fetch("/api/settings/email")
      .then((r) => r.json())
      .then((d) => setEmailFrom(d.from ?? ""))
      .catch(() => {});
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((d: Record<string, { id: string; name: string }>) => {
        const list = Object.values(d ?? {}).filter(
          (p) => p.id === "github" || p.id === "google"
        );
        setOauthProviders(list);
      })
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  async function saveEmail() {
    setEmailStatus(null);
    const res = await fetch("/api/settings/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: emailFrom }),
    });
    const d = await res.json();
    setEmailStatus(res.ok ? "Saved." : d.error ?? "Failed.");
  }

  async function doSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!signInEmail.trim() || !signInPassword) return;
    setSigningIn(true);
    setSignInError(null);
    const res = await nextSignIn("credentials", {
      email: signInEmail.trim(),
      password: signInPassword,
      redirect: false,
    });
    setSigningIn(false);
    if (res?.error) {
      setSignInError("Invalid email or password.");
    } else {
      setSignInPassword("");
    }
  }

  return (
    <div className="modal-backdrop grid place-items-center p-4" onClick={onClose}>
      <div
        className="modal-panel w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Settings className="h-[18px] w-[18px]" /> Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="msg-action grid h-8 w-8 place-items-center"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        {/* Profile / auth section */}
        <section className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--fg-subtle)]">
            Profile
          </h3>
          {user ? (
            <div className="mt-3 flex items-center gap-3 rounded-xl border p-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--accent,#6366f1)] text-sm font-semibold text-white">
                {initials(user.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-[var(--fg-muted)]">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={signOut}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-[var(--hover)]"
              >
                <LogOut className="h-[15px] w-[15px]" /> Sign out
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {oauthProviders.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => nextSignIn(p.id)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-[var(--hover)]"
                >
                  <LogIn className="h-[16px] w-[16px]" /> Continue with {p.name}
                </button>
              ))}

              {oauthProviders.length > 0 && (
                <div className="flex items-center gap-2 py-1 text-[11px] text-[var(--fg-subtle)]">
                  <span className="h-px flex-1 bg-[var(--border)]" /> or email{" "}
                  <span className="h-px flex-1 bg-[var(--border)]" />
                </div>
              )}

              <form onSubmit={doSignIn} className="space-y-2">
                <input
                  value={signInEmail}
                  onChange={(e) => setSignInEmail(e.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  autoComplete="email"
                  className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
                />
                <input
                  value={signInPassword}
                  onChange={(e) => setSignInPassword(e.target.value)}
                  placeholder="Password"
                  type="password"
                  autoComplete="current-password"
                  className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
                />
                {signInError && (
                  <p className="text-xs text-red-500 dark:text-red-300">{signInError}</p>
                )}
                <button
                  type="submit"
                  disabled={signingIn}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-[var(--hover)] disabled:opacity-50"
                >
                  <LogIn className="h-[16px] w-[16px]" />
                  {signingIn ? "Signing in…" : "Sign in / Sign up"}
                </button>
              </form>
            </div>
          )}
        </section>

        {/* Appearance */}
        <section className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--fg-subtle)]">
            Appearance
          </h3>
          <button
            type="button"
            onClick={onToggleTheme}
            className="mt-3 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-[var(--hover)]"
          >
            {theme === "dark" ? <Sun className="h-[16px] w-[16px]" /> : <Moon className="h-[16px] w-[16px]" />}
            {theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          </button>
        </section>

        {/* Email identity */}
        <section className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--fg-subtle)]">
            Email identity
          </h3>
          <p className="mt-1 text-xs text-[var(--fg-muted)]">
            Name + address the agent sends email from.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              value={emailFrom}
              onChange={(e) => setEmailFrom(e.target.value)}
              placeholder="BRUTHA <you@example.com>"
              className="min-w-0 flex-1 rounded-lg border bg-transparent px-3 py-2 font-mono text-xs outline-none"
            />
            <button
              type="button"
              onClick={saveEmail}
              className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-[var(--hover)]"
            >
              Save
            </button>
          </div>
          {emailStatus && (
            <p className="mt-1.5 text-xs text-[var(--fg-muted)]">{emailStatus}</p>
          )}
        </section>
      </div>
    </div>
  );
}
