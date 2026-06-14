import { tool } from "ai";
import { z } from "zod";
import { isEmailConfigured, sendEmail } from "../email";

// Default test recipient (override with TEST_EMAIL_TO in the environment).
const DEFAULT_TEST_RECIPIENT =
  process.env.TEST_EMAIL_TO || "dev00engine@blurr.cloud";

export const emailTools = {
  sendEmail: tool({
    description:
      "Send an email. If 'to' is omitted, sends to the configured default test recipient. Confirm recipient, subject, and body with the user if anything is ambiguous.",
    inputSchema: z.object({
      to: z
        .string()
        .optional()
        .describe(
          `Recipient email address. Defaults to ${DEFAULT_TEST_RECIPIENT} if omitted.`
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
          wouldHaveSentTo: recipient,
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
