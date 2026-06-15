import { tool } from "ai";
import { z } from "zod";
import { isEmailConfigured, sendEmail } from "../email";

// Default test recipient comes ONLY from the environment (TEST_EMAIL_TO).
// We intentionally do NOT hard-code a real address in source.
const DEFAULT_TEST_RECIPIENT = process.env.TEST_EMAIL_TO || "";

export const emailTools = {
  sendEmail: tool({
    description:
      "Send an email. If 'to' is omitted, sends to the configured default test recipient (TEST_EMAIL_TO). This is a sensitive action: unless 'confirmed' is true, it returns a confirmation request that the UI shows as a card — do NOT set confirmed yourself; only the user confirms via the card.",
    inputSchema: z.object({
      to: z
        .string()
        .optional()
        .describe(
          "Recipient email address. If omitted, falls back to the TEST_EMAIL_TO env var (if set)."
        ),
      subject: z.string(),
      body: z.string(),
      confirmed: z
        .boolean()
        .optional()
        .describe(
          "Set to true ONLY after the user has approved sending via the confirmation card. Never set this on the first call."
        ),
    }),
    execute: async ({ to, subject, body, confirmed }) => {
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
      // Confirmation gate: surface a card to the user before actually sending.
      if (!confirmed) {
        return {
          needsConfirmation: true,
          action: "sendEmail",
          summary: `Send an email to ${recipient}`,
          details: { to: recipient, subject, body },
          message:
            "Awaiting user confirmation. Show the confirmation card and do not send until the user approves.",
        };
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
