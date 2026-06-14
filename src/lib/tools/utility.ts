import { tool } from "ai";
import { z } from "zod";
import crypto from "node:crypto";

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export const utilityTools = {
  calculate: tool({
    description:
      "Evaluate a basic arithmetic expression (+, -, *, /, parentheses, decimals).",
    inputSchema: z.object({ expression: z.string() }),
    execute: async ({ expression }) => {
      if (!/^[\d\s+\-*/().]+$/.test(expression))
        return { error: "Expression contains unsupported characters." };
      try {
        const result = Function(`"use strict"; return (${expression});`)();
        if (typeof result !== "number" || !Number.isFinite(result))
          return { error: "Did not evaluate to a finite number." };
        return { expression, result };
      } catch {
        return { error: "Could not evaluate expression." };
      }
    },
  }),

  getCurrentTime: tool({
    description: "Get the current date and time in a given IANA time zone.",
    inputSchema: z.object({
      timeZone: z.string().optional().describe("e.g. 'America/New_York'"),
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

  convertTimeZone: tool({
    description:
      "Convert a date/time from one IANA time zone to another. Returns the equivalent local time.",
    inputSchema: z.object({
      dateTime: z.string().describe("ISO date-time, e.g. '2026-07-01T15:00:00'"),
      fromZone: z.string().describe("Source IANA zone"),
      toZone: z.string().describe("Target IANA zone"),
    }),
    execute: async ({ dateTime, fromZone, toZone }) => {
      try {
        // Interpret dateTime as wall-clock time in fromZone.
        const naive = new Date(dateTime);
        if (isNaN(naive.getTime())) return { error: "Invalid dateTime." };
        // Compute offset of fromZone at that instant by formatting.
        const asUtc = new Date(
          naive.toLocaleString("en-US", { timeZone: "UTC" })
        );
        const asFrom = new Date(
          naive.toLocaleString("en-US", { timeZone: fromZone })
        );
        const offset = asUtc.getTime() - asFrom.getTime();
        const instant = new Date(naive.getTime() + offset);
        return {
          fromZone,
          toZone,
          result: instant.toLocaleString("en-US", {
            timeZone: toZone,
            dateStyle: "medium",
            timeStyle: "short",
          }),
        };
      } catch (e) {
        return { error: `Conversion failed: ${errMsg(e)}` };
      }
    },
  }),

  convertUnits: tool({
    description:
      "Convert between common units of length, mass, temperature, or volume.",
    inputSchema: z.object({
      value: z.number(),
      from: z.string().describe("e.g. 'km', 'mi', 'kg', 'lb', 'c', 'f', 'l', 'gal'"),
      to: z.string(),
    }),
    execute: async ({ value, from, to }) => {
      const f = from.toLowerCase();
      const t = to.toLowerCase();
      // Temperature handled separately.
      const toC: Record<string, (v: number) => number> = {
        c: (v) => v,
        f: (v) => ((v - 32) * 5) / 9,
        k: (v) => v - 273.15,
      };
      const fromC: Record<string, (v: number) => number> = {
        c: (v) => v,
        f: (v) => (v * 9) / 5 + 32,
        k: (v) => v + 273.15,
      };
      if (f in toC && t in fromC) {
        const result = fromC[t](toC[f](value));
        return { value, from, to, result: Math.round(result * 1e6) / 1e6 };
      }
      // Linear units: convert to a base unit.
      const base: Record<string, number> = {
        // length -> meters
        mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048,
        yd: 0.9144, mi: 1609.344,
        // mass -> grams
        mg: 0.001, g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237,
        // volume -> liters
        ml: 0.001, l: 1, gal: 3.785411784, qt: 0.946352946, cup: 0.2365882365,
      };
      if (f in base && t in base) {
        // Only convert within the same dimension; reject cross-dimension.
        const dims = (u: string) =>
          ["mm","cm","m","km","in","ft","yd","mi"].includes(u) ? "len"
          : ["mg","g","kg","oz","lb"].includes(u) ? "mass"
          : "vol";
        if (dims(f) !== dims(t))
          return { error: `Cannot convert ${from} to ${to} (different dimensions).` };
        const result = (value * base[f]) / base[t];
        return { value, from, to, result: Math.round(result * 1e6) / 1e6 };
      }
      return { error: `Unsupported unit: '${from}' or '${to}'.` };
    },
  }),

  generatePassword: tool({
    description: "Generate a secure random password.",
    inputSchema: z.object({
      length: z.number().int().min(4).max(128).optional(),
      symbols: z.boolean().optional().describe("Include symbols (default true)"),
    }),
    execute: async ({ length, symbols }) => {
      const len = length ?? 16;
      const lower = "abcdefghijklmnopqrstuvwxyz";
      const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const nums = "0123456789";
      const syms = "!@#$%^&*()-_=+[]{}";
      const pool = lower + upper + nums + (symbols === false ? "" : syms);
      let out = "";
      const bytes = crypto.randomBytes(len);
      for (let i = 0; i < len; i++) out += pool[bytes[i] % pool.length];
      return { password: out, length: len };
    },
  }),

  hashText: tool({
    description: "Compute a cryptographic hash (md5, sha1, sha256, sha512) of text.",
    inputSchema: z.object({
      text: z.string(),
      algorithm: z.enum(["md5", "sha1", "sha256", "sha512"]).optional(),
    }),
    execute: async ({ text, algorithm }) => {
      const algo = algorithm ?? "sha256";
      return { algorithm: algo, hash: crypto.createHash(algo).update(text).digest("hex") };
    },
  }),

  encodeBase64: tool({
    description: "Encode text to Base64 or decode Base64 to text.",
    inputSchema: z.object({
      text: z.string(),
      mode: z.enum(["encode", "decode"]),
    }),
    execute: async ({ text, mode }) => {
      try {
        return mode === "encode"
          ? { result: Buffer.from(text, "utf8").toString("base64") }
          : { result: Buffer.from(text, "base64").toString("utf8") };
      } catch (e) {
        return { error: `Failed: ${errMsg(e)}` };
      }
    },
  }),

  generateUuid: tool({
    description: "Generate a random UUID (v4).",
    inputSchema: z.object({
      count: z.number().int().min(1).max(20).optional(),
    }),
    execute: async ({ count }) => {
      const n = count ?? 1;
      return { uuids: Array.from({ length: n }, () => crypto.randomUUID()) };
    },
  }),

  randomNumber: tool({
    description: "Generate a random integer between min and max (inclusive).",
    inputSchema: z.object({ min: z.number().int(), max: z.number().int() }),
    execute: async ({ min, max }) => {
      if (min > max) return { error: "min must be <= max." };
      return { result: Math.floor(Math.random() * (max - min + 1)) + min };
    },
  }),

  rollDice: tool({
    description: "Roll dice in NdM notation (e.g. '2d6' rolls two six-sided dice).",
    inputSchema: z.object({ notation: z.string().describe("e.g. '2d6', '1d20'") }),
    execute: async ({ notation }) => {
      const m = /^(\d+)d(\d+)$/i.exec(notation.trim());
      if (!m) return { error: "Use NdM notation, e.g. '2d6'." };
      const n = Number(m[1]), sides = Number(m[2]);
      if (n < 1 || n > 100 || sides < 2 || sides > 1000)
        return { error: "Out of range (1-100 dice, 2-1000 sides)." };
      const rolls = Array.from({ length: n }, () => Math.floor(Math.random() * sides) + 1);
      return { notation, rolls, total: rolls.reduce((a, b) => a + b, 0) };
    },
  }),

  qrCode: tool({
    description:
      "Generate a QR code image URL for given text/URL. Returns a link the user can open.",
    inputSchema: z.object({ data: z.string() }),
    execute: async ({ data }) => {
      const url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
        data
      )}`;
      return { qrImageUrl: url, encodes: data };
    },
  }),

  colorInfo: tool({
    description:
      "Convert a hex color to RGB/HSL and report basic info. Accepts '#rrggbb' or 'rrggbb'.",
    inputSchema: z.object({ hex: z.string() }),
    execute: async ({ hex }) => {
      const h = hex.replace(/^#/, "");
      if (!/^[0-9a-fA-F]{6}$/.test(h)) return { error: "Use a 6-digit hex color." };
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      const rn = r / 255, gn = g / 255, bn = b / 255;
      const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
      let hue = 0;
      const l = (max + min) / 2;
      const d = max - min;
      const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
      if (d !== 0) {
        if (max === rn) hue = ((gn - bn) / d) % 6;
        else if (max === gn) hue = (bn - rn) / d + 2;
        else hue = (rn - gn) / d + 4;
        hue = Math.round(hue * 60);
        if (hue < 0) hue += 360;
      }
      return {
        hex: `#${h.toLowerCase()}`,
        rgb: { r, g, b },
        hsl: { h: hue, s: Math.round(s * 100), l: Math.round(l * 100) },
      };
    },
  }),

  countText: tool({
    description: "Count characters, words, and lines in a piece of text.",
    inputSchema: z.object({ text: z.string() }),
    execute: async ({ text }) => ({
      characters: text.length,
      charactersNoSpaces: text.replace(/\s/g, "").length,
      words: (text.trim().match(/\S+/g) || []).length,
      lines: text.split(/\r\n|\r|\n/).length,
    }),
  }),
};
