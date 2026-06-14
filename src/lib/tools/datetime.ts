import { tool } from "ai";
import { z } from "zod";

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export const dateTools = {
  dateDiff: tool({
    description:
      "Calculate the difference between two dates in days (and a human-readable breakdown).",
    inputSchema: z.object({
      from: z.string().describe("Start date, e.g. '2026-01-01'"),
      to: z.string().describe("End date, e.g. '2026-12-31'"),
    }),
    execute: async ({ from, to }) => {
      const a = new Date(from);
      const b = new Date(to);
      if (isNaN(a.getTime()) || isNaN(b.getTime()))
        return { error: "Invalid date(s)." };
      const ms = b.getTime() - a.getTime();
      const days = Math.round(ms / 86400000);
      return {
        from,
        to,
        days,
        weeks: Math.round((days / 7) * 100) / 100,
        readable: `${Math.abs(days)} day(s) ${days < 0 ? "before" : "after"}`,
      };
    },
  }),

  daysUntil: tool({
    description: "How many days until (or since) a given date, from today.",
    inputSchema: z.object({ date: z.string().describe("Target date, e.g. '2026-12-25'") }),
    execute: async ({ date }) => {
      const target = new Date(date);
      if (isNaN(target.getTime())) return { error: "Invalid date." };
      const now = new Date();
      const days = Math.ceil((target.getTime() - now.getTime()) / 86400000);
      return {
        date,
        days: Math.abs(days),
        direction: days >= 0 ? "until" : "ago",
      };
    },
  }),

  addToDate: tool({
    description:
      "Add (or subtract) days, weeks, months, or years to a date. Use negative values to subtract.",
    inputSchema: z.object({
      date: z.string(),
      days: z.number().int().optional(),
      weeks: z.number().int().optional(),
      months: z.number().int().optional(),
      years: z.number().int().optional(),
    }),
    execute: async ({ date, days, weeks, months, years }) => {
      const d = new Date(date);
      if (isNaN(d.getTime())) return { error: "Invalid date." };
      if (days) d.setDate(d.getDate() + days);
      if (weeks) d.setDate(d.getDate() + weeks * 7);
      if (months) d.setMonth(d.getMonth() + months);
      if (years) d.setFullYear(d.getFullYear() + years);
      return {
        result: d.toISOString().slice(0, 10),
        weekday: d.toLocaleDateString("en-US", { weekday: "long" }),
      };
    },
  }),

  dayOfWeek: tool({
    description: "Get the day of the week for a given date.",
    inputSchema: z.object({ date: z.string() }),
    execute: async ({ date }) => {
      const d = new Date(date);
      if (isNaN(d.getTime())) return { error: "Invalid date." };
      return {
        date,
        weekday: d.toLocaleDateString("en-US", { weekday: "long" }),
        isWeekend: [0, 6].includes(d.getDay()),
      };
    },
  }),

  createCalendarEvent: tool({
    description:
      "Create an iCalendar (.ics) event the user can import into a calendar app. Returns the ICS text and a data URL.",
    inputSchema: z.object({
      title: z.string(),
      start: z.string().describe("ISO start, e.g. '2026-07-01T15:00:00'"),
      end: z.string().optional().describe("ISO end; defaults to 1 hour after start"),
      location: z.string().optional(),
      description: z.string().optional(),
    }),
    execute: async ({ title, start, end, location, description }) => {
      try {
        const s = new Date(start);
        if (isNaN(s.getTime())) return { error: "Invalid start time." };
        const e = end ? new Date(end) : new Date(s.getTime() + 3600000);
        const fmt = (d: Date) =>
          d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
        const uid = `${Date.now()}@grok-agent`;
        const ics = [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "PRODID:-//Grok Agent//EN",
          "BEGIN:VEVENT",
          `UID:${uid}`,
          `DTSTAMP:${fmt(new Date())}`,
          `DTSTART:${fmt(s)}`,
          `DTEND:${fmt(e)}`,
          `SUMMARY:${title}`,
          location ? `LOCATION:${location}` : "",
          description ? `DESCRIPTION:${description}` : "",
          "END:VEVENT",
          "END:VCALENDAR",
        ]
          .filter(Boolean)
          .join("\r\n");
        const dataUrl = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
        return { ics, dataUrl, title };
      } catch (e) {
        return { error: `Failed to create event: ${errMsg(e)}` };
      }
    },
  }),
};
