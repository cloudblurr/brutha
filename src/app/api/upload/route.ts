import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * File upload endpoint.
 *
 * Accepts multipart/form-data with one `file` field. Validates against an
 * allow-list of types and a size cap, stores the file under ./data/uploads
 * (gitignored), and returns a reference the client attaches to the next
 * message. Text-like files also return extracted text so the agent can read
 * their contents; binary/image files return metadata + a served URL.
 */

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

// Allow-list of MIME types. Extend as needed.
const ALLOWED = new Set<string>([
  // images
  "image/png", "image/jpeg", "image/webp", "image/gif",
  // documents
  "application/pdf",
  "text/plain", "text/markdown", "text/csv",
  "application/json",
  "text/html", "text/xml", "application/xml",
  // code-ish text
  "text/javascript", "application/javascript", "text/x-python",
]);

const TEXT_LIKE = /^(text\/|application\/(json|xml|javascript))/;

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
  if (!ALLOWED.has(type)) {
    return Response.json(
      { error: `File type '${type}' is not allowed.`, allowed: [...ALLOWED] },
      { status: 415 }
    );
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `File too large (${(file.size / 1e6).toFixed(1)} MB). Max ${MAX_BYTES / 1e6} MB.` },
      { status: 413 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const id = randomUUID();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "upload";
  const stored = `${id}__${safeName}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, stored), buf);

  // Extract text for text-like files so the agent can read them inline.
  let text: string | undefined;
  let truncated = false;
  if (TEXT_LIKE.test(type)) {
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
