import test from "node:test";
import assert from "node:assert/strict";
import { applyColorTransformInPlace } from "./colorTransform";

test("standard invert turns black to white and white to black while preserving alpha", () => {
  const buf = new Uint8ClampedArray([
    0, 0, 0, 255, // pure black
    255, 255, 255, 200, // pure white
  ]);
  applyColorTransformInPlace(buf, "standard");
  assert.deepEqual(Array.from(buf), [255, 255, 255, 255, 0, 0, 0, 200]);
});

test("smart-light turns dark slate background crisp white and preserves accent hue", () => {
  const buf = new Uint8ClampedArray([
    15, 23, 42, 255, // dark slate #0f172a
    59, 130, 246, 255, // bright blue accent
  ]);
  applyColorTransformInPlace(buf, "smart-light");
  // Dark slate becomes near-pure white
  assert.ok(buf[0] >= 250 && buf[1] >= 250 && buf[2] >= 250);
  // Blue accent stays blue-dominant (B > R) rather than turning orange like naive RGB invert
  assert.ok(buf[6] > buf[4], "blue channel remains greater than red channel");
});

test("ink-saver snaps dark backgrounds to pure white 255 and outputs neutral grayscale", () => {
  const buf = new Uint8ClampedArray([
    20, 24, 32, 255, // dark background
    245, 245, 245, 255, // crisp white text
  ]);
  applyColorTransformInPlace(buf, "ink-saver");
  assert.deepEqual(Array.from(buf.slice(0, 4)), [255, 255, 255, 255]);
  assert.equal(buf[4], buf[5]);
  assert.equal(buf[5], buf[6]);
  assert.ok(buf[4] <= 25, "light text becomes dark ink");
});
