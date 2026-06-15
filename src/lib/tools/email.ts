import { tool } from "ai";
import { z } from "zod";
import { isEmailConfigured, sendEmail } from "../email";

// Default test recipient comes ONLY from the environment (TEST_EMAIL_TO).
// We intentionally do NOT hard-code a real address in source.
const DEFAULT_TEST_RECIPIENT = process.env.TEST_EMAIL_TO || "";

export const emailTools = {
  sendEmail: tool({
    description:
      "Send an email. If 'to' is omitted, sends to the configured default test recipient (TEST_EMAIL_TO). Confirm recipient, subject, and body with the user if anything is ambiguous.",
    inputSchema: z.object({
      to: z
        .string()
        .optional()
        .describe(
          "Recipient email address. If omitted, falls back to the TEST_EMAIL_TO env var (if set)."
        ),
      subject: z.string(),
      body: z.string(),
    }),
    execute: async ({ to, subject, body }) => {
      const recipient = to || DEFAULT_TEST_RECIPIENT;
      if (!isEmailConfigured()) {
        return {
          error:
            "Email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in .env.local.",
          wouldHaveSentTo: recipient || "(no recipient — set TEST_EMAIL_TO or pass 'to')",
        };
      }
      if (!recipient) {
        return {
          error:
            "No recipient. Provide a 'to' address or set TEST_EMAIL_TO in .env.local.",
        };
      }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
        return { error: `'${recipient}' is not a valid email address.` };
      }
      try {
        const result = await sendEmail({ to: recipient, subject, body });
        return { sent: true, to: recipient, subject, messageId: result.messageId };
      } catch (e) {
        return {
          error: `Failed to send email: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    },
  }),
};
