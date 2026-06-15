"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, X, Refresh } from "./icons";

/**
 * BRUTHA Workers panel — shows background agent jobs and their live status.
 * Polls /api/workers while open and while any worker is still running.
 */

interface Worker {
  id: string;
  title: string;
  task: string;
  status: "queued" | "running" | "done" | "error";
  result: string | null;
  error: string | null;
  createdAt: string;
}

export function WorkersPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/workers");
      const d = await r.json();
      setWorkers(d.workers ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    // Intentional: load workers when the panel opens, then poll.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    timer.current = setInterval(load, 2500);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [open, load]);

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
