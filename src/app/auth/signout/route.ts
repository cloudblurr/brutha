import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Sign the user out (clears the Supabase session cookies) and redirect home.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", new URL(request.url).origin), {
    status: 303,
  });
}
