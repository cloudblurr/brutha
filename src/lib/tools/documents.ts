import { tool } from "ai";
import { z } from "zod";

/**
 * Document & communication drafting tools.
 *
 * These DON'T call the model again — they structure content the model already
 * produced into a clean, ready-to-use artifact (a professional email draft or a
 * formatted Markdown document). draftEmail explicitly does NOT send; it returns
 * a draft the user can review and then send via the separate sendEmail tool.
 */

const TONES = ["professional", "friendly", "formal", "concise", "persuasive"] as const;

export const documentTools = {
  draftEmail: tool({
    description:
      "Compose a professional email draft WITHOUT sending it. Provide the recipient (name and/or role), the intent/topic, and key points; returns a subject line and body. Use this whenever the user wants to write an email; only use sendEmail if they explicitly ask to send.",
    inputSchema: z.object({
      to: z.string().optional().describe("Recipient name and/or role, e.g. 'Jane (CFO)'."),
      from: z.string().optional().describe("Sender name to sign off with."),
      intent: z.string().describe("What the email needs to accomplish."),
      keyPoints: z.array(z.string()).optional().describe("Bullet points to cover."),
      tone: z.enum(TONES).optional(),
      subject: z.string().optional().describe("Override the generated subject line."),
    }),
    execute: async ({ to, from, intent, keyPoints, tone, subject }) => {
      const t = tone ?? "professional";
      const greetingName = to?.split(/[(,]/)[0]?.trim();
      const greeting = greetingName ? `Hi ${greetingName},` : "Hello,";
      const points = (keyPoints ?? []).filter((p) => p.trim());
      const bodyLines: string[] = [greeting, ""];
      bodyLines.push(intent.trim());
      if (points.length) {
        bodyLines.push("");
        for (const p of points) bodyLines.push(`• ${p.trim()}`);
      }
      bodyLines.push("");
      bodyLines.push(t === "friendly" ? "Thanks so much," : "Best regards,");
      bodyLines.push(from?.trim() || "[Your name]");

      const finalSubject =
        subject?.trim() ||
        intent.trim().replace(/[.!?].*$/, "").slice(0, 72) ||
        "Following up";

      return {
        draft: true,
        to: to ?? null,
        tone: t,
        subject: finalSubject,
        body: bodyLines.join("\n"),
        note: "This is a draft. Call sendEmail (which requires user confirmation) to actually send it.",
      };
    },
  }),

  generateDocument: tool({
    description:
      "Produce a clean, formatted Markdown document from a title, optional sections, and optional metadata. Use for one-pagers, summaries, proposals, meeting notes, checklists. Returns Markdown the user can copy or export.",
    inputSchema: z.object({
      title: z.string(),
      subtitle: z.string().optional(),
      sections: z
        .array(
          z.object({
            heading: z.string(),
            body: z.string().optional().describe("Paragraph text for the section."),
            bullets: z.array(z.string()).optional(),
          })
        )
        .optional(),
      meta: z
        .record(z.string(), z.string())
        .optional()
        .describe("Key/value metadata rendered as a small header table, e.g. {Author, Date}."),
    }),
    execute: async ({ title, subtitle, sections, meta }) => {
      const out: string[] = [`# ${title.trim()}`];
      if (subtitle?.trim()) out.push(`\n*${subtitle.trim()}*`);

      if (meta && Object.keys(meta).length) {
        out.push("");
        out.push("| | |");
        out.push("|---|---|");
        for (const [k, v] of Object.entries(meta)) out.push(`| **${k}** | ${v} |`);
      }

      for (const s of sections ?? []) {
        out.push("");
        out.push(`## ${s.heading.trim()}`);
        if (s.body?.trim()) {
          out.push("");
          out.push(s.body.trim());
        }
        if (s.bullets?.length) {
          out.push("");
          for (const b of s.bullets) out.push(`- ${b.trim()}`);
        }
      }

      const markdown = out.join("\n") + "\n";
      return {
        format: "markdown",
        title,
        wordCount: markdown.split(/\s+/).filter(Boolean).length,
        markdown,
      };
    },
  }),
};
