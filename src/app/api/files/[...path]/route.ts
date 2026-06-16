import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Serve a previously uploaded file from the Supabase Storage `uploads` bucket.
 *
 * The path is the object key `<userId>/<uuid>__<safeName>`. We mint a short-
 * lived signed URL as the signed-in user (Storage RLS ensures they can only
 * sign their own objects) and redirect to it. Keeps the bucket fully private
 * while letting the browser render images / download files.
 */

const BUCKET = "uploads";
const SIGNED_TTL = 60 * 60; // 1 hour

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const objectPath = (path ?? []).map(decodeURIComponent).join("/");

  // Reject traversal.
  if (!objectPath || objectPath.includes("..")) {
    return new Response("Bad request", { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(objectPath, SIGNED_TTL);

  if (error || !data?.signedUrl) {
    return new Response("Not found", { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl);
}
