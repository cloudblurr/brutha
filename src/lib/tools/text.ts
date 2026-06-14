import { tool } from "ai";
import { z } from "zod";

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export const textTools = {
  translate: tool({
    description:
      "Translate text into another language using a free translation API. Use ISO codes like 'es', 'fr', 'de', 'ja'.",
    inputSchema: z.object({
      text: z.string(),
      to: z.string().describe("Target language code, e.g. 'es'"),
      from: z.string().optional().describe("Source language code; 'auto' to detect"),
    }),
    execute: async ({ text, to, from }) => {
      try {
        // MyMemory free translation API (no key for modest usage).
        const pair = `${(from && from !== "auto" ? from : "en")}|${to}`;
        const res = await fetch(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
            text
          )}&langpair=${encodeURIComponent(pair)}`
        );
        const data = await res.json();
        const translated = data?.responseData?.translatedText;
        if (!translated) return { error: "Translation failed." };
        return { from: from ?? "en", to, original: text, translated };
      } catch (e) {
        return { error: `Translation failed: ${errMsg(e)}` };
      }
    },
  }),

  slugify: tool({
    description: "Convert text into a URL-friendly slug (lowercase, hyphens).",
    inputSchema: z.object({ text: z.string() }),
    execute: async ({ text }) => ({
      slug: text
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    }),
  }),

  changeCase: tool({
    description:
      "Convert text to a different case: upper, lower, title, camel, snake, or kebab.",
    inputSchema: z.object({
      text: z.string(),
      style: z.enum(["upper", "lower", "title", "camel", "snake", "kebab"]),
    }),
    execute: async ({ text, style }) => {
      const words = text.trim().split(/[\s_-]+/).filter(Boolean);
      let result: string;
      switch (style) {
        case "upper": result = text.toUpperCase(); break;
        case "lower": result = text.toLowerCase(); break;
        case "title":
          result = text.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
          break;
        case "camel":
          result = words
            .map((w, i) =>
              i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()
            )
            .join("");
          break;
        case "snake": result = words.map((w) => w.toLowerCase()).join("_"); break;
        case "kebab": result = words.map((w) => w.toLowerCase()).join("-"); break;
      }
      return { result };
    },
  }),

  regexExtract: tool({
    description: "Extract all matches of a regex pattern from text.",
    inputSchema: z.object({
      text: z.string(),
      pattern: z.string().describe("A JavaScript regex pattern (no slashes)"),
      flags: z.string().optional().describe("Regex flags, e.g. 'gi'"),
    }),
    execute: async ({ text, pattern, flags }) => {
      try {
        const re = new RegExp(pattern, (flags ?? "") + (flags?.includes("g") ? "" : "g"));
        const matches = [...text.matchAll(re)].map((m) => m[0]);
        return { count: matches.length, matches: matches.slice(0, 100) };
      } catch (e) {
        return { error: `Invalid regex: ${errMsg(e)}` };
      }
    },
  }),

  numberToWords: tool({
    description: "Spell out an integer in English words (e.g. 1234 -> 'one thousand two hundred thirty-four').",
    inputSchema: z.object({ number: z.number().int() }),
    execute: async ({ number }) => {
      if (Math.abs(number) > 999_999_999_999)
        return { error: "Number too large." };
      const ones = ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
      const tens = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
      const scales = ["","thousand","million","billion"];
      function under1000(n: number): string {
        let s = "";
        if (n >= 100) { s += ones[Math.floor(n / 100)] + " hundred"; n %= 100; if (n) s += " "; }
        if (n >= 20) { s += tens[Math.floor(n / 10)]; if (n % 10) s += "-" + ones[n % 10]; }
        else if (n > 0) s += ones[n];
        return s;
      }
      let n = Math.abs(number);
      if (n === 0) return { number, words: "zero" };
      const parts: string[] = [];
      let scale = 0;
      while (n > 0) {
        const chunk = n % 1000;
        if (chunk) parts.unshift(under1000(chunk) + (scales[scale] ? " " + scales[scale] : ""));
        n = Math.floor(n / 1000);
        scale++;
      }
      return { number, words: (number < 0 ? "negative " : "") + parts.join(" ") };
    },
  }),

  formatJson: tool({
    description: "Pretty-print / validate a JSON string. Returns formatted JSON or a parse error.",
    inputSchema: z.object({
      json: z.string(),
      indent: z.number().int().min(0).max(8).optional(),
    }),
    execute: async ({ json, indent }) => {
      try {
        const parsed = JSON.parse(json);
        return { valid: true, formatted: JSON.stringify(parsed, null, indent ?? 2) };
      } catch (e) {
        return { valid: false, error: `Invalid JSON: ${errMsg(e)}` };
      }
    },
  }),

  csvToJson: tool({
    description: "Convert CSV text (with a header row) into an array of JSON objects.",
    inputSchema: z.object({ csv: z.string() }),
    execute: async ({ csv }) => {
      try {
        const lines = csv.trim().split(/\r?\n/);
        if (lines.length < 2) return { error: "Need a header row and at least one data row." };
        const headers = lines[0].split(",").map((h) => h.trim());
        const rows = lines.slice(1).map((line) => {
          const cells = line.split(",");
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => (obj[h] = (cells[i] ?? "").trim()));
          return obj;
        });
        return { count: rows.length, rows: rows.slice(0, 100) };
      } catch (e) {
        return { error: `CSV parse failed: ${errMsg(e)}` };
      }
    },
  }),

  parseUrl: tool({
    description: "Parse a URL into its components (protocol, host, path, query params).",
    inputSchema: z.object({ url: z.string() }),
    execute: async ({ url }) => {
      try {
        const u = new URL(url);
        return {
          protocol: u.protocol.replace(":", ""),
          host: u.host,
          pathname: u.pathname,
          query: Object.fromEntries(u.searchParams.entries()),
          hash: u.hash,
        };
      } catch (e) {
        return { error: `Invalid URL: ${errMsg(e)}` };
      }
    },
  }),

  sortList: tool({
    description: "Sort a list of items alphabetically or numerically, ascending or descending.",
    inputSchema: z.object({
      items: z.array(z.string()),
      numeric: z.boolean().optional(),
      descending: z.boolean().optional(),
    }),
    execute: async ({ items, numeric, descending }) => {
      const sorted = [...items].sort((a, b) =>
        numeric ? Number(a) - Number(b) : a.localeCompare(b)
      );
      if (descending) sorted.reverse();
      return { sorted };
    },
  }),
};
