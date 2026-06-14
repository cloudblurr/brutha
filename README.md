# Grok Agent

A minimal **AI agent** built with **Next.js 16 (App Router)**, the **Vercel AI SDK v6**, and **xAI's Grok**. It demonstrates the core loop of an agent framework: the model reasons, calls tools, reads the results, and loops until it has a final answer — all streamed to a chat UI.

## Features

- **Agentic tool-calling loop** via the AI SDK's `ToolLoopAgent` (model → tool → model, up to 8 steps).
- **Streaming responses** with the `useChat` hook (AI SDK v6).
- **Two example server-side tools**:
  - `calculate` — safe arithmetic evaluation
  - `getCurrentTime` — current date/time in any IANA time zone
- **Visible tool activity** — the UI shows when the agent invokes a tool.
- TypeScript + Tailwind CSS throughout.

## Project structure

```
src/
├── lib/
│   └── agent.ts          # Agent definition: model, system prompt, tools
└── app/
    ├── api/chat/route.ts # Streaming chat endpoint
    ├── page.tsx          # Chat UI (useChat)
    └── layout.tsx
```

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure your xAI API key

Get a key at [console.x.ai](https://console.x.ai), then:

```bash
cp .env.example .env.local
```

Edit `.env.local` and set:

```
XAI_API_KEY=your-key-here
```

`.env.local` is gitignored — your key is never committed.

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Try:
- *"What is (128 \* 12) + 47?"* → uses the `calculate` tool
- *"What time is it in Tokyo right now?"* → uses the `getCurrentTime` tool

## How it works

`src/lib/agent.ts` defines a `ToolLoopAgent` with the Grok model, a system
prompt, and a set of tools. Each tool has a Zod `inputSchema` (so the model
knows how to call it) and an `execute` function that runs on the server.

The API route (`src/app/api/chat/route.ts`) converts incoming UI messages to
model messages, runs `grokAgent.stream(...)`, and returns
`toUIMessageStreamResponse()` — which streams text *and* tool events to the
client.

## Adding your own tools

Add an entry to the `tools` object in `src/lib/agent.ts`:

```ts
myTool: tool({
  description: "What it does and when to use it.",
  inputSchema: z.object({ query: z.string() }),
  execute: async ({ query }) => {
    // ...do work, return JSON-serializable result
    return { ok: true };
  },
}),
```

The model will automatically discover and call it when relevant.

## Configuration

| Env var        | Default  | Description                       |
| -------------- | -------- | --------------------------------- |
| `XAI_API_KEY`  | _(none)_ | Required. Your xAI API key.       |
| `XAI_MODEL`    | `grok-3` | Optional. Grok model to use.      |

## Tech stack

- [Next.js 16](https://nextjs.org)
- [AI SDK v6](https://sdk.vercel.ai) + [`@ai-sdk/xai`](https://www.npmjs.com/package/@ai-sdk/xai)
- [Zod](https://zod.dev) for tool schemas
- [Tailwind CSS](https://tailwindcss.com)

## License

MIT
