import test from "node:test";
import assert from "node:assert/strict";
import type { PdfPageItem, SourceDocument } from "../types/pdf";
import { setInvertModeForPages, rotatePages } from "../utils/pageOperations";
import {
  createInitialWorkspaceState,
  summarizeActiveEdits,
  workspaceReducer,
} from "./workspaceReducer";

function makeSampleSource(): SourceDocument {
  return {
    id: "src-1",
    name: "Lecture.pdf",
    byteLength: 1024,
    pageCount: 2,
    addedAt: 1,
    bytes: new Uint8Array([1, 2, 3]),
  };
}

function makeSamplePages(): PdfPageItem[] {
  return [
    {
      id: "pg-1",
      kind: "pdf",
      sourceId: "src-1",
      sourceName: "Lecture.pdf",
      sourcePageIndex: 0,
      widthPt: 612,
      heightPt: 792,
      rotation: 0,
      invertMode: "none",
    },
    {
      id: "pg-2",
      kind: "pdf",
      sourceId: "src-1",
      sourceName: "Lecture.pdf",
      sourcePageIndex: 1,
      widthPt: 612,
      heightPt: 792,
      rotation: 0,
      invertMode: "none",
    },
  ];
}

test("edits made across Organize, Crop, Layout, Invert, OCR, and AI Studio remain synced and retained across tab switches", () => {
  let state = createInitialWorkspaceState();
  state = workspaceReducer(state, {
    type: "APPEND_SOURCE",
    source: makeSampleSource(),
    pages: makeSamplePages(),
  });

  // 1. Organize tab: rotate page 1
  state = workspaceReducer(state, {
    type: "COMMIT_PAGES",
    updater: (prev) => rotatePages(prev, new Set(["pg-1"]), 90),
  });

  // 2. Switch to Crop tab and apply live crop to all pages
  state = workspaceReducer(state, { type: "SET_ACTIVE_TAB", tab: "crop" });
  state = workspaceReducer(state, {
    type: "APPLY_LIVE_CROP",
    crop: { top: 0.06, right: 0.06, bottom: 0.06, left: 0.06 },
    targetIds: new Set(["pg-1", "pg-2"]),
    recordHistory: true,
  });

  // 3. Switch to Invert tab and apply Smart Light Mode
  state = workspaceReducer(state, { type: "SET_ACTIVE_TAB", tab: "invert" });
  state = workspaceReducer(state, {
    type: "COMMIT_PAGES",
    updater: (prev) => setInvertModeForPages(prev, new Set(["pg-1", "pg-2"]), "smart-light"),
  });

  // 4. Switch to Layout tab and set 4-up + watermark
  state = workspaceReducer(state, { type: "SET_ACTIVE_TAB", tab: "layout" });
  state = workspaceReducer(state, {
    type: "SET_LAYOUT",
    layout: { ...state.layout, pagesPerSheet: 4, watermarkText: "FINAL" },
  });

  // 5. Switch to OCR tab and save extracted text
  state = workspaceReducer(state, { type: "SET_ACTIVE_TAB", tab: "ocr" });
  state = workspaceReducer(state, {
    type: "UPDATE_PAGE_OCR",
    pageId: "pg-1",
    text: "Eigenvalue decomposition notes",
    method: "vision",
  });

  // 6. Switch to AI Studio and store chat message + tool choice
  state = workspaceReducer(state, { type: "SET_ACTIVE_TAB", tab: "ai" });
  state = workspaceReducer(state, {
    type: "PATCH_AI_STUDIO",
    patch: {
      activeTool: "flashcards",
      summaryText: "Key summary points",
    },
  });

  // Switch back to Organize and assert ALL edits from ALL tabs are retained
  state = workspaceReducer(state, { type: "SET_ACTIVE_TAB", tab: "organize" });
  assert.equal(state.pages[0].rotation, 90);
  assert.equal(state.pages[0].crop?.top, 0.06);
  assert.equal(state.pages[1].crop?.left, 0.06);
  assert.equal(state.pages[0].invertMode, "smart-light");
  assert.equal(state.layout.pagesPerSheet, 4);
  assert.equal(state.layout.watermarkText, "FINAL");
  assert.equal(state.pages[0].ocrText, "Eigenvalue decomposition notes");
  assert.equal(state.aiStudio.activeTool, "flashcards");
  assert.equal(state.aiStudio.summaryText, "Key summary points");
  assert.equal(state.previewMode, "sheets");

  const summary = summarizeActiveEdits(state).map((i) => i.id);
  assert.deepEqual(summary, [
    "rotated",
    "cropped",
    "inverted",
    "layout",
    "watermark",
    "ocr",
    "ai",
  ]);
});

test("unified undo and redo restore pages, layout, and extensible customEdits together", () => {
  let state = createInitialWorkspaceState();
  state = workspaceReducer(state, {
    type: "APPEND_SOURCE",
    source: makeSampleSource(),
    pages: makeSamplePages(),
  });

  // Apply layout edit
  state = workspaceReducer(state, {
    type: "SET_LAYOUT",
    layout: { ...state.layout, pagesPerSheet: 6 },
  });
  // Apply extensible future-tab custom edit
  state = workspaceReducer(state, {
    type: "SET_CUSTOM_EDIT",
    key: "annotations",
    value: [{ pageId: "pg-1", note: "Highlight theorem" }],
  });

  assert.equal(state.layout.pagesPerSheet, 6);
  assert.ok(Array.isArray(state.customEdits.annotations));

  // Undo removes customEdit while keeping layout=6
  state = workspaceReducer(state, { type: "UNDO" });
  assert.equal(state.customEdits.annotations, undefined);
  assert.equal(state.layout.pagesPerSheet, 6);

  // Undo restores layout=1
  state = workspaceReducer(state, { type: "UNDO" });
  assert.equal(state.layout.pagesPerSheet, 1);

  // Redo restores layout=6 and customEdit
  state = workspaceReducer(state, { type: "REDO" });
  assert.equal(state.layout.pagesPerSheet, 6);
  state = workspaceReducer(state, { type: "REDO" });
  assert.ok(Array.isArray(state.customEdits.annotations));
});
