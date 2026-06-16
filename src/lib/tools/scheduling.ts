import { tool } from "ai";
import { z } from "zod";

/**
 * Scheduling-assistant tools.
 *
 * suggestMeetingTimes: generate candidate slots within working hours over a
 *   date range, skipping weekends by default — pure date math, no calendar
 *   integration required.
 * parseMeetingFromText: extract a probable title, datetime, duration, and
 *   attendee emails from free-form text (e.g. a pasted email), so the user can
 *   turn an email into a calendar event. Deterministic best-effort parsing; it
 *   reports what it found and flags low confidence rather than guessing wildly.
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function localIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:00`;
}

export const schedulingTools = {
  suggestMeetingTimes: tool({
    description:
      "Suggest candidate meeting slots within working hours across a date range. Returns ISO start times. Skips weekends unless includeWeekends is true.",
    inputSchema: z.object({
      startDate: z.string().describe("First date to consider, e.g. '2026-07-01'."),
      days: z.number().int().min(1).max(14).optional().describe("How many days to scan (default 5)."),
      durationMinutes: z.number().int().min(15).max(480).optional().describe("Meeting length (default 30)."),
      workdayStartHour: z.number().int().min(0).max(23).optional().describe("Default 9."),
      workdayEndHour: z.number().int().min(1).max(24).optional().describe("Default 17."),
      slotsPerDay: z.number().int().min(1).max(8).optional().describe("Max suggestions per day (default 3)."),
      includeWeekends: z.boolean().optional(),
    }),
    execute: async ({
      startDate,
      days,
      durationMinutes,
      workdayStartHour,
      workdayEndHour,
      slotsPerDay,
      includeWeekends,
    }) => {
      const base = new Date(`${startDate}T00:00:00`);
      if (isNaN(base.getTime())) return { error: "Invalid startDate." };
      const nDays = days ?? 5;
      const dur = durationMinutes ?? 30;
      const startH = workdayStartHour ?? 9;
      const endH = workdayEndHour ?? 17;
      const perDay = slotsPerDay ?? 3;
      if (endH <= startH) return { error: "workdayEndHour must be after workdayStartHour." };

      const suggestions: Array<{ start: string; end: string; weekday: string }> = [];
      for (let day = 0; day < nDays; day++) {
        const d = new Date(base);
        d.setDate(base.getDate() + day);
        const isWeekend = [0, 6].includes(d.getDay());
        if (isWeekend && !includeWeekends) continue;

        // Evenly space `perDay` slots across the working window.
        const windowMinutes = (endH - startH) * 60 - dur;
        if (windowMinutes < 0) continue;
        const step = perDay > 1 ? Math.floor(windowMinutes / (perDay - 1)) : 0;
        for (let i = 0; i < perDay; i++) {
          const slot = new Date(d);
          const offset = perDay > 1 ? step * i : Math.floor(windowMinutes / 2);
          slot.setHours(startH, 0, 0, 0);
          slot.setMinutes(slot.getMinutes() + offset);
          const end = new Date(slot.getTime() + dur * 60000);
          suggestions.push({
            start: localIso(slot),
            end: localIso(end),
            weekday: slot.toLocaleDateString("en-US", { weekday: "long" }),
          });
        }
      }
      return { durationMinutes: dur, count: suggestions.length, suggestions };
    },
  }),

  parseMeetingFromText: tool({
    description:
      "Extract a probable meeting title, date/time, duration, and attendee emails from free-form text (e.g. a pasted email). Best-effort: reports confidence and what it found; the user should confirm before creating an event.",
    inputSchema: z.object({
      text: z.string().min(1),
    }),
    execute: async ({ text }) => {
      const emails = Array.from(
        new Set(text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [])
      );

      // Date: ISO (2026-07-01) or common "Month DD" / "DD Month" patterns.
      const isoDate = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
      const monthNames =
        "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
      const wordDate =
        text.match(new RegExp(`\\b${monthNames}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i")) ||
        text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthNames}\\b`, "i"));

      // Time: 3pm, 3:30 pm, 15:00.
      const timeMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) || text.match(/\b(\d{1,2}):(\d{2})\b/);

      // Duration: "30 min", "1 hour", "1.5 hours".
      const durMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(min(?:ute)?s?|hours?|hrs?)\b/i);
      let durationMinutes: number | undefined;
      if (durMatch) {
        const val = parseFloat(durMatch[1]);
        durationMinutes = /h/i.test(durMatch[2]) ? Math.round(val * 60) : Math.round(val);
      }

      // Title heuristic: a "Subject:" line, else the first non-empty line.
      const subjectLine = text.match(/^\s*subject\s*:\s*(.+)$/im);
      const firstLine = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0);
      const title = (subjectLine?.[1] ?? firstLine ?? "Meeting").slice(0, 120);

      const foundDate = isoDate?.[0] ?? wordDate?.[0] ?? null;
      const foundTime = timeMatch?.[0] ?? null;

      // Confidence: high if we have both a date and a time, medium if one,
      // low if neither.
      const confidence =
        foundDate && foundTime ? "high" : foundDate || foundTime ? "medium" : "low";

      return {
        title,
        date: foundDate,
        time: foundTime,
        durationMinutes: durationMinutes ?? null,
        attendees: emails,
        confidence,
        note:
          confidence === "low"
            ? "Could not confidently find a date/time — ask the user to confirm before creating an event."
            : "Confirm details with the user, then call createCalendarEvent.",
      };
    },
  }),
};
