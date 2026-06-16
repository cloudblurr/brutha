import { describe, it, expect } from "vitest";
import { schedulingTools } from "@/lib/tools/scheduling";
import { documentTools } from "@/lib/tools/documents";

type ExecFn = (args: Record<string, unknown>, opts: { toolCallId: string; messages: [] }) => Promise<unknown>;
function exec(tool: unknown): ExecFn {
  const e = (tool as { execute?: ExecFn }).execute;
  if (!e) throw new Error("no execute");
  return e;
}
const OPTS = { toolCallId: "t", messages: [] as [] };

describe("suggestMeetingTimes", () => {
  it("skips weekends by default and respects working hours", async () => {
    // 2026-07-04 is a Saturday; start there and ensure no weekend slots leak.
    const r = (await exec(schedulingTools.suggestMeetingTimes)(
      { startDate: "2026-07-04", days: 3, slotsPerDay: 2 },
      OPTS
    )) as { suggestions: { start: string; weekday: string }[] };
    expect(r.suggestions.length).toBeGreaterThan(0);
    for (const s of r.suggestions) {
      expect(["Saturday", "Sunday"]).not.toContain(s.weekday);
      const hour = Number(s.start.slice(11, 13));
      expect(hour).toBeGreaterThanOrEqual(9);
      expect(hour).toBeLessThanOrEqual(17);
    }
  });

  it("includes weekends when asked", async () => {
    const r = (await exec(schedulingTools.suggestMeetingTimes)(
      { startDate: "2026-07-04", days: 2, slotsPerDay: 1, includeWeekends: true },
      OPTS
    )) as { suggestions: { weekday: string }[] };
    expect(r.suggestions.some((s) => s.weekday === "Saturday")).toBe(true);
  });

  it("rejects an invalid start date", async () => {
    const r = (await exec(schedulingTools.suggestMeetingTimes)({ startDate: "nonsense" }, OPTS)) as {
      error?: string;
    };
    expect(r.error).toBeTruthy();
  });
});

describe("parseMeetingFromText", () => {
  it("extracts date, time, attendees with high confidence", async () => {
    const r = (await exec(schedulingTools.parseMeetingFromText)(
      {
        text: "Subject: Q3 review\nLet's meet on 2026-07-15 at 3:30 pm for 1 hour. cc alice@acme.com and bob@acme.com",
      },
      OPTS
    )) as { date: string; time: string; durationMinutes: number; attendees: string[]; confidence: string; title: string };
    expect(r.date).toBe("2026-07-15");
    expect(r.time?.toLowerCase()).toContain("3:30");
    expect(r.durationMinutes).toBe(60);
    expect(r.attendees).toEqual(["alice@acme.com", "bob@acme.com"]);
    expect(r.confidence).toBe("high");
    expect(r.title).toBe("Q3 review");
  });

  it("reports low confidence when no date/time present", async () => {
    const r = (await exec(schedulingTools.parseMeetingFromText)(
      { text: "Can we sync sometime soon?" },
      OPTS
    )) as { confidence: string };
    expect(r.confidence).toBe("low");
  });
});

describe("draftEmail", () => {
  it("returns a draft with subject + body and does not send", async () => {
    const r = (await exec(documentTools.draftEmail)(
      { to: "Jane (CFO)", from: "Sam", intent: "Request the Q3 budget figures.", keyPoints: ["Need by Friday"] },
      OPTS
    )) as { draft: boolean; subject: string; body: string };
    expect(r.draft).toBe(true);
    expect(r.subject.length).toBeGreaterThan(0);
    expect(r.body).toContain("Hi Jane");
    expect(r.body).toContain("Need by Friday");
    expect(r.body).toContain("Sam");
  });
});

describe("generateDocument", () => {
  it("produces Markdown with headings, meta table and bullets", async () => {
    const r = (await exec(documentTools.generateDocument)(
      {
        title: "One-Pager",
        meta: { Author: "Sam", Date: "2026-07-01" },
        sections: [{ heading: "Summary", body: "All good.", bullets: ["Point A", "Point B"] }],
      },
      OPTS
    )) as { markdown: string; format: string };
    expect(r.format).toBe("markdown");
    expect(r.markdown).toContain("# One-Pager");
    expect(r.markdown).toContain("## Summary");
    expect(r.markdown).toContain("| **Author** | Sam |");
    expect(r.markdown).toContain("- Point A");
  });
});
