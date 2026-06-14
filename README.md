# Grok Agent

A minimal **AI agent** built with **Next.js 16 (App Router)**, the **Vercel AI SDK v6**, and **xAI's Grok**. It demonstrates the core loop of an agent framework: the model reasons, calls tools, reads the results, and loops until it has a final answer — all streamed to a chat UI.

## Features

- **Agentic tool-calling loop** via the AI SDK's `ToolLoopAgent` (model → tool → model, up to 14 steps).
- **Streaming responses** with the `useChat` hook (AI SDK v6).
- **50+ built-in tools**, organized by category in `src/lib/tools/`:

  **Math & conversions** — `calculate`, `convertUnits` (length/mass/temp/volume), `convertCurrency` (live ECB rates), `convertTimeZone`, `numberToWords`

  **Dates** — `dateDiff`, `daysUntil`, `addToDate`, `dayOfWeek`, `createCalendarEvent` (.ics export)

  **Time & weather** — `getCurrentTime`, `getWeather`, `forecast` (multi-day), `sunriseSunset`

  **Knowledge & web** — `wikipedia`, `dictionary`, `fetchUrl` (read any page/API), `countryInfo`, `cryptoPrice`, `ipInfo`, `topNews` (Hacker News), `translate`

  **Geo** — `distanceBetween` (great-circle distance), `sunriseSunset`

  **Memory (local SQLite)** — contacts: `saveContact` / `findContact` / `listContacts` / `updateContact` / `deleteContact`; notes: `saveNote` / `searchNotes` (FTS5) / `listNotes` / `deleteNote`; tasks: `addTask` / `listTasks` / `completeTask` / `deleteTask`

  **Text & data** — `slugify`, `changeCase` (upper/lower/title/camel/snake/kebab), `regexExtract`, `formatJson`, `csvToJson`, `parseUrl`, `sortList`

  **Generators & encoders** — `generatePassword`, `generateUuid`, `hashText` (md5/sha1/sha256/sha512), `encodeBase64`, `qrCode`, `randomNumber`, `rollDice`, `colorInfo`, `countText`

  **Health & fun** — `calculateBmi`, `getJoke`, `getQuote`, `activitySuggestion`

  **Email (optional)** — `sendEmail` via SMTP; defaults to the configured test recipient and reports "not configured" if no creds

- **Visible tool activity** — the UI shows when the agent invokes a tool.
- **Local persistence** — contacts, notes, and tasks stored in a SQLite file under `./data` (gitignored).
- Almost every tool is **keyless** and works out of the box (only `sendEmail` needs config).
- TypeScript + Tailwind CSS throughout.

## Project structure

```
src/
├── lib/
│   ├── agent.ts          # Agent definition: model, system prompt, composes all tools
│   ├── db.ts             # SQLite store (contacts, notes w/ FTS5, tasks)
│   ├── email.ts          # SMTP email sending (nodemailer)
│   └── tools/
│       ├── utility.ts    # calculate, conversions, generators, encoders
│       ├── web.ts        # weather, wikipedia, currency, crypto, news, ...
│       ├── storage.ts    # contacts / notes / tasks CRUD
│       ├── datetime.ts   # date diff/add, day-of-week, ICS event export
│       ├── text.ts       # translate, slugify, case, regex, JSON/CSV, URL, sort
│       ├── extras.ts     # jokes, quotes, sunrise/sunset, distance, BMI, activity
│       └── email.ts      # sendEmail tool
└── app/
    ├── api/chat/route.ts # Streaming chat endpoint (Node.js runtime)
    ├── page.tsx          # Chat UI (useChat)
    └── layout.tsx
data/                     # SQLite DB file (auto-created, gitignored)
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

| Env var        | Default      | Description                          |
| -------------- | ------------ | ------------------------------------ |
| `XAI_API_KEY`  | _(none)_     | Required. Your xAI API key.          |
| `XAI_MODEL`    | `grok-3`     | Optional. Grok model to use.         |
| `SMTP_HOST`    | _(none)_     | Optional. SMTP server for `sendEmail`. |
| `SMTP_PORT`    | _(none)_     | Optional. 465 (SSL) or 587 (STARTTLS). |
| `SMTP_USER`    | _(none)_     | Optional. SMTP username / email.     |
| `SMTP_PASS`    | _(none)_     | Optional. SMTP / app password.       |
| `SMTP_FROM`    | `SMTP_USER`  | Optional. From address.              |
| `TEST_EMAIL_TO`| `dev00engine@blurr.cloud` | Default recipient when `sendEmail` is called without a `to`. |

> **Email is optional.** Without SMTP vars, the `sendEmail` tool simply
> reports that email is not configured — the rest of the agent works fine.
> For Gmail, use an [app password](https://myaccount.google.com/apppasswords),
> not your account password.

## Tech stack

- [Next.js 16](https://nextjs.org)
- [AI SDK v6](https://sdk.vercel.ai) + [`@ai-sdk/xai`](https://www.npmjs.com/package/@ai-sdk/xai)
- [Zod](https://zod.dev) for tool schemas
- [Tailwind CSS](https://tailwindcss.com)

## License

MIT
