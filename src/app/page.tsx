"use client";

import { useChat } from "@ai-sdk/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Markdown } from "./Markdown";
import {
  ArrowUp,
  Stop,
  Plus,
  Trash,
  Sidebar as SidebarIcon,
  Copy,
  Check,
  Refresh,
  Sun,
  Moon,
  Wrench,
} from "./icons";

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

type Conversation = {
  id: string;
  title: string;
  messages: UIMessage[];
  updatedAt: number;
};

const STORAGE_KEY = "brutha-conversations";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function deriveTitle(messages: UIMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New chat";
  const text = firstUser.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join(" ")
    .trim();
  if (!text) return "New chat";
  return text.length > 40 ? text.slice(0, 40) + "…" : text;
}

export default function Home() {
  const { messages, setMessages, sendMessage, status, error, stop, regenerate } =
    useChat();
  const [input, setInput] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [hydrated, setHydrated] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const busy = status === "submitted" || status === "streaming";
  const empty = messages.length === 0;

  /* ---- Hydration: load persisted state once on mount ---- */
  useEffect(() => {
    const convs = loadConversations();
    const storedTheme =
      (localStorage.getItem("brutha-theme") as "light" | "dark") || "dark";
    // One-time hydration from localStorage into React state.
    /* eslint-disable react-hooks/set-state-in-effect */
    setConversations(convs);
    setTheme(storedTheme);
    if (window.innerWidth < 768) setSidebarOpen(false);
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  /* ---- Persist conversations whenever they change ---- */
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  }, [conversations, hydrated]);

  /* ---- Apply + persist theme ---- */
  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("brutha-theme", theme);
  }, [theme, hydrated]);

  /* ---- Sync the live `messages` back into the active conversation ---- */
  useEffect(() => {
    if (!hydrated || !activeId || busy) return;
    // Sync the live useChat messages into our persisted conversation store.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === activeId);
      if (idx === -1) {
        if (messages.length === 0) return prev;
        return [
          {
            id: activeId,
            title: deriveTitle(messages),
            messages,
            updatedAt: Date.now(),
          },
          ...prev,
        ];
      }
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        messages,
        title:
          updated[idx].title === "New chat"
            ? deriveTitle(messages)
            : updated[idx].title,
        updatedAt: Date.now(),
      };
      return updated;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, busy, hydrated]);

  const submit = useCallback(
    (text: string) => {
      const value = text.trim();
      if (!value || busy) return;
      // Open a new conversation lazily on first message.
      if (!activeId) setActiveId(uid());
      sendMessage({ text: value });
      setInput("");
      requestAnimationFrame(() => {
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      });
    },
    [busy, sendMessage, activeId],
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

  function newChat() {
    if (busy) return;
    setActiveId(null);
    setMessages([]);
    setInput("");
    textareaRef.current?.focus();
    if (window.innerWidth < 768) setSidebarOpen(false);
  }

  function openConversation(c: Conversation) {
    if (busy) return;
    setActiveId(c.id);
    setMessages(c.messages);
    if (window.innerWidth < 768) setSidebarOpen(false);
  }

  function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (id === activeId) {
      setActiveId(null);
      setMessages([]);
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

  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* ---- Sidebar ---- */}
      <aside
        className="flex shrink-0 flex-col overflow-hidden border-r transition-[width] duration-200 ease-out"
        style={{
          width: sidebarOpen ? 260 : 0,
          background: "var(--sidebar-bg)",
        }}
      >
        <div className="flex w-[260px] flex-1 flex-col">
          <div className="flex items-center justify-between px-3 py-3">
            <div className="flex items-center gap-2 pl-1">
              <div className="orb h-7 w-7 rounded-lg" aria-hidden />
              <span className="text-sm font-semibold gradient-text">BRUTHA</span>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Collapse sidebar"
              className="msg-action grid h-8 w-8 place-items-center"
            >
              <SidebarIcon className="h-[18px] w-[18px]" />
            </button>
          </div>

          <div className="px-3 pb-2">
            <button
              type="button"
              onClick={newChat}
              className="flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition hover:bg-[var(--hover)]"
            >
              <Plus className="h-[18px] w-[18px]" />
              New chat
            </button>
          </div>

          <div className="scroll-area flex-1 overflow-y-auto px-2 py-2">
            {sortedConversations.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-[var(--fg-subtle)]">
                No conversations yet.
              </p>
            ) : (
              <div className="space-y-0.5">
                <p className="px-2 pb-1 pt-2 text-xs font-medium text-[var(--fg-subtle)]">
                  Recent
                </p>
                {sortedConversations.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => openConversation(c)}
                    className={
                      "side-item group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm " +
                      (c.id === activeId ? "active" : "")
                    }
                  >
                    <span className="min-w-0 flex-1 truncate text-[var(--fg)]">
                      {c.title}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => deleteConversation(c.id, e)}
                      aria-label="Delete conversation"
                      className="msg-action grid h-6 w-6 shrink-0 place-items-center opacity-0 group-hover:opacity-100"
                    >
                      <Trash className="h-[14px] w-[14px]" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t px-3 py-3">
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-[var(--hover)]"
            >
              {theme === "dark" ? (
                <Sun className="h-[18px] w-[18px]" />
              ) : (
                <Moon className="h-[18px] w-[18px]" />
              )}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </div>
        </div>
      </aside>

      {/* ---- Main column ---- */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex items-center gap-2 px-3 py-2.5">
          {!sidebarOpen && (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
              className="msg-action grid h-9 w-9 place-items-center"
            >
              <SidebarIcon className="h-[18px] w-[18px]" />
            </button>
          )}
          {!sidebarOpen && (
            <button
              type="button"
              onClick={newChat}
              aria-label="New chat"
              className="msg-action grid h-9 w-9 place-items-center"
            >
              <Plus className="h-[18px] w-[18px]" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">BRUTHA</span>
            <span className="rounded-md bg-[var(--hover)] px-1.5 py-0.5 text-[11px] text-[var(--fg-muted)]">
              Grok
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1.5 pr-1">
            <span
              className={
                "h-2 w-2 rounded-full " +
                (busy ? "animate-pulse bg-amber-400" : "bg-emerald-400")
              }
            />
            <span className="hidden text-xs text-[var(--fg-muted)] sm:inline">
              {busy ? "Thinking…" : "Online"}
            </span>
          </div>
        </header>

        {/* Conversation */}
        <main ref={scrollRef} className="scroll-area relative flex-1 overflow-y-auto">
          {empty ? (
            <Hero onPick={submit} />
          ) : (
            <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
              <div className="space-y-1">
                {messages.map((m, i) => (
                  <MessageRow
                    key={m.id}
                    message={m}
                    isLast={i === messages.length - 1}
                    busy={busy}
                    onRegenerate={() => regenerate()}
                  />
                ))}
                {status === "submitted" && <ThinkingRow />}
                {error && (
                  <div className="mx-auto my-4 max-w-md rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-500 dark:text-red-300">
                    {error.message || "Something went wrong. Please try again."}
                  </div>
                )}
              </div>
              <div ref={endRef} className="h-4" />
            </div>
          )}
        </main>

        {/* Composer */}
        <div className="px-4 pb-4 pt-1 sm:px-6">
          <form
            onSubmit={onSubmit}
            className="composer mx-auto flex w-full max-w-3xl items-end gap-2 rounded-[26px] border p-2 pl-4 transition-shadow"
            style={{
              background: "var(--composer-bg)",
              borderColor: "var(--composer-border)",
            }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Message BRUTHA…"
              className="max-h-[200px] flex-1 resize-none bg-transparent py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-[var(--fg-subtle)]"
            />
            {busy ? (
              <button
                type="button"
                onClick={stop}
                aria-label="Stop generating"
                className="btn-send grid h-9 w-9 shrink-0 place-items-center rounded-full"
              >
                <Stop className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label="Send message"
                className="btn-send grid h-9 w-9 shrink-0 place-items-center rounded-full disabled:cursor-not-allowed disabled:opacity-25"
              >
                <ArrowUp className="h-[18px] w-[18px]" />
              </button>
            )}
          </form>
          <p className="mt-2 text-center text-[11px] text-[var(--fg-subtle)]">
            BRUTHA can use tools and may make mistakes. Verify important info.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Hero({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center px-4 pb-16 text-center">
      <div className="orb mb-6 h-14 w-14 rounded-[18px]" aria-hidden />
      <h2 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
        How can I help you today?
      </h2>
      <p className="mt-2 max-w-md text-sm text-[var(--fg-muted)]">
        An agentic assistant with 50+ built-in tools — math, weather, web
        knowledge, memory, and more.
      </p>

      <div className="mt-8 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            onClick={() => onPick(s.prompt)}
            className="suggest group flex items-start gap-3 rounded-2xl p-4 text-left"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--hover)] text-base">
              {s.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{s.title}</span>
              <span className="mt-0.5 block truncate text-xs text-[var(--fg-muted)]">
                {s.prompt}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageRow({
  message,
  isLast,
  busy,
  onRegenerate,
}: {
  message: UIMessage;
  isLast: boolean;
  busy: boolean;
  onRegenerate: () => void;
}) {
  const isUser = message.role === "user";

  const fullText = message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("\n\n");

  if (isUser) {
    return (
      <div className="msg-in flex justify-end py-3">
        <div className="max-w-[80%] rounded-3xl rounded-br-lg px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words"
          style={{ background: "var(--user-bubble)" }}>
          {fullText}
        </div>
      </div>
    );
  }

  return (
    <div className="msg-in group flex gap-3 py-3">
      <div className="orb h-7 w-7 shrink-0 rounded-full" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-2">
          {message.parts.map((part, i) => {
            if (part.type === "text") {
              if (!part.text) return null;
              return <Markdown key={i} content={part.text} />;
            }
            if (part.type.startsWith("tool-")) {
              return (
                <ToolChip
                  key={i}
                  name={part.type.replace("tool-", "")}
                  state={(part as { state?: string }).state ?? "output-available"}
                />
              );
            }
            return null;
          })}
        </div>

        {/* Hover actions */}
        {fullText && (!isLast || !busy) && (
          <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <CopyButton text={fullText} />
            {isLast && (
              <button
                type="button"
                onClick={onRegenerate}
                aria-label="Regenerate"
                className="msg-action grid h-7 w-7 place-items-center"
              >
                <Refresh className="h-[15px] w-[15px]" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy"
      className="msg-action grid h-7 w-7 place-items-center"
    >
      {copied ? <Check className="h-[15px] w-[15px]" /> : <Copy className="h-[15px] w-[15px]" />}
    </button>
  );
}

function ToolChip({ name, state }: { name: string; state: string }) {
  const running = state === "input-streaming" || state === "input-available";
  return (
    <div
      className={
        "tool-chip inline-flex w-fit items-center gap-2 rounded-lg border px-2.5 py-1.5 font-mono text-xs text-[var(--fg-muted)] " +
        (running ? "running" : "")
      }
      style={{ background: "var(--hover)" }}
    >
      <Wrench className="h-[13px] w-[13px]" />
      <span className="text-[var(--fg)]">{name}</span>
      <span className="text-[var(--fg-subtle)]">{running ? "running…" : "done"}</span>
    </div>
  );
}

function ThinkingRow() {
  return (
    <div className="msg-in flex gap-3 py-3">
      <div className="orb h-7 w-7 shrink-0 rounded-full" aria-hidden />
      <div className="flex items-center text-[var(--fg-muted)]">
        <span className="typing">
          <span />
          <span />
          <span />
        </span>
      </div>
    </div>
  );
}
