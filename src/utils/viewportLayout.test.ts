import test from "node:test";
import assert from "node:assert/strict";
import { getWorkspaceLayoutMode } from "./viewportLayout";

test("desktop viewports use split 2/3 + 1/3 layout", () => {
  assert.equal(getWorkspaceLayoutMode(1440, 900), "split");
  assert.equal(getWorkspaceLayoutMode(1280, 800), "split");
  assert.equal(getWorkspaceLayoutMode(1920, 1080), "split");
});

test("tablet horizontal (landscape) viewports use split layout like desktop", () => {
  assert.equal(getWorkspaceLayoutMode(1024, 768), "split"); // iPad landscape
  assert.equal(getWorkspaceLayoutMode(1180, 820), "split"); // iPad Air landscape
  assert.equal(getWorkspaceLayoutMode(1194, 834), "split"); // iPad Pro 11 landscape
  assert.equal(getWorkspaceLayoutMode(1366, 1024), "split"); // iPad Pro 12.9 landscape
  assert.equal(getWorkspaceLayoutMode(900, 600), "split"); // Small tablet landscape
});

test("tablet vertical (portrait) viewports use paged layout like mobile", () => {
  assert.equal(getWorkspaceLayoutMode(768, 1024), "paged"); // iPad portrait
  assert.equal(getWorkspaceLayoutMode(820, 1180), "paged"); // iPad Air portrait
  assert.equal(getWorkspaceLayoutMode(834, 1194), "paged"); // iPad Pro 11 portrait
  assert.equal(getWorkspaceLayoutMode(1024, 1366), "paged"); // iPad Pro 12.9 portrait
});

test("mobile viewports use paged layout in both portrait and landscape", () => {
  assert.equal(getWorkspaceLayoutMode(390, 844), "paged"); // iPhone portrait
  assert.equal(getWorkspaceLayoutMode(375, 812), "paged"); // Compact phone portrait
  assert.equal(getWorkspaceLayoutMode(430, 932), "paged"); // Large phone portrait
  assert.equal(getWorkspaceLayoutMode(844, 390), "paged"); // Phone landscape (height < 500)
});
