import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPRESSION_PRESETS,
  computePlacementRenderScale,
  computeSizeSavings,
  computeVectorDrawPlacement,
  formatFileSize,
  shouldRecompressHeavySource,
} from "./pdfCompression";

function transformCorners(
  x: number,
  y: number,
  width: number,
  height: number,
  rotateDeg: number,
): Array<[number, number]> {
  const rad = (rotateDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const local: Array<[number, number]> = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ];
  return local.map(([u, v]) => [x + u * c - v * s, y + u * s + v * c]);
}

test("computePlacementRenderScale downscales N-up cells to avoid excess pixels and caps giant pages", () => {
  // 1-up standard slide (720x450) at Balanced (1.65) stays 1.65
  const oneUp = computePlacementRenderScale({
    croppedWidthPt: 720,
    croppedHeightPt: 450,
    drawWidthPt: 720,
    drawHeightPt: 450,
    targetDpiScale: 1.65,
    maxLongEdgePx: 1900,
  });
  assert.equal(oneUp, 1.65);

  // 4-up slide drawn at half width (~360x225) scales down significantly from 1.65
  const fourUp = computePlacementRenderScale({
    croppedWidthPt: 720,
    croppedHeightPt: 450,
    drawWidthPt: 360,
    drawHeightPt: 225,
    targetDpiScale: 1.65,
    maxLongEdgePx: 1900,
  });
  assert.ok(fourUp < 1.0 && fourUp >= 0.9, `expected ~0.95, got ${fourUp}`);

  // 9-up tiny cell respects 0.75 floor so text remains legible
  const nineUp = computePlacementRenderScale({
    croppedWidthPt: 720,
    croppedHeightPt: 450,
    drawWidthPt: 180,
    drawHeightPt: 112.5,
    targetDpiScale: 1.38,
    maxLongEdgePx: 1500,
  });
  assert.equal(nineUp, 0.75);

  // Oversized 2400pt poster is capped by maxLongEdgePx
  const poster = computePlacementRenderScale({
    croppedWidthPt: 2400,
    croppedHeightPt: 1800,
    drawWidthPt: 2400,
    drawHeightPt: 1800,
    targetDpiScale: 2.15,
    maxLongEdgePx: 1900,
  });
  assert.ok(poster <= 0.8, `expected capped poster scale <= 0.8, got ${poster}`);
});

test("shouldRecompressHeavySource skips tiny pure-vector PDFs and targets heavy scans", () => {
  // 6-page 7.6 KB vector slide deck -> never recompress even when flag is ON
  assert.equal(
    shouldRecompressHeavySource({ byteLength: 7_600, pageCount: 6 }, true),
    false,
  );

  // 2-page 450 KB scanned worksheet -> recompress when flag is ON, keep untouched when OFF
  assert.equal(
    shouldRecompressHeavySource({ byteLength: 450_000, pageCount: 2 }, true),
    true,
  );
  assert.equal(
    shouldRecompressHeavySource({ byteLength: 450_000, pageCount: 2 }, false),
    false,
  );
});

test("computeVectorDrawPlacement maps all 4 corners exactly onto target box for 0/90/180/270 rotations", () => {
  const drawX = 40;
  const pdfDrawY = 120;
  const drawW = 280;
  const drawH = 190;

  for (const rot of [0, 90, 180, 270] as const) {
    const p = computeVectorDrawPlacement(drawX, pdfDrawY, drawW, drawH, rot);
    const corners = transformCorners(p.x, p.y, p.width, p.height, p.rotateDeg);
    const xs = corners.map(([cx]) => cx);
    const ys = corners.map(([, cy]) => cy);

    assert.ok(Math.abs(Math.min(...xs) - drawX) < 1e-6, `rot ${rot} minX mismatch`);
    assert.ok(Math.abs(Math.max(...xs) - (drawX + drawW)) < 1e-6, `rot ${rot} maxX mismatch`);
    assert.ok(Math.abs(Math.min(...ys) - pdfDrawY) < 1e-6, `rot ${rot} minY mismatch`);
    assert.ok(Math.abs(Math.max(...ys) - (pdfDrawY + drawH)) < 1e-6, `rot ${rot} maxY mismatch`);
  }
});

test("formatFileSize and computeSizeSavings report readable sizes and percentage reduction", () => {
  assert.equal(formatFileSize(128 * 1024), "128.0 KB");
  assert.equal(formatFileSize(2.5 * 1024 * 1024), "2.50 MB");

  const saved = computeSizeSavings(1_000_000, 220_000);
  assert.deepEqual(saved, { deltaPercent: 78, label: "78% smaller than source" });

  assert.ok(COMPRESSION_PRESETS.compact.dpiScale < COMPRESSION_PRESETS.balanced.dpiScale);
  assert.ok(COMPRESSION_PRESETS.balanced.jpegQuality < COMPRESSION_PRESETS.high.jpegQuality);
});
