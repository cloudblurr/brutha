import { tool } from "ai";
import { z } from "zod";
import { isEmailConfigured, sendEmail } from "../email";

export const emailTools = {
  sendEmail: tool({
    description:
      "Send an email to a recipient. Confirm recipient, subject, and body with the user if anything is ambiguous.",
    inputSchema: z.object({
      to: z.string().describe("Recipient email address"),
      subject: z.string(),
      body: z.string(),
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
          error: `Failed to send email: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    },
  }),
};
