import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

/**
 * Serve a previously uploaded file from ./data/uploads by its stored name.
 * The stored name is `<uuid>__<safeName>`; we reject any path traversal.
 */

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".pdf": "application/pdf",
  ".txt": "text/plain", ".md": "text/markdown", ".csv": "text/csv",
  ".json": "application/json", ".html": "text/html", ".xml": "application/xml",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  // Reject traversal / nested paths.
  if (!name || name.includes("/") || name.includes("..") || name.includes("\\")) {
    return new Response("Bad request", { status: 400 });
  }
  const filePath = path.join(UPLOAD_DIR, name);
  if (!filePath.startsWith(UPLOAD_DIR) || !fs.existsSync(filePath)) {
    return new Response("Not found", { status: 404 });
  }
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(name).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "private, max-age=3600",
    },
  });
}
