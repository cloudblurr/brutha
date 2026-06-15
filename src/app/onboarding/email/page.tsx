"use client";

import { useEffect, useState } from "react";

/**
 * Email identity onboarding page.
 *
 * Lets the operator set the "From" name + address used when the agent sends
 * email. Persists to the settings table via /api/settings/email. SMTP
 * transport credentials still come from .env.local; this only controls the
 * visible sender identity. Once auth/multi-user lands, this same form keys off
 * the session user so each user configures their own sender.
 */

type Info = {
  from: string | null;
  source: "settings" | "env" | "unset";
  smtpConfigured: boolean;
};

export default function EmailOnboardingPage() {
  const [info, setInfo] = useState<Info | null>(null);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/email")
      .then((r) => r.json())
      .then((d: Info) => {
        setInfo(d);
        setValue(d.from ?? "");
      })
      .catch(() => setStatus("Failed to load current settings."));
  }, []);

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/settings/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error ?? "Save failed.");
      } else {
        setStatus("Saved. The agent will send as this identity.");
        setInfo((p) => (p ? { ...p, from: data.from, source: "settings" } : p));
      }
    } catch {
      setStatus("Network error while saving.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Email identity</h1>
      <p className="mt-1 text-sm text-[var(--fg-muted)]">
        Set the name and address the agent sends email from.
      </p>

      {info && !info.smtpConfigured && (
        <div className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          SMTP transport is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER,
          and SMTP_PASS in <code>.env.local</code> for sending to work.
        </div>
      )}

      <label className="mt-8 block text-sm font-medium" htmlFor="from">
        From identity
      </label>
      <input
        id="from"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="BRUTHA &lt;you@example.com&gt;"
        className="mt-2 w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-[var(--accent,#6366f1)]"
      />
      <p className="mt-2 text-xs text-[var(--fg-subtle)]">
        Format: <code>Display Name &lt;address@example.com&gt;</code> or just an
        address. Currently resolved from:{" "}
        <span className="font-mono">{info?.source ?? "…"}</span>.
      </p>

      <button
        onClick={save}
        disabled={saving || !value.trim()}
        className="mt-5 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save identity"}
      </button>

      {status && (
        <p className="mt-4 text-sm text-[var(--fg-muted)]">{status}</p>
      )}
    </main>
  );
}
