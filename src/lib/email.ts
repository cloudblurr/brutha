import nodemailer, { type Transporter } from "nodemailer";
import { getSetting } from "./db";

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
 *
 * The "From" identity (display name + address shown to recipients) can be
 * overridden per scope at runtime via the `settings` table (key
 * "email.from"), configured during onboarding. This lets the operator — and
 * later, per-user once auth exists — set their own sender identity without
 * touching env or redeploying. SMTP transport credentials (host/auth) still
 * come from env; only the visible From line is overridable here.
 */

/**
 * Resolve the "From" header. Prefers the onboarding-configured identity stored
 * in the settings table, falling back to SMTP_FROM, then SMTP_USER. The `scope`
 * is forward-looking for per-user identities once auth lands.
 */
export function getEmailIdentity(scope = "global"): string | undefined {
  try {
    const stored = getSetting("email.from", scope);
    if (stored && stored.trim()) return stored.trim();
  } catch {
    // DB not ready / migration not run yet — fall back to env silently.
  }
  return process.env.SMTP_FROM || process.env.SMTP_USER;
}

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
    from: getEmailIdentity(),
    to: opts.to,
    subject: opts.subject,
    text: opts.body,
  });
  return {
    messageId: info.messageId,
    accepted: (info.accepted as string[]) ?? [],
  };
}
