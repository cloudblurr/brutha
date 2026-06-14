import nodemailer, { type Transporter } from "nodemailer";

/**
 * Email sending via SMTP. Configured entirely through environment variables
 * so no credentials are ever committed:
 *
 *   SMTP_HOST      e.g. smtp.gmail.com
 *   SMTP_PORT      e.g. 465 (SSL) or 587 (STARTTLS)
 *   SMTP_USER      your SMTP username / email
 *   SMTP_PASS      your SMTP password or app-specific password
 *   SMTP_FROM      optional "From" address (defaults to SMTP_USER)
 *
 * If these are not set, the agent's sendEmail tool reports that email is
 * not configured instead of crashing.
 */

export function isEmailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
  );
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // true for 465, false for 587/STARTTLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ messageId: string; accepted: string[] }> {
  const info = await getTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: opts.to,
    subject: opts.subject,
    text: opts.body,
  });
  return {
    messageId: info.messageId,
    accepted: (info.accepted as string[]) ?? [],
  };
}
