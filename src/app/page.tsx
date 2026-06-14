"use client";

import { useChat } from "@ai-sdk/react";
import { useState } from "react";

export default function Home() {
  const { messages, sendMessage, status, error, stop } = useChat();
  const [input, setInput] = useState("");

  const busy = status === "submitted" || status === "streaming";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col px-4">
      <header className="border-b border-black/10 py-4 dark:border-white/10">
        <h1 className="text-lg font-semibold">Grok Agent</h1>
        <p className="text-sm text-black/50 dark:text-white/50">
          Next.js + AI SDK v6 + xAI Grok · with tool calling
        </p>
      </header>

      <main className="flex-1 space-y-4 overflow-y-auto py-6">
        {messages.length === 0 && (
          <div className="text-sm text-black/40 dark:text-white/40">
            Try: &ldquo;What is (128 * 12) + 47?&rdquo; or &ldquo;What time is
            it in Tokyo right now?&rdquo;
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={m.role === "user" ? "text-right" : "text-left"}
          >
            <div
              className={
                "inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm " +
                (m.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-black/5 dark:bg-white/10")
              }
            >
              {m.parts.map((part, i) => {
                if (part.type === "text") {
                  return <span key={i}>{part.text}</span>;
                }
                // Render tool activity so the agent's actions are visible.
                if (part.type.startsWith("tool-")) {
                  const name = part.type.replace("tool-", "");
                  return (
                    <div
                      key={i}
                      className="my-1 rounded-lg bg-black/10 px-2 py-1 font-mono text-xs dark:bg-white/10"
                    >
                      🔧 {name}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {error && (
          <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {error.message || "Something went wrong."}
          </div>
        )}
      </main>

      <form
        onSubmit={onSubmit}
        className="flex gap-2 border-t border-black/10 py-4 dark:border-white/10"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the agent something…"
          className="flex-1 rounded-full border border-black/15 bg-transparent px-4 py-2 text-sm outline-none focus:border-blue-500 dark:border-white/20"
        />
        {busy ? (
          <button
            type="button"
            onClick={stop}
            className="rounded-full bg-black/10 px-5 py-2 text-sm font-medium dark:bg-white/15"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="rounded-full bg-blue-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Send
          </button>
        )}
      </form>
    </div>
  );
}
