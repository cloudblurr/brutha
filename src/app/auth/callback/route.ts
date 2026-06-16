import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth / email-confirmation callback.
 *
 * Supabase redirects here with a `code` after an OAuth sign-in or magic-link /
 * email confirmation. We exchange it for a session (cookies are set by the SSR
 * client) and bounce the user to their intended destination.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const redirectTo = url.searchParams.get("redirectTo") || "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(redirectTo, url.origin));
    }
    return NextResponse.redirect(
      new URL(`/login?error=oauth`, url.origin)
    );
  }

  return NextResponse.redirect(new URL("/login", url.origin));
}
