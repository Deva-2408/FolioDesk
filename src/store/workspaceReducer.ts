import type {
  ActiveEditSummaryItem,
  AiStudioState,
  CropInsets,
  CropSettingsState,
  InvertSettingsState,
  NUpLayoutConfig,
  OcrSettingsState,
  PdfDocumentSnapshot,
  PdfPageItem,
  PdfWorkspaceState,
  PreviewDisplayMode,
  SourceDocument,
  WorkspaceTab,
} from "../types/pdf";
import { hasActiveCrop, normalizeCrop, setCropForPages } from "../utils/cropMath";
import { DEFAULT_LAYOUT_CONFIG } from "../utils/layoutMath";

const MAX_HISTORY = 35;

export function createInitialAiState(): AiStudioState {
  return {
    activeTool: "chat",
    questionDraft: "",
    messages: [],
    summaryText: "",
    actionItemsText: "",
    flashcards: [],
    flippedCards: [],
    quizQuestions: [],
    selectedAnswers: {},
  };
}

export function createInitialWorkspaceState(): PdfWorkspaceState {
  return {
    sources: [],
    pages: [],
    layout: { ...DEFAULT_LAYOUT_CONFIG },
    customEdits: {},
    cropSettings: { scope: "all" },
    invertSettings: { scope: "all", preferredMode: "smart-light" },
    ocrSettings: {
      mode: "vision",
      outputFormat: "markdown",
      languageHint: "",
      embedOcrTextLayer: true,
    },
    aiStudio: createInitialAiState(),
    activeTab: "organize",
    activePageIndex: 0,
    selectedIds: [],
    previewMode: "document",
    past: [],
    future: [],
  };
}

function captureSnapshot(state: PdfWorkspaceState): PdfDocumentSnapshot {
  return {
    pages: state.pages,
    layout: state.layout,
    customEdits: state.customEdits,
  };
}

function pushHistory(state: PdfWorkspaceState): {
  past: PdfDocumentSnapshot[];
  future: PdfDocumentSnapshot[];
} {
  return {
    past: [...state.past.slice(-(MAX_HISTORY - 1)), captureSnapshot(state)],
    future: [],
  };
}

function clampPageIndex(index: number, pageCount: number): number {
  if (pageCount <= 0) return 0;
  return Math.max(0, Math.min(index, pageCount - 1));
}

export type WorkspaceAction =
  | {
      type: "APPEND_SOURCE";
      source: SourceDocument;
      pages: PdfPageItem[];
      insertAtIndex?: number;
    }
  | {
      type: "REPLACE_SOURCE_UNLOCKED";
      sourceId: string;
      unlockedName: string;
      unlockedBytes: Uint8Array;
    }
  | { type: "REMOVE_SOURCE"; sourceId: string }
  | {
      type: "COMMIT_PAGES";
      updater: (prev: PdfPageItem[]) => PdfPageItem[];
      clearSelection?: boolean;
      recordHistory?: boolean;
    }
  | {
      type: "APPLY_LIVE_CROP";
      crop: CropInsets | undefined;
      targetIds: Set<string>;
      recordHistory: boolean;
    }
  | {
      type: "UPDATE_PAGE_OCR";
      pageId: string;
      text: string;
      method: "vision" | "embedded";
    }
  | {
      type: "SET_LAYOUT";
      layout: NUpLayoutConfig;
      recordHistory?: boolean;
    }
  | {
      type: "SET_CUSTOM_EDIT";
      key: string;
      value: unknown;
      recordHistory?: boolean;
    }
  | { type: "SET_CROP_SETTINGS"; patch: Partial<CropSettingsState> }
  | { type: "SET_INVERT_SETTINGS"; patch: Partial<InvertSettingsState> }
  | { type: "SET_OCR_SETTINGS"; patch: Partial<OcrSettingsState> }
  | { type: "PATCH_AI_STUDIO"; patch: Partial<AiStudioState> }
  | { type: "SET_ACTIVE_TAB"; tab: WorkspaceTab }
  | { type: "SET_ACTIVE_PAGE_INDEX"; index: number }
  | { type: "SET_PREVIEW_MODE"; mode: PreviewDisplayMode }
  | { type: "TOGGLE_SELECT_PAGE"; pageId: string }
  | { type: "SET_SELECTED_IDS"; ids: string[] }
  | { type: "UNDO" }
  | { type: "REDO" };

