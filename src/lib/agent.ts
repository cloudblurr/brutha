import { ToolLoopAgent, tool, stepCountIs } from "ai";
import { xai } from "@ai-sdk/xai";
import { z } from "zod";
import { getDb } from "./db";
import { isEmailConfigured, sendEmail } from "./email";

/**
 * Tool definitions. These run on the server. The agent (Grok) decides when to
 * call them; the AI SDK executes the `execute` fn and feeds the result back
 * into the model loop until it produces a final answer.
 */
export const tools = {
  /** Deterministic math so the model doesn't have to "guess" arithmetic. */
  calculate: tool({
    description:
      "Evaluate a basic arithmetic expression (+, -, *, /, parentheses, decimals). Use this whenever the user asks for a calculation.",
    inputSchema: z.object({
      expression: z
        .string()
        .describe("A math expression, e.g. '(3 + 4) * 12 / 2'"),
    }),
    execute: async ({ expression }) => {
      if (!/^[\d\s+\-*/().]+$/.test(expression)) {
        return { error: "Expression contains unsupported characters." };
      }
      try {
        const result = Function(`"use strict"; return (${expression});`)();
        if (typeof result !== "number" || !Number.isFinite(result)) {
          return { error: "Expression did not evaluate to a finite number." };
        }
        return { expression, result };
      } catch {
        return { error: "Could not evaluate expression." };
      }
    },
  }),

  /** Returns the current server time — models have no clock otherwise. */
  getCurrentTime: tool({
    description:
      "Get the current date and time. Use this for any question about 'now', today's date, or the current time.",
    inputSchema: z.object({
      timeZone: z
        .string()
        .optional()
        .describe("IANA time zone, e.g. 'America/New_York'. Defaults to UTC."),
    }),
    execute: async ({ timeZone }) => {
      try {
        const now = new Date();
        return {
          iso: now.toISOString(),
          formatted: now.toLocaleString("en-US", {
            timeZone: timeZone || "UTC",
            dateStyle: "full",
            timeStyle: "long",
          }),
          timeZone: timeZone || "UTC",
        };
      } catch {
        return { error: `Invalid time zone: ${timeZone}` };
      }
    },
  }),

  /** Send an email via SMTP (configured through environment variables). */
  sendEmail: tool({
    description:
      "Send an email to a recipient. Confirm the recipient, subject, and body with the user before sending if any are ambiguous.",
    inputSchema: z.object({
      to: z.string().describe("Recipient email address"),
      subject: z.string().describe("Email subject line"),
      body: z.string().describe("Plain-text body of the email"),
    }),
    execute: async ({ to, subject, body }) => {
      if (!isEmailConfigured()) {
        return {
          error:
            "Email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in .env.local.",
        };
      }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
        return { error: `'${to}' is not a valid email address.` };
      }
      try {
        const result = await sendEmail({ to, subject, body });
        return { sent: true, to, subject, messageId: result.messageId };
      } catch (e) {
        return {
          error: `Failed to send email: ${
            e instanceof Error ? e.message : String(e)
          }`,
        };
      }
    },
  }),

  /** Save a contact to the local database. */
  saveContact: tool({
    description:
      "Save or store a person's contact information (name, and optionally email, phone, notes) for later lookup.",
    inputSchema: z.object({
      name: z.string().describe("The person's full name"),
      email: z.string().optional().describe("Their email address"),
      phone: z.string().optional().describe("Their phone number"),
      notes: z.string().optional().describe("Any extra notes about them"),
    }),
    execute: async ({ name, email, phone, notes }) => {
      try {
        const db = getDb();
        const info = db
          .prepare(
            "INSERT INTO contacts (name, email, phone, notes) VALUES (?, ?, ?, ?)"
          )
          .run(name, email ?? null, phone ?? null, notes ?? null);
        return { saved: true, id: Number(info.lastInsertRowid), name };
      } catch (e) {
        return {
          error: `Failed to save contact: ${
            e instanceof Error ? e.message : String(e)
          }`,
        };
      }
    },
  }),

  /** Look up saved contacts by name, email, or phone. */
  findContact: tool({
    description:
      "Look up previously saved contacts by name, email, or phone (partial matches allowed). Use this to retrieve someone's details before, e.g., emailing them.",
    inputSchema: z.object({
      query: z
        .string()
        .describe("Search term to match against name, email, or phone"),
    }),
    execute: async ({ query }) => {
      try {
        const db = getDb();
        const like = `%${query}%`;
        const rows = db
          .prepare(
            `SELECT id, name, email, phone, notes FROM contacts
             WHERE name LIKE ? OR email LIKE ? OR phone LIKE ?
             ORDER BY name LIMIT 10`
          )
          .all(like, like, like);
        return { count: rows.length, contacts: rows };
      } catch (e) {
        return {
          error: `Failed to search contacts: ${
            e instanceof Error ? e.message : String(e)
          }`,
        };
      }
    },
  }),

  /** Save a freeform note / piece of info. */
  saveNote: tool({
    description:
      "Save a freeform note or piece of information for later retrieval (e.g. a fact, idea, reminder, or memo).",
    inputSchema: z.object({
      content: z.string().describe("The note text to save"),
      title: z.string().optional().describe("An optional short title"),
    }),
    execute: async ({ content, title }) => {
      try {
        const db = getDb();
        const info = db
          .prepare("INSERT INTO notes (title, content) VALUES (?, ?)")
          .run(title ?? null, content);
        return { saved: true, id: Number(info.lastInsertRowid), title };
      } catch (e) {
        return {
          error: `Failed to save note: ${
            e instanceof Error ? e.message : String(e)
          }`,
        };
      }
    },
  }),

  /** Full-text search over saved notes. */
  searchNotes: tool({
    description:
      "Search previously saved notes by keyword (full-text search). Returns matching notes.",
    inputSchema: z.object({
      query: z.string().describe("Keywords to search for in saved notes"),
    }),
    execute: async ({ query }) => {
      try {
        const db = getDb();
        // Escape FTS5 special handling by quoting each term.
        const ftsQuery = query
          .split(/\s+/)
          .filter(Boolean)
          .map((t) => `"${t.replace(/"/g, '""')}"`)
          .join(" OR ");
        if (!ftsQuery) return { count: 0, notes: [] };
        const rows = db
          .prepare(
            `SELECT n.id, n.title, n.content, n.createdAt
             FROM notes_fts f JOIN notes n ON n.id = f.rowid
             WHERE notes_fts MATCH ?
             ORDER BY rank LIMIT 10`
          )
          .all(ftsQuery);
        return { count: rows.length, notes: rows };
      } catch (e) {
        return {
          error: `Failed to search notes: ${
            e instanceof Error ? e.message : String(e)
          }`,
        };
      }
    },
  }),

  /** Current weather via the free Open-Meteo API (no key required). */
  getWeather: tool({
    description:
      "Get the current weather for a place by name (city, town). No API key needed.",
    inputSchema: z.object({
      location: z.string().describe("Place name, e.g. 'Tokyo' or 'Paris, France'"),
    }),
    execute: async ({ location }) => {
      try {
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
            location
          )}&count=1`
        );
        const geo = await geoRes.json();
        const place = geo?.results?.[0];
        if (!place) return { error: `Could not find location: ${location}` };

        const wxRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`
        );
        const wx = await wxRes.json();
        const c = wx?.current;
        if (!c) return { error: "Weather data unavailable." };
        return {
          location: `${place.name}, ${place.country ?? ""}`.trim(),
          temperatureC: c.temperature_2m,
          humidityPercent: c.relative_humidity_2m,
          windSpeedKmh: c.wind_speed_10m,
          weatherCode: c.weather_code,
        };
      } catch (e) {
        return {
          error: `Failed to fetch weather: ${
            e instanceof Error ? e.message : String(e)
          }`,
        };
      }
    },
  }),
};

const SYSTEM_PROMPT = `You are Grok Agent, a helpful AI assistant powered by xAI's Grok.

You have tools — use them rather than guessing:
- 'calculate' for any arithmetic.
- 'getCurrentTime' for the current date/time.
- 'sendEmail' to send email (confirm recipient/subject/body if unclear).
- 'saveContact' / 'findContact' to store and look up people. If asked to email
  someone you don't have an address for, try 'findContact' first.
- 'saveNote' / 'searchNotes' to remember and recall freeform information.
- 'getWeather' for current weather in a place.

Be concise, friendly, and direct. After using a tool, briefly explain the
result in plain language. If a tool returns an error (e.g. email not
configured), tell the user clearly. If you have no tool for something and don't
know the answer, say so honestly.`;

/**
 * The agent. ToolLoopAgent runs the model -> tool -> model loop automatically,
 * stopping after a final text answer or when the step limit is reached.
 */
export const grokAgent = new ToolLoopAgent({
  model: xai(process.env.XAI_MODEL || "grok-3"),
  instructions: SYSTEM_PROMPT,
  tools,
  stopWhen: stepCountIs(10),
});
