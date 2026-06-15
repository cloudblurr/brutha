import { getSetting, setSetting } from "@/lib/db";
import { isEmailConfigured } from "@/lib/email";
import { resolveRequestScope } from "@/lib/request-scope";

export const runtime = "nodejs";

/**
 * Email identity settings (onboarding).
 *
 * GET  -> current "from" identity (stored or env fallback) + whether SMTP
 *         transport is configured.
 * POST -> set the "from" identity ({ from: "Name <addr@example.com>" }).
 *
 * Scoped per signed-in user (falls back to the "global" operator scope when
 * unauthenticated), so each user gets their own sender identity.
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Pull a bare email address out of a "Name <addr>" or plain "addr" string. */
function extractAddress(from: string): string | null {
  const angle = from.match(/<([^>]+)>/);
  const addr = (angle ? angle[1] : from).trim();
  return EMAIL_RE.test(addr) ? addr : null;
}

export async function GET() {
  const scope = await resolveRequestScope();
  const stored = getSetting("email.from", scope);
  const effective = stored || process.env.SMTP_FROM || process.env.SMTP_USER || null;
  return Response.json({
    from: effective,
    source: stored ? "settings" : effective ? "env" : "unset",
    smtpConfigured: isEmailConfigured(),
  });
}

export async function POST(req: Request) {
  const scope = await resolveRequestScope();
  let from: unknown;
  try {
    ({ from } = await req.json());
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof from !== "string" || !from.trim()) {
    return Response.json(
      { error: "Provide a non-empty 'from' string, e.g. \"Name <you@example.com>\"." },
      { status: 400 }
    );
  }
  if (!extractAddress(from)) {
    return Response.json(
      { error: `'${from}' does not contain a valid email address.` },
      { status: 400 }
    );
  }
  setSetting("email.from", from.trim(), scope);
  return Response.json({ saved: true, from: from.trim() });
}