export function workspaceReducer(
  state: PdfWorkspaceState,
  action: WorkspaceAction,
): PdfWorkspaceState {
  switch (action.type) {
    case "APPEND_SOURCE": {
      const nextPages =
        action.insertAtIndex === undefined || action.insertAtIndex >= state.pages.length
          ? [...state.pages, ...action.pages]
          : (() => {
              const copy = [...state.pages];
              copy.splice(Math.max(0, action.insertAtIndex), 0, ...action.pages);
              return copy;
            })();
      return {
        ...state,
        sources: [...state.sources, action.source],
        pages: nextPages,
        activePageIndex: clampPageIndex(state.activePageIndex, nextPages.length),
        ...pushHistory(state),
      };
    }

    case "REPLACE_SOURCE_UNLOCKED": {
      return {
        ...state,
        sources: state.sources.map((s) =>
          s.id === action.sourceId
            ? {
                ...s,
                name: action.unlockedName,
                bytes: action.unlockedBytes,
                byteLength: action.unlockedBytes.byteLength,
                wasEncrypted: false,
                password: undefined,
              }
            : s,
        ),
        pages: state.pages.map((p) =>
          p.sourceId === action.sourceId ? { ...p, sourceName: action.unlockedName } : p,
        ),
      };
    }

    case "REMOVE_SOURCE": {
      const nextPages = state.pages.filter((p) => p.sourceId !== action.sourceId);
      const validIds = new Set(nextPages.map((p) => p.id));
      return {
        ...state,
        sources: state.sources.filter((s) => s.id !== action.sourceId),
        pages: nextPages,
        selectedIds: state.selectedIds.filter((id) => validIds.has(id)),
        activePageIndex: clampPageIndex(state.activePageIndex, nextPages.length),
        ...pushHistory(state),
      };
    }

    case "COMMIT_PAGES": {
      const nextPages = action.updater(state.pages);
      const validIds = new Set(nextPages.map((p) => p.id));
      const historyPatch = action.recordHistory === false ? {} : pushHistory(state);
      return {
        ...state,
        pages: nextPages,
        selectedIds: action.clearSelection
          ? []
          : state.selectedIds.filter((id) => validIds.has(id)),
        activePageIndex: clampPageIndex(state.activePageIndex, nextPages.length),
        ...historyPatch,
      };
    }

    case "APPLY_LIVE_CROP": {
      const normalized =
        action.crop && hasActiveCrop(action.crop) ? normalizeCrop(action.crop) : undefined;
      const nextPages = setCropForPages(state.pages, action.targetIds, normalized);
      const historyPatch = action.recordHistory ? pushHistory(state) : {};
      return {
        ...state,
        pages: nextPages,
        ...historyPatch,
      };
    }

    case "UPDATE_PAGE_OCR": {
      return {
        ...state,
        pages: state.pages.map((p) =>
          p.id === action.pageId
            ? { ...p, ocrText: action.text, ocrMethod: action.method, ocrUpdatedAt: Date.now() }
            : p,
        ),
      };
    }

    case "SET_LAYOUT": {
      const isNowImposed =
        action.layout.pagesPerSheet > 1 ||
        action.layout.customGrid ||
        action.layout.noteLines ||
        action.layout.watermarkText.trim().length > 0 ||
        action.layout.pageNumbers !== "none";
      const historyPatch = action.recordHistory === false ? {} : pushHistory(state);
      return {
        ...state,
        layout: action.layout,
        // Automatically align preview mode to sheets when multi-page imposition is enabled
        previewMode:
          action.layout.pagesPerSheet > 1 || action.layout.customGrid
            ? "sheets"
            : !isNowImposed && state.previewMode === "sheets"
              ? "document"
              : state.previewMode,
        ...historyPatch,
      };
    }

    case "SET_CUSTOM_EDIT": {
      const historyPatch = action.recordHistory === false ? {} : pushHistory(state);
      return {
        ...state,
        customEdits: {
          ...state.customEdits,
          [action.key]: action.value,
        },
        ...historyPatch,
      };
    }

    case "SET_CROP_SETTINGS":
      return { ...state, cropSettings: { ...state.cropSettings, ...action.patch } };

    case "SET_INVERT_SETTINGS":
      return { ...state, invertSettings: { ...state.invertSettings, ...action.patch } };

    case "SET_OCR_SETTINGS":
      return { ...state, ocrSettings: { ...state.ocrSettings, ...action.patch } };

    case "PATCH_AI_STUDIO":
      return { ...state, aiStudio: { ...state.aiStudio, ...action.patch } };

    case "SET_ACTIVE_TAB":
      return { ...state, activeTab: action.tab };

    case "SET_ACTIVE_PAGE_INDEX":
      return {
        ...state,
        activePageIndex: clampPageIndex(action.index, state.pages.length),
      };

    case "SET_PREVIEW_MODE":
      return { ...state, previewMode: action.mode };

    case "TOGGLE_SELECT_PAGE": {
      const exists = state.selectedIds.includes(action.pageId);
      return {
        ...state,
        selectedIds: exists
          ? state.selectedIds.filter((id) => id !== action.pageId)
          : [...state.selectedIds, action.pageId],
      };
    }

    case "SET_SELECTED_IDS":
      return { ...state, selectedIds: action.ids };

    case "UNDO": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      const currentSnap = captureSnapshot(state);
      return {
        ...state,
        pages: previous.pages,
        layout: previous.layout,
        customEdits: previous.customEdits,
        selectedIds: [],
        activePageIndex: clampPageIndex(state.activePageIndex, previous.pages.length),
        past: state.past.slice(0, -1),
        future: [currentSnap, ...state.future.slice(0, MAX_HISTORY - 1)],
      };
    }

    case "REDO": {
      if (state.future.length === 0) return state;
      const [nextSnap, ...rest] = state.future;
      const currentSnap = captureSnapshot(state);
      return {
        ...state,
        pages: nextSnap.pages,
        layout: nextSnap.layout,
        customEdits: nextSnap.customEdits,
        selectedIds: [],
        activePageIndex: clampPageIndex(state.activePageIndex, nextSnap.pages.length),
        past: [...state.past.slice(-(MAX_HISTORY - 1)), currentSnap],
        future: rest,
      };
    }

    default:
      return state;
  }
}

