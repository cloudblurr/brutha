import { randomUUID } from "node:crypto";
import {
  ALLOWED_UPLOAD_TYPES,
  checkUpload,
  isTextLike,
  safeFileName,
} from "@/lib/upload";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * File upload endpoint — backed by Supabase Storage.
 *
 * Accepts multipart/form-data with one `file` field. Validates against an
 * allow-list of types and a size cap (src/lib/upload.ts), uploads the file to
 * the private `uploads` bucket under `<userId>/<uuid>__<safeName>` (RLS scopes
 * it to the owner), and returns a reference the client attaches to the next
 * message. Text-like files also return extracted text so the agent can read
 * them inline; binary/image files return metadata + a served URL.
 */

const BUCKET = "uploads";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No 'file' field provided." }, { status: 400 });
  }

  const type = file.type || "application/octet-stream";
  const check = checkUpload(type, file.size);
  if (!check.ok) {
    const body =
      check.status === 415
        ? { error: check.error, allowed: [...ALLOWED_UPLOAD_TYPES] }
        : { error: check.error };
    return Response.json(body, { status: check.status });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const id = randomUUID();
  // Path is namespaced by user id so Storage RLS scopes access by owner.
  const objectPath = `${user.id}/${id}__${safeFileName(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, buf, { contentType: type, upsert: false });
  if (uploadError) {
    return Response.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  // Extract text for text-like files so the agent can read them inline.
  let text: string | undefined;
  let truncated = false;
  if (isTextLike(type)) {
    const raw = buf.toString("utf8");
    const CAP = 50_000;
    text = raw.slice(0, CAP);
    truncated = raw.length > CAP;
  }

  return Response.json({
    id,
    name: file.name,
    type,
    size: file.size,
    // The served URL proxies through /api/files/[...path] which mints a short-
    // lived signed URL — keeps the bucket private while letting the client
    // render the file. Encode each path segment individually so the slash
    // between "<userId>" and "<file>" maps to the catch-all route segments.
    url: `/api/files/${objectPath.split("/").map(encodeURIComponent).join("/")}`,
    path: objectPath,
    isImage: type.startsWith("image/"),
    text,
    truncated,
  });
}
