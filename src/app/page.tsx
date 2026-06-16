"use client";

import { useChat } from "@ai-sdk/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Markdown } from "./Markdown";
import { t } from "@/lib/i18n";
import {
  Plus,
  Trash,
  Sidebar as SidebarIcon,
  Copy,
  Check,
  Refresh,
  Sun,
  Moon,
  Wrench,
  ToolGlyph,
  Settings as SettingsIcon,
} from "./icons";
import { Composer, type Attachment, type Features } from "./Composer";
import { ConfirmationCard } from "./ConfirmationCard";
import { WorkersPanel } from "./WorkersPanel";
import {
  SettingsModal,
  AccountButton,
  useAuth,
} from "./Settings";

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

  // New feature state.
  const [features, setFeatures] = useState<Features>({
    webSearch: true,
    imageGen: false,
    workers: true,
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [workersOpen, setWorkersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const auth = useAuth();

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
    (text: string, atts: Attachment[] = []) => {
      const value = text.trim();
      if ((!value && atts.length === 0) || busy) return;
      // Open a new conversation lazily on first message.
      if (!activeId) setActiveId(uid());

      // Fold attachment context into the message so the agent can use it.
      let composed = value;
      if (atts.length > 0) {
        const lines = atts.map((a) => {
          if (a.isImage) return `[Image attached: ${a.name} -> ${a.url}]`;
          if (a.text)
            return `[File attached: ${a.name}]\n\`\`\`\n${a.text}\n\`\`\``;
          return `[File attached: ${a.name} -> ${a.url}]`;
        });
        composed = (value ? value + "\n\n" : "") + lines.join("\n\n");
      }

      sendMessage({ text: composed }, { body: { features } });
      setInput("");
    },
    [busy, sendMessage, activeId, features],
  );

  // Send a follow-up instruction from a confirmation card (confirm / cancel).
  const confirmAction = useCallback(
    (instruction: string) => {
      if (busy) return;
      sendMessage({ text: instruction }, { body: { features } });
    },
    [busy, sendMessage, features],
  );

  function newChat() {
    if (busy) return;
    setActiveId(null);
    setMessages([]);
    setInput("");
    setAttachments([]);
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
              {busy ? t("status.thinking") : t("status.online")}
            </span>
            <button
              type="button"
              onClick={() => setWorkersOpen(true)}
              aria-label="Open workers"
              className="msg-action ml-1 grid h-9 w-9 place-items-center"
            >
              <Wrench className="h-[16px] w-[16px]" />
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Open settings"
              className="msg-action grid h-9 w-9 place-items-center"
            >
              <SettingsIcon className="h-[18px] w-[18px]" />
            </button>
            <AccountButton user={auth.user} onOpen={() => setSettingsOpen(true)} />
          </div>
        </header>

        {/* Conversation */}
        <main
          ref={scrollRef}
          role="log"
          aria-label="Conversation"
          aria-live="polite"
          className="scroll-area relative flex-1 overflow-y-auto"
        >
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
                    onConfirm={confirmAction}
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
          <Composer
            input={input}
            setInput={setInput}
            busy={busy}
            onSubmit={submit}
            onStop={stop}
            features={features}
            setFeatures={setFeatures}
            attachments={attachments}
            setAttachments={setAttachments}
            onOpenWorkers={() => setWorkersOpen(true)}
          />
          <p className="mt-2 text-center text-[11px] text-[var(--fg-subtle)]">
            {t("composer.disclaimer")}
          </p>
        </div>
      </div>

      {/* Workers panel + Settings modal */}
      <WorkersPanel open={workersOpen} onClose={() => setWorkersOpen(false)} />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        user={auth.user}
        theme={theme}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Hero({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center px-4 pb-16 text-center">
      <div className="orb mb-6 h-14 w-14 rounded-[18px]" aria-hidden />
      <h2 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
        {t("hero.title")}
      </h2>
      <p className="mt-2 max-w-md text-sm text-[var(--fg-muted)]">
        {t("app.tagline")}
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
  onConfirm,
}: {
  message: UIMessage;
  isLast: boolean;
  busy: boolean;
  onRegenerate: () => void;
  onConfirm: (instruction: string) => void;
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
              const name = part.type.replace("tool-", "");
              const p = part as {
                state?: string;
                output?: unknown;
              };
              const output = p.output as
                | {
                    needsConfirmation?: boolean;
                    action?: string;
                    summary?: string;
                    details?: Record<string, unknown>;
                    url?: string;
                    created?: boolean;
                  }
                | undefined;

              // Confirmation card for sensitive actions awaiting approval.
              if (output?.needsConfirmation) {
                return (
                  <ConfirmationCard
                    key={i}
                    request={{
                      action: output.action ?? name,
                      summary: output.summary ?? `Confirm ${name}`,
                      details: output.details,
                    }}
                    onConfirm={() =>
                      onConfirm(
                        `Yes, I confirm. Proceed with the ${
                          output.action ?? name
                        } action now (set confirmed to true).`,
                      )
                    }
                    onCancel={() =>
                      onConfirm(`No, cancel the ${output.action ?? name} action. Do not proceed.`)
                    }
                  />
                );
              }

              // Inline render for generated images.
              if (output?.created && output.url) {
                return (
                  <div key={i} className="space-y-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={output.url}
                      alt="Generated image"
                      className="max-h-96 w-auto rounded-xl border"
                    />
                  </div>
                );
              }

              return (
                <ToolChip
                  key={i}
                  name={name}
                  state={p.state ?? "output-available"}
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
      role="status"
      aria-live="polite"
      aria-label={`Tool ${name} ${running ? "running" : "completed"}`}
      className={
        "tool-chip inline-flex w-fit items-center gap-2 rounded-lg border px-2.5 py-1.5 font-mono text-xs text-[var(--fg-muted)] " +
        (running ? "running" : "")
      }
      style={{
        // S9: distinguish tool-generated activity with a subtle accent badge.
        background: running
          ? "color-mix(in oklab, var(--accent, #6366f1) 14%, var(--hover))"
          : "var(--hover)",
        borderColor: running
          ? "color-mix(in oklab, var(--accent, #6366f1) 35%, transparent)"
          : undefined,
      }}
    >
      <span
        aria-hidden
        className="inline-flex items-center gap-1 rounded bg-[color-mix(in_oklab,var(--accent,#6366f1)_22%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent,#6366f1)]"
      >
        <ToolGlyph name={name} running={running} />
        tool
      </span>
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
