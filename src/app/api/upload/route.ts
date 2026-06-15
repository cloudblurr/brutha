import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  ALLOWED_UPLOAD_TYPES,
  checkUpload,
  isTextLike,
  safeFileName,
} from "@/lib/upload";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * File upload endpoint.
 *
 * Accepts multipart/form-data with one `file` field. Validates against an
 * allow-list of types and a size cap (see src/lib/upload.ts), stores the file
 * under ./data/uploads (gitignored), and returns a reference the client
 * attaches to the next message. Text-like files also return extracted text so
 * the agent can read their contents; binary/image files return metadata + a
 * served URL.
 */

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

export async function POST(req: Request) {
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
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const id = randomUUID();
  const stored = `${id}__${safeFileName(file.name)}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, stored), buf);

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
    url: `/api/files/${stored}`,
    isImage: type.startsWith("image/"),
    text,
    truncated,
  });
}
