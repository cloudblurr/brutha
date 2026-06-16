import { getSetting, setSetting } from "@/lib/settings";
import { isEmailConfigured } from "@/lib/email";
import { withRequestContext } from "@/lib/request-scope";

export const runtime = "nodejs";

/**
 * Email identity settings.
 *
 * GET  -> current "from" identity (stored or env fallback) + whether SMTP
 *         transport is configured.
 * POST -> set the "from" identity ({ from: "Name <addr@example.com>" }).
 *
 * Scoped per signed-in user via Supabase RLS. Unauthenticated requests get 401.
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Pull a bare email address out of a "Name <addr>" or plain "addr" string. */
function extractAddress(from: string): string | null {
  const angle = from.match(/<([^>]+)>/);
  const addr = (angle ? angle[1] : from).trim();
  return EMAIL_RE.test(addr) ? addr : null;
}

export async function GET() {
  const { userId, value } = await withRequestContext(async () => {
    const stored = await getSetting("email.from");
    const effective =
      stored || process.env.SMTP_FROM || process.env.SMTP_USER || null;
    return {
      from: effective,
      source: stored ? "settings" : effective ? "env" : "unset",
      smtpConfigured: isEmailConfigured(),
    };
  });
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(value);
}

export async function POST(req: Request) {
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

  const trimmed = from.trim();
  const { userId } = await withRequestContext(async () => {
    await setSetting("email.from", trimmed);
  });
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json({ saved: true, from: trimmed });
}