/**
 * Pure selector reporting all active edits currently synced and retained across every tab.
 */
export function summarizeActiveEdits(state: PdfWorkspaceState): ActiveEditSummaryItem[] {
  const items: ActiveEditSummaryItem[] = [];

  if (state.sources.length > 1) {
    items.push({
      id: "merged",
      tab: "organize",
      label: `${state.sources.length} PDFs merged`,
    });
  }

  const rotatedCount = state.pages.filter((p) => p.rotation !== 0).length;
  if (rotatedCount > 0) {
    items.push({
      id: "rotated",
      tab: "organize",
      label: `${rotatedCount}p rotated`,
    });
  }

  const croppedCount = state.pages.filter((p) => hasActiveCrop(p.crop)).length;
  if (croppedCount > 0) {
    items.push({
      id: "cropped",
      tab: "crop",
      label: `${croppedCount}p cropped`,
    });
  }

  const invertedPages = state.pages.filter((p) => p.invertMode !== "none");
  if (invertedPages.length > 0) {
    const modeLabel =
      invertedPages[0].invertMode === "smart-light"
        ? "Smart Light"
        : invertedPages[0].invertMode === "ink-saver"
          ? "Ink-Saver"
          : "Inverted";
    items.push({
      id: "inverted",
      tab: "invert",
      label: `${invertedPages.length}p ${modeLabel}`,
    });
  }

  if (state.layout.customGrid) {
    items.push({
      id: "layout",
      tab: "layout",
      label: `${state.layout.customCols}×${state.layout.customRows} grid`,
    });
  } else if (state.layout.pagesPerSheet > 1) {
    items.push({
      id: "layout",
      tab: "layout",
      label: `${state.layout.pagesPerSheet}-up ${state.layout.direction}`,
    });
  }

  if (state.layout.noteLines) {
    items.push({
      id: "note-lines",
      tab: "layout",
      label: "Note lines",
    });
  }

  if (state.layout.watermarkText.trim()) {
    items.push({
      id: "watermark",
      tab: "layout",
      label: "Watermark",
    });
  }

  if (state.layout.pageNumbers !== "none") {
    items.push({
      id: "page-numbers",
      tab: "layout",
      label: "Page numbers",
    });
  }

  const ocrCount = state.pages.filter((p) => (p.ocrText ?? "").trim().length > 0).length;
  if (ocrCount > 0) {
    items.push({
      id: "ocr",
      tab: "ocr",
      label: `${ocrCount}p OCR`,
    });
  }

  const hasAiOutput =
    state.aiStudio.messages.length > 0 ||
    state.aiStudio.summaryText.length > 0 ||
    state.aiStudio.flashcards.length > 0 ||
    state.aiStudio.quizQuestions.length > 0 ||
    state.aiStudio.actionItemsText.length > 0;
  if (hasAiOutput) {
    items.push({
      id: "ai",
      tab: "ai",
      label: "AI notes saved",
    });
  }

  return items;
}
