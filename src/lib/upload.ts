/**
 * Pure, dependency-free helpers for validating uploaded files.
 *
 * Backend-agnostic: the allow-list and size rules are enforced before the file
 * is streamed to Supabase Storage. Kept pure so they can be unit-tested without
 * Next.js or a real File.
 */

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB (matches bucket limit)

// Allow-list of MIME types. Keep in sync with the composer's `accept` attr and
// the Storage bucket's allowed_mime_types (see migrations).
export const ALLOWED_UPLOAD_TYPES = new Set<string>([
  // images
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  // documents
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "text/html",
  "text/xml",
  "application/xml",
  // code-ish text
  "text/javascript",
  "application/javascript",
  "text/x-python",
]);

export const TEXT_LIKE_RE = /^(text\/|application\/(json|xml|javascript))/;

export interface UploadCheck {
  ok: boolean;
  status: number;
  error?: string;
}

/** Validate a file's MIME type and size against the allow-list + cap. */
export function checkUpload(type: string, size: number): UploadCheck {
  const mime = type || "application/octet-stream";
  if (!ALLOWED_UPLOAD_TYPES.has(mime)) {
    return { ok: false, status: 415, error: `File type '${mime}' is not allowed.` };
  }
  if (size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      status: 413,
      error: `File too large (${(size / 1e6).toFixed(1)} MB). Max ${
        MAX_UPLOAD_BYTES / 1e6
      } MB.`,
    };
  }
  return { ok: true, status: 200 };
}

/** Whether a MIME type's contents should be extracted as text. */
export function isTextLike(type: string): boolean {
  return TEXT_LIKE_RE.test(type);
}

/** Sanitize a user-supplied filename for safe storage. */
export function safeFileName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "upload";
}
