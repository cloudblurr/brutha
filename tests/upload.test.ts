import { test, describe } from "vitest";
import assert from "node:assert/strict";
import {
  checkUpload,
  isTextLike,
  safeFileName,
  MAX_UPLOAD_BYTES,
  ALLOWED_UPLOAD_TYPES,
} from "../src/lib/upload";

describe("upload allow-list", () => {
  test("accepts allowed image and document types", () => {
    for (const t of ["image/png", "application/pdf", "text/csv", "application/json"]) {
      assert.equal(checkUpload(t, 1024).ok, true, `${t} should be allowed`);
    }
  });

  test("rejects disallowed types with 415", () => {
    const r = checkUpload("application/x-msdownload", 10);
    assert.equal(r.ok, false);
    assert.equal(r.status, 415);
    assert.match(r.error!, /not allowed/);
  });

  test("rejects empty/unknown type as octet-stream", () => {
    const r = checkUpload("", 10);
    assert.equal(r.ok, false);
    assert.equal(r.status, 415);
  });

  test("rejects oversize files with 413", () => {
    const r = checkUpload("image/png", MAX_UPLOAD_BYTES + 1);
    assert.equal(r.ok, false);
    assert.equal(r.status, 413);
    assert.match(r.error!, /too large/);
  });

  test("accepts a file exactly at the size cap", () => {
    assert.equal(checkUpload("image/png", MAX_UPLOAD_BYTES).ok, true);
  });

  test("allow-list is a non-trivial set", () => {
    assert.ok(ALLOWED_UPLOAD_TYPES.size >= 10);
  });
});

describe("isTextLike", () => {
  test("text/* and json/xml/javascript are text-like", () => {
    for (const t of [
      "text/plain",
      "text/markdown",
      "application/json",
      "application/xml",
      "application/javascript",
    ]) {
      assert.equal(isTextLike(t), true, `${t} should be text-like`);
    }
  });

  test("binary types are not text-like", () => {
    for (const t of ["image/png", "application/pdf"]) {
      assert.equal(isTextLike(t), false, `${t} should not be text-like`);
    }
  });
});

describe("safeFileName", () => {
  test("neutralizes path separators (no traversal possible)", () => {
    // Slashes become underscores, so the result can never escape the dir.
    const out = safeFileName("../../etc/passwd");
    assert.ok(!out.includes("/"));
    assert.ok(!out.includes("\\"));
    assert.equal(out, ".._.._etc_passwd");
    assert.equal(safeFileName("my report (final).pdf"), "my_report_final_.pdf");
  });

  test("preserves dots, dashes, underscores", () => {
    assert.equal(safeFileName("a-b_c.1.txt"), "a-b_c.1.txt");
  });

  test("falls back to 'upload' for empty names, never empty output", () => {
    assert.equal(safeFileName(""), "upload");
    // Non-empty but all-unsafe input still yields a safe, non-empty name.
    assert.ok(safeFileName("///").length > 0);
  });

  test("truncates very long names to 120 chars", () => {
    const long = "x".repeat(500) + ".txt";
    assert.ok(safeFileName(long).length <= 120);
  });
});
