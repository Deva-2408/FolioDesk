import test from "node:test";
import assert from "node:assert/strict";
import { buildEncryptedSamplePdf } from "./pdfEncryptSample";

test("buildEncryptedSamplePdf emits a valid PDF 1.4 header, Encrypt dictionary, and trailer", () => {
  const bytes = buildEncryptedSamplePdf("study2026");
  const text = new TextDecoder("latin1").decode(bytes);
  assert.ok(text.startsWith("%PDF-1.4"), "starts with PDF 1.4 header");
  assert.ok(text.includes("/Encrypt 9 0 R"), "trailer references /Encrypt dictionary");
  assert.ok(text.includes("/Filter /Standard /V 1 /R 2"), "uses PDF Standard Security Handler");
  assert.ok(!text.includes("Eigenvalue Decomposition"), "content stream is encrypted, not plaintext");
});
