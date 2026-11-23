import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LAYOUT_CONFIG,
  computeImpositionPlan,
  resolveGridDimensions,
} from "./layoutMath";

const sampleSlides = Array.from({ length: 6 }, () => ({
  widthPt: 792,
  heightPt: 612,
  rotation: 0 as const,
}));

test("resolveGridDimensions handles 2, 3, 4, 5, 6 pages per sheet horizontally and vertically", () => {
  assert.deepEqual(
    resolveGridDimensions({ ...DEFAULT_LAYOUT_CONFIG, pagesPerSheet: 2, direction: "horizontal" }),
    { cols: 2, rows: 1, perSheet: 2 },
  );
  assert.deepEqual(
    resolveGridDimensions({ ...DEFAULT_LAYOUT_CONFIG, pagesPerSheet: 2, direction: "vertical" }),
    { cols: 1, rows: 2, perSheet: 2 },
  );
  assert.deepEqual(
    resolveGridDimensions({ ...DEFAULT_LAYOUT_CONFIG, pagesPerSheet: 3, direction: "horizontal" }),
    { cols: 3, rows: 1, perSheet: 3 },
  );
  assert.deepEqual(
    resolveGridDimensions({ ...DEFAULT_LAYOUT_CONFIG, pagesPerSheet: 3, direction: "vertical" }),
    { cols: 1, rows: 3, perSheet: 3 },
  );
  assert.deepEqual(
    resolveGridDimensions({ ...DEFAULT_LAYOUT_CONFIG, pagesPerSheet: 5, direction: "vertical" }),
    { cols: 1, rows: 5, perSheet: 5 },
  );
  assert.deepEqual(
    resolveGridDimensions({ ...DEFAULT_LAYOUT_CONFIG, pagesPerSheet: 6, direction: "horizontal" }),
    { cols: 3, rows: 2, perSheet: 6 },
  );
  assert.deepEqual(
    resolveGridDimensions({ ...DEFAULT_LAYOUT_CONFIG, pagesPerSheet: 6, direction: "vertical" }),
    { cols: 2, rows: 3, perSheet: 6 },
  );
});

test("computeImpositionPlan produces exact sheet count and keeps placements within margins", () => {
  const plan = computeImpositionPlan(sampleSlides, {
    ...DEFAULT_LAYOUT_CONFIG,
    pagesPerSheet: 4,
    direction: "horizontal",
    marginPt: 24,
    gapPt: 12,
  });

  assert.equal(plan.sheets.length, 2);
  assert.equal(plan.sheets[0].placements.length, 4);
  assert.equal(plan.sheets[1].placements.length, 2);

  // Horizontal order: slot 0 -> (0,0), slot 1 -> (1,0), slot 2 -> (0,1), slot 3 -> (1,1)
  assert.equal(plan.sheets[0].placements[1].col, 1);
  assert.equal(plan.sheets[0].placements[1].row, 0);
  assert.equal(plan.sheets[0].placements[2].col, 0);
  assert.equal(plan.sheets[0].placements[2].row, 1);

  for (const sheet of plan.sheets) {
    for (const p of sheet.placements) {
      assert.ok(p.drawX >= 23.9, "left margin respected");
      assert.ok(p.drawY >= 23.9, "top margin respected");
      assert.ok(p.drawX + p.drawWidth <= sheet.sheetWidth - 23.9, "right margin respected");
      assert.ok(p.drawY + p.drawHeight <= sheet.sheetHeight - 23.9, "bottom margin respected");
    }
  }
});

test("vertical 4-up fills top-to-bottom down columns first", () => {
  const plan = computeImpositionPlan(sampleSlides, {
    ...DEFAULT_LAYOUT_CONFIG,
    pagesPerSheet: 4,
    direction: "vertical",
  });

  // Vertical order: slot 0 -> (0,0), slot 1 -> (0,1), slot 2 -> (1,0), slot 3 -> (1,1)
  assert.equal(plan.sheets[0].placements[1].col, 0);
  assert.equal(plan.sheets[0].placements[1].row, 1);
  assert.equal(plan.sheets[0].placements[2].col, 1);
  assert.equal(plan.sheets[0].placements[2].row, 0);
});

test("noteLines reserves non-overlapping note area beside slides", () => {
  const plan = computeImpositionPlan(sampleSlides.slice(0, 3), {
    ...DEFAULT_LAYOUT_CONFIG,
    pagesPerSheet: 3,
    direction: "vertical",
    noteLines: true,
  });

  assert.equal(plan.sheets.length, 1);
  for (const p of plan.sheets[0].placements) {
    assert.ok(p.noteArea, "noteArea exists");
    assert.ok(p.noteArea.x >= p.drawX + p.drawWidth, "note area sits cleanly right of slide");
  }
});
