"use client";

import { useRef, useState } from "react";
import {
  ArrowUp,
  Stop,
  Sparkles,
  Paperclip,
  Globe,
  ImageIcon,
  Bot,
  Mic,
  X,
} from "./icons";
import { useDictation } from "./useDictation";

/**
 * Composer: the input bar with file upload, prompt enhance, and feature
 * toggles (Web Search, Image Generation, BRUTHA Workers).
 */

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  isImage: boolean;
  text?: string;
}

export interface Features {
  webSearch: boolean;
  imageGen: boolean;
  workers: boolean;
}

// Accept attribute mirrors the server-side allow-list in /api/upload.
const ACCEPT =
  ".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.md,.csv,.json,.html,.xml,.js,.py," +
  "image/*,application/pdf,text/plain,text/markdown,text/csv,application/json";

export function Composer({
  input,
  setInput,
  busy,
  onSubmit,
  onStop,
  features,
  setFeatures,
  attachments,
  setAttachments,
  onOpenWorkers,
}: {
  input: string;
  setInput: (v: string) => void;
  busy: boolean;
  onSubmit: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
  features: Features;
  setFeatures: (f: Features) => void;
  attachments: Attachment[];
  setAttachments: (a: Attachment[]) => void;
  onOpenWorkers: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Voice dictation: append finalized speech to the input as the user speaks.
  const dictation = useDictation({
    onResult: (finalText) => {
      const t = finalText.trim();
      if (!t) return;
      setInput((input ? input + " " : "") + t);
      requestAnimationFrame(autoGrow);
    },
  });

  function autoGrow() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }

  function submit() {
    const value = input.trim();
    if ((!value && attachments.length === 0) || busy) return;
    onSubmit(value, attachments);
    setAttachments([]);
    requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  async function enhance() {
    const value = input.trim();
    if (!value || enhancing) return;
    setEnhancing(true);
    setError(null);
    try {
      const r = await fetch("/api/enhance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: value }),
      });
      const d = await r.json();
      if (r.ok && d.enhanced) {
        setInput(d.enhanced);
        requestAnimationFrame(autoGrow);
      } else {
        setError(d.error ?? "Enhance failed.");
      }
    } catch {
      setError("Enhance request failed.");
    } finally {
      setEnhancing(false);
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    const next: Attachment[] = [...attachments];
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const r = await fetch("/api/upload", { method: "POST", body: fd });
        const d = await r.json();
        if (r.ok) {
          next.push(d as Attachment);
        } else {
          setError(d.error ?? `Failed to upload ${file.name}.`);
        }
      } catch {
        setError(`Failed to upload ${file.name}.`);
      }
    }
    setAttachments(next);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function toggle(key: keyof Features) {
    setFeatures({ ...features, [key]: !features[key] });
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Attachment chips */}
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <span key={a.id} className="attach-chip">
              <Paperclip className="h-[13px] w-[13px] shrink-0" />
              <span className="truncate">{a.name}</span>
              <button
                type="button"
                onClick={() => setAttachments(attachments.filter((x) => x.id !== a.id))}
                aria-label={`Remove ${a.name}`}
                className="shrink-0 text-[var(--fg-subtle)] hover:text-[var(--fg)]"
              >
                <X className="h-[12px] w-[12px]" />
              </button>
            </span>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="composer flex w-full flex-col gap-2 rounded-[26px] border p-2 pl-3 transition-shadow"
        style={{ background: "var(--composer-bg)", borderColor: "var(--composer-border)" }}
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autoGrow();
            }}
            onKeyDown={onKeyDown}
            rows={1}
            aria-label="Message BRUTHA"
            placeholder="Message BRUTHA…"
            className="max-h-[200px] flex-1 resize-none bg-transparent py-2.5 pl-1 text-[15px] leading-relaxed outline-none placeholder:text-[var(--fg-subtle)]"
          />
          {busy ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop generating"
              className="btn-send grid h-9 w-9 shrink-0 place-items-center rounded-full"
            >
              <Stop className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() && attachments.length === 0}
              aria-label="Send message"
              className="btn-send grid h-9 w-9 shrink-0 place-items-center rounded-full disabled:cursor-not-allowed disabled:opacity-25"
            >
              <ArrowUp className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>

        {/* Toolbar: upload, enhance, toggles */}
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            multiple
            hidden
            onChange={(e) => onFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="toggle-pill"
            aria-label="Attach file"
          >
            <Paperclip className="h-[14px] w-[14px]" />
            {uploading ? "Uploading…" : "Attach"}
          </button>

          <button
            type="button"
            onClick={enhance}
            disabled={enhancing || !input.trim()}
            className="toggle-pill disabled:opacity-40"
            aria-label="Enhance prompt"
          >
            <Sparkles className={"h-[14px] w-[14px] " + (enhancing ? "tool-glyph-spin" : "")} />
            {enhancing ? "Enhancing…" : "Enhance"}
          </button>

          {dictation.supported && (
            <button
              type="button"
              onClick={dictation.toggle}
              className={"toggle-pill " + (dictation.listening ? "on" : "")}
              aria-pressed={dictation.listening}
              aria-label={dictation.listening ? "Stop dictation" : "Dictate by voice"}
              title="Dictate by voice"
            >
              <Mic className={"h-[14px] w-[14px] " + (dictation.listening ? "tool-glyph-spin" : "")} />
              {dictation.listening ? "Listening…" : "Voice"}
            </button>
          )}

          <span className="mx-0.5 h-4 w-px bg-[var(--border)]" />

          <button
            type="button"
            onClick={() => toggle("webSearch")}
            className={"toggle-pill " + (features.webSearch ? "on" : "")}
            aria-pressed={features.webSearch}
          >
            <Globe className="h-[14px] w-[14px]" /> Web
          </button>
          <button
            type="button"
            onClick={() => toggle("imageGen")}
            className={"toggle-pill " + (features.imageGen ? "on" : "")}
            aria-pressed={features.imageGen}
          >
            <ImageIcon className="h-[14px] w-[14px]" /> Image
          </button>
          <button
            type="button"
            onClick={() => toggle("workers")}
            className={"toggle-pill " + (features.workers ? "on" : "")}
            aria-pressed={features.workers}
          >
            <Bot className="h-[14px] w-[14px]" /> Workers
          </button>

          <button
            type="button"
            onClick={onOpenWorkers}
            className="toggle-pill ml-auto"
            aria-label="Open workers panel"
          >
            View workers
          </button>
        </div>
      </form>

      {(error || dictation.error) && (
        <p className="mt-1.5 text-center text-xs text-red-500 dark:text-red-300">{error || dictation.error}</p>
      )}
    </div>
  );
}
