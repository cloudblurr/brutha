"use client";

import { useChat } from "@ai-sdk/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const SUGGESTIONS = [
  {
    title: "Crunch the numbers",
    prompt: "What is (128 * 12) + 47, and what's that in binary?",
    icon: "∑",
  },
  {
    title: "Time around the world",
    prompt: "What time is it in Tokyo, London, and New York right now?",
    icon: "◷",
  },
  {
    title: "Weather check",
    prompt: "What's the weather and 3-day forecast for San Francisco?",
    icon: "☀",
  },
  {
    title: "Quick knowledge",
    prompt: "Give me a short Wikipedia summary of the Fermi paradox.",
    icon: "✦",
  },
];

type UIMessage = ReturnType<typeof useChat>["messages"][number];

export default function Home() {
  const { messages, sendMessage, status, error, stop } = useChat();
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const busy = status === "submitted" || status === "streaming";
  const empty = messages.length === 0;

  const submit = useCallback(
    (text: string) => {
      const value = text.trim();
      if (!value || busy) return;
      sendMessage({ text: value });
      setInput("");
      requestAnimationFrame(() => {
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      });
    },
    [busy, sendMessage],
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit(input);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  }

  // Auto-grow the textarea up to a max height.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  // Auto-scroll to the newest content as it streams in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  return (
    <div className="relative flex h-dvh flex-col">
      {/* Header */}
      <header className="glass sticky top-0 z-20 flex items-center justify-between border-b px-5 py-3 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="orb h-9 w-9 shrink-0 rounded-2xl" aria-hidden />
          <div className="leading-tight">
            <h1 className="text-base font-semibold tracking-tight">
              <span className="gradient-text">BRUTHA</span>
            </h1>
            <p className="text-[11px] text-[var(--muted-2)]">
              Agentic assistant · xAI Grok
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={
              "h-2 w-2 rounded-full " +
              (busy
                ? "animate-pulse bg-[var(--accent-2)]"
                : "bg-emerald-400")
            }
          />
          <span className="hidden text-xs text-[var(--muted)] sm:inline">
            {busy ? "Thinking…" : "Online"}
          </span>
        </div>
      </header>

      {/* Conversation */}
      <main
        ref={scrollRef}
        className="scroll-area relative flex-1 overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
          {empty ? (
            <Hero onPick={submit} />
          ) : (
            <div className="space-y-6">
              {messages.map((m) => (
                <MessageRow key={m.id} message={m} />
              ))}
              {status === "submitted" && <ThinkingRow />}
              {error && (
                <div className="mx-auto max-w-md rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-500 dark:text-red-300">
                  {error.message || "Something went wrong. Please try again."}
                </div>
              )}
            </div>
          )}
          <div ref={endRef} className="h-px" />
        </div>
      </main>

      {/* Composer */}
      <footer className="px-4 pb-5 pt-2 sm:px-6">
        <form
          onSubmit={onSubmit}
          className="composer-glow glass-strong mx-auto flex w-full max-w-3xl items-end gap-2 rounded-[26px] border p-2 pl-4 shadow-lg transition-shadow"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Message BRUTHA…"
            className="max-h-[200px] flex-1 resize-none bg-transparent py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-[var(--muted-2)]"
          />
          {busy ? (
            <button
              type="button"
              onClick={stop}
              aria-label="Stop generating"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--border-strong)] text-[var(--foreground)] transition hover:bg-[var(--surface-strong)]"
            >
              <span className="h-3 w-3 rounded-[3px] bg-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send message"
              className="btn-accent grid h-10 w-10 shrink-0 place-items-center rounded-full text-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ArrowUp />
            </button>
          )}
        </form>
        <p className="mt-2 text-center text-[11px] text-[var(--muted-2)]">
          BRUTHA can use tools and may make mistakes. Verify important info.
        </p>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Hero({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className="msg-in flex flex-col items-center pt-10 text-center sm:pt-16">
      <div className="orb mb-6 h-16 w-16 rounded-[20px]" aria-hidden />
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        How can I help, <span className="gradient-text">today?</span>
      </h2>
      <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
        An agentic assistant with 50+ built-in tools — math, weather, web
        knowledge, memory, and more.
      </p>

      <div className="mt-8 grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            onClick={() => onPick(s.prompt)}
            className="suggest glass group flex items-start gap-3 rounded-2xl border p-4 text-left"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--surface-strong)] text-base text-[var(--accent)]">
              {s.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{s.title}</span>
              <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">
                {s.prompt}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  return (
    <div
      className={
        "msg-in flex gap-3 " + (isUser ? "flex-row-reverse" : "flex-row")
      }
    >
      <Avatar isUser={isUser} />
      <div
        className={
          "flex min-w-0 max-w-[82%] flex-col gap-1.5 " +
          (isUser ? "items-end" : "items-start")
        }
      >
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            if (!part.text) return null;
            return (
              <div
                key={i}
                className={
                  "whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed shadow-sm " +
                  (isUser
                    ? "rounded-br-md text-white"
                    : "glass rounded-bl-md border")
                }
                style={
                  isUser ? { background: "var(--user-bubble)" } : undefined
                }
              >
                {part.text}
              </div>
            );
          }
          if (part.type.startsWith("tool-")) {
            return (
              <ToolChip
                key={i}
                name={part.type.replace("tool-", "")}
                state={
                  (part as { state?: string }).state ?? "output-available"
                }
              />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

function ToolChip({ name, state }: { name: string; state: string }) {
  const running = state === "input-streaming" || state === "input-available";
  return (
    <div
      className={
        "tool-chip glass inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-xs text-[var(--muted)] " +
        (running ? "running" : "")
      }
    >
      <span
        className={
          "h-1.5 w-1.5 rounded-full " +
          (running
            ? "animate-pulse bg-[var(--accent-2)]"
            : "bg-emerald-400")
        }
      />
      <span className="text-[var(--foreground)]">{name}</span>
      <span className="text-[var(--muted-2)]">
        {running ? "running" : "done"}
      </span>
    </div>
  );
}

function ThinkingRow() {
  return (
    <div className="msg-in flex gap-3">
      <Avatar isUser={false} />
      <div className="glass flex items-center gap-1 rounded-2xl rounded-bl-md border px-4 py-3 text-[var(--muted)]">
        <span className="typing">
          <span />
          <span />
          <span />
        </span>
      </div>
    </div>
  );
}

function Avatar({ isUser }: { isUser: boolean }) {
  if (isUser) {
    return (
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-strong)] text-xs font-medium text-[var(--muted)]">
        You
      </div>
    );
  }
  return <div className="orb h-8 w-8 shrink-0 rounded-full" aria-hidden />;
}

function ArrowUp() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}
