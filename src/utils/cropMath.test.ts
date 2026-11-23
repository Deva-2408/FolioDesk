import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCrop,
  hasActiveCrop,
  getCroppedDimensions,
  computeCropRectPx,
  computeNativePdfCropBox,
} from "./cropMath";

test("normalizeCrop clamps excessive opposing insets to preserve minimum content area", () => {
  const clamped = normalizeCrop({ top: 0.7, bottom: 0.7, left: -0.2, right: 0.1 });
  assert.ok(clamped.top + clamped.bottom <= 0.881);
  assert.equal(clamped.left, 0);
  assert.equal(clamped.right, 0.1);
  assert.equal(hasActiveCrop(clamped), true);
  assert.equal(hasActiveCrop({ top: 0, right: 0, bottom: 0, left: 0 }), false);
});

test("getCroppedDimensions applies rotation and crop proportionally", () => {
  const dims = getCroppedDimensions({
    widthPt: 800,
    heightPt: 600,
    rotation: 0,
    crop: { top: 0.1, bottom: 0.1, left: 0.25, right: 0.25 },
  });
  assert.equal(Math.round(dims.width), 400);
  assert.equal(Math.round(dims.height), 480);

  const rotatedDims = getCroppedDimensions({
    widthPt: 800,
    heightPt: 600,
    rotation: 90,
    crop: { top: 0.25, bottom: 0.25, left: 0, right: 0 },
  });
  // After 90 deg rotation: visual width=600, visual height=800; crop 50% vertically -> height=400
  assert.equal(Math.round(rotatedDims.width), 600);
  assert.equal(Math.round(rotatedDims.height), 400);
});

test("computeCropRectPx calculates exact pixel bounds within canvas", () => {
  const rect = computeCropRectPx(1000, 500, { top: 0.1, bottom: 0.2, left: 0.15, right: 0.05 });
  assert.deepEqual(rect, { sx: 150, sy: 50, sw: 800, sh: 350 });
});

test("computeNativePdfCropBox maps visual crop correctly for 0 and 90 degree rotations", () => {
  const box0 = computeNativePdfCropBox(
    { x: 0, y: 0, width: 600, height: 800 },
    0,
    { top: 0.1, bottom: 0.2, left: 0.05, right: 0.15 },
  );
  // PDF Y origin is bottom-left: y = 800 * 0.2 = 160, height = 800 * 0.7 = 560
  assert.equal(Math.round(box0.x), 30);
  assert.equal(Math.round(box0.y), 160);
  assert.equal(Math.round(box0.width), 480);
  assert.equal(Math.round(box0.height), 560);

  const box90 = computeNativePdfCropBox(
    { x: 0, y: 0, width: 600, height: 800 },
    90,
    { top: 0.2, bottom: 0, left: 0, right: 0 },
  );
  // Visual top on a 90 deg CW rotated page maps to unrotated PDF left edge
  assert.equal(Math.round(box90.x), 120);
  assert.equal(Math.round(box90.width), 480);
  assert.equal(Math.round(box90.height), 800);
});
