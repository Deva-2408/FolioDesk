import test from "node:test";
import assert from "node:assert/strict";
import type { PdfPageItem } from "../types/pdf";
import {
  movePage,
  reorderPages,
  reversePages,
  rotatePages,
  togglePageInvert,
  duplicatePage,
  deletePages,
  insertBlankPageAt,
  parsePageRange,
  getEffectiveDimensions,
} from "./pageOperations";

function makePages(count: number): PdfPageItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    kind: "pdf",
    sourceId: "doc1",
    sourceName: "Lecture.pdf",
    sourcePageIndex: i,
    widthPt: 792,
    heightPt: 612,
    rotation: 0,
    invertMode: "none",
  }));
}

test("movePage moves slides up, down, top, and bottom respecting bounds", () => {
  const pages = makePages(4);
  assert.deepEqual(
    movePage(pages, 1, "up").map((p) => p.id),
    ["p2", "p1", "p3", "p4"],
  );
  assert.deepEqual(
    movePage(pages, 0, "up").map((p) => p.id),
    ["p1", "p2", "p3", "p4"],
  );
  assert.deepEqual(
    movePage(pages, 1, "down").map((p) => p.id),
    ["p1", "p3", "p2", "p4"],
  );
  assert.deepEqual(
    movePage(pages, 3, "top").map((p) => p.id),
    ["p4", "p1", "p2", "p3"],
  );
  assert.deepEqual(
    movePage(pages, 0, "bottom").map((p) => p.id),
    ["p2", "p3", "p4", "p1"],
  );
});

test("reorderPages and reversePages produce expected order immutably", () => {
  const pages = makePages(4);
  const reordered = reorderPages(pages, 0, 2);
  assert.deepEqual(
    reordered.map((p) => p.id),
    ["p2", "p3", "p1", "p4"],
  );
  assert.deepEqual(
    reversePages(pages).map((p) => p.id),
    ["p4", "p3", "p2", "p1"],
  );
  // original untouched
  assert.deepEqual(
    pages.map((p) => p.id),
    ["p1", "p2", "p3", "p4"],
  );
});

test("rotatePages wraps 0 -> 270 -> 180 -> 90 -> 0 cleanly", () => {
  let pages = makePages(2);
  const target = new Set(["p1"]);
  pages = rotatePages(pages, target, -90);
  assert.equal(pages[0].rotation, 270);
  assert.equal(pages[1].rotation, 0);
  pages = rotatePages(pages, target, 90);
  assert.equal(pages[0].rotation, 0);
  pages = rotatePages(pages, target, 180);
  assert.equal(pages[0].rotation, 180);
});

test("togglePageInvert switches between preferred mode and none", () => {
  let pages = makePages(2);
  pages = togglePageInvert(pages, "p2", "smart-light");
  assert.equal(pages[0].invertMode, "none");
  assert.equal(pages[1].invertMode, "smart-light");
  pages = togglePageInvert(pages, "p2", "smart-light");
  assert.equal(pages[1].invertMode, "none");
});

test("duplicatePage, deletePages, and insertBlankPageAt maintain list integrity", () => {
  let pages = makePages(3);
  pages = duplicatePage(pages, "p2", "p2-copy");
  assert.deepEqual(
    pages.map((p) => p.id),
    ["p1", "p2", "p2-copy", "p3"],
  );
  pages = deletePages(pages, new Set(["p2-copy"]));
  assert.deepEqual(
    pages.map((p) => p.id),
    ["p1", "p2", "p3"],
  );
  pages = insertBlankPageAt(pages, 1, "blank-1", "ruled");
  assert.equal(pages.length, 4);
  assert.equal(pages[1].kind, "blank");
  assert.equal(pages[1].blankStyle, "ruled");
});

test("parsePageRange parses valid ranges and rejects invalid tokens", () => {
  assert.deepEqual(parsePageRange("1, 3-5, 3", 6), {
    indices: [0, 2, 3, 4],
    error: null,
  });
  assert.deepEqual(parsePageRange("5-3", 6), {
    indices: [2, 3, 4],
    error: null,
  });
  const outOfRange = parsePageRange("1, 9", 6);
  assert.equal(outOfRange.indices.length, 0);
  assert.ok(outOfRange.error);

  const malformed = parsePageRange("abc", 6);
  assert.ok(malformed.error);
});

test("getEffectiveDimensions swaps width and height on 90/270 rotations", () => {
  assert.deepEqual(getEffectiveDimensions({ widthPt: 792, heightPt: 612, rotation: 0 }), {
    width: 792,
    height: 612,
  });
  assert.deepEqual(getEffectiveDimensions({ widthPt: 792, heightPt: 612, rotation: 90 }), {
    width: 612,
    height: 792,
  });
});
