"use client";

import { Check, X, Paperclip } from "./icons";

/**
 * Confirmation Card — replaces repetitive "are you sure?" text turns.
 *
 * Rendered when a sensitive tool (e.g. sendEmail) returns a structured
 * `{ needsConfirmation: true, ... }` result. The user clicks Confirm/Cancel,
 * which sends a short follow-up message telling the agent to proceed (with
 * confirmed=true) or abort — no free-text confirmation needed.
 */

export interface ConfirmationRequest {
  action: string;
  summary: string;
  details?: Record<string, unknown>;
}

export function ConfirmationCard({
  request,
  onConfirm,
  onCancel,
  resolved,
}: {
  request: ConfirmationRequest;
  onConfirm: () => void;
  onCancel: () => void;
  resolved?: "confirmed" | "cancelled" | null;
}) {
  const d = request.details ?? {};
  return (
    <div className="confirm-card w-full max-w-md">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Paperclip className="h-[15px] w-[15px]" />
        {request.summary}
      </div>

      {/* Render known email fields nicely; fall back to JSON for others. */}
      {request.action === "sendEmail" ? (
        <dl className="mt-2 space-y-1 text-xs text-[var(--fg-muted)]">
          {"to" in d && (
            <div className="flex gap-2">
              <dt className="w-12 shrink-0 font-medium">To</dt>
              <dd className="min-w-0 break-words">{String(d.to)}</dd>
            </div>
          )}
          {"subject" in d && (
            <div className="flex gap-2">
              <dt className="w-12 shrink-0 font-medium">Subject</dt>
              <dd className="min-w-0 break-words">{String(d.subject)}</dd>
            </div>
          )}
          {"body" in d && (
            <div className="flex gap-2">
              <dt className="w-12 shrink-0 font-medium">Body</dt>
              <dd className="min-w-0 whitespace-pre-wrap break-words">{String(d.body)}</dd>
            </div>
          )}
        </dl>
      ) : (
        <pre className="mt-2 overflow-x-auto rounded-lg bg-[var(--hover)] p-2 text-xs">
          {JSON.stringify(d, null, 2)}
        </pre>
      )}

      {resolved ? (
        <p
          className={
            "mt-3 flex items-center gap-1.5 text-xs font-medium " +
            (resolved === "confirmed" ? "text-emerald-500" : "text-[var(--fg-subtle)]")
          }
        >
          {resolved === "confirmed" ? (
            <>
              <Check className="h-[14px] w-[14px]" /> Confirmed
            </>
          ) : (
            <>
              <X className="h-[14px] w-[14px]" /> Cancelled
            </>
          )}
        </p>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--accent,#6366f1)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
          >
            <Check className="h-[14px] w-[14px]" /> Confirm
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-[var(--hover)]"
          >
            <X className="h-[14px] w-[14px]" /> Cancel
          </button>
        </div>
      )}
    </div>
  );
}
