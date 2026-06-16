"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, X, Refresh } from "./icons";
import { createClient } from "@/lib/supabase/client";

/**
 * BRUTHA Workers panel — shows background agent jobs and their live status.
 *
 * Initial state is loaded from /api/workers, then we subscribe to Supabase
 * Realtime (postgres_changes on public.workers) for instant live updates —
 * replacing the old interval polling. RLS scopes the stream to the user's rows.
 */

interface Worker {
  id: string;
  title: string;
  task: string;
  status: "queued" | "running" | "done" | "error";
  result: string | null;
  error: string | null;
  progress: string | null;
  created_at: string;
}

export function WorkersPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/workers");
      const d = await r.json();
      setWorkers(d.workers ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  // Initial load whenever the panel opens.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [open, load]);

  // Live updates via Supabase Realtime while the panel is open.
  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    const channel = supabase
      .channel("workers-panel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workers" },
        (payload) => {
          setWorkers((prev) => {
            if (payload.eventType === "DELETE") {
              return prev.filter((w) => w.id !== (payload.old as Worker).id);
            }
            const row = payload.new as Worker;
            const idx = prev.findIndex((w) => w.id === row.id);
            if (idx === -1) return [row, ...prev];
            const next = prev.slice();
            next[idx] = row;
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop flex justify-end" onClick={onClose}>
      <aside
        className="modal-panel h-full w-full max-w-sm overflow-y-auto rounded-l-2xl rounded-r-none p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="BRUTHA Workers"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Bot className="h-[18px] w-[18px]" /> Workers
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={load}
              aria-label="Refresh"
              className="msg-action grid h-8 w-8 place-items-center"
            >
              <Refresh className="h-[15px] w-[15px]" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="msg-action grid h-8 w-8 place-items-center"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>

        <p className="mt-1 text-xs text-[var(--fg-muted)]">
          Background agents. Ask BRUTHA to do something “in the background” to spawn one.
        </p>

        <div className="mt-4 space-y-2">
          {workers.length === 0 ? (
            <p className="py-10 text-center text-sm text-[var(--fg-subtle)]">
              No workers yet.
            </p>
          ) : (
            workers.map((w) => (
              <div key={w.id} className="rounded-xl border p-3">
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === w.id ? null : w.id)}
                  className="flex w-full items-center gap-2 text-left"
                >
                  <span className={`worker-dot ${w.status}`} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {w.title}
                  </span>
                  <span className="text-[11px] uppercase tracking-wide text-[var(--fg-subtle)]">
                    {w.status}
                  </span>
                </button>
                {/* Live progress line while running. */}
                {w.status === "running" && w.progress && (
                  <p className="mt-1.5 flex items-center gap-1.5 truncate text-[11px] text-[var(--fg-muted)]">
                    <span className="worker-pulse" aria-hidden />
                    {w.progress}
                  </p>
                )}
                {expanded === w.id && (
                  <div className="mt-2 space-y-2 border-t pt-2 text-xs">
                    <p className="text-[var(--fg-muted)]">{w.task}</p>
                    {w.result && (
                      <p className="whitespace-pre-wrap rounded-lg bg-[var(--hover)] p-2">
                        {w.result}
                      </p>
                    )}
                    {w.error && (
                      <p className="rounded-lg bg-red-500/10 p-2 text-red-500 dark:text-red-300">
                        {w.error}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
