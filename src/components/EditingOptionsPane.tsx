import { useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUpDown,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Contrast,
  Copy,
  Crop,
  Download,
  Eye,
  FilePlus,
  FilePlus2,
  FileSearch,
  LayoutGrid,
  Loader2,
  Lock,
  RotateCcw,
  RotateCw,
  ScanText,
  Sparkles,
  Square,
  StopCircle,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import type {
  AiStudioState,
  BlankPageStyle,
  CropInsets,
  CropSettingsState,
  EditScope,
  InvertMode,
  InvertSettingsState,
  LayoutDirection,
  NUpLayoutConfig,
  OcrSettingsState,
  PageNumberPosition,
  PaperSizeKey,
  PdfPageItem,
  SheetOrientation,
  SourceDocument,
  WorkspaceTab,
} from "../types/pdf";
import {
  getCroppedDimensions,
  hasActiveCrop,
  normalizeCrop,
  ZERO_CROP,
} from "../utils/cropMath";
import { computeImpositionPlan, DEFAULT_LAYOUT_CONFIG } from "../utils/layoutMath";
import { getEffectiveDimensions } from "../utils/pageOperations";
import {
  extractEmbeddedPageText,
  renderPageToDataUrl,
  triggerFileDownload,
} from "../utils/pdfEngine";
import type { SampleDeckId } from "../utils/samplePdfs";
import type { WorkspaceLayoutMode } from "../utils/viewportLayout";
import { AiAssistantView } from "./AiAssistantView";

interface EditingOptionsPaneProps {
  layoutMode: WorkspaceLayoutMode;
  onJumpToLivePreview: () => void;
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  sources: SourceDocument[];
  sourcesById: ReadonlyMap<string, SourceDocument>;
  pages: PdfPageItem[];
  selectedIds: ReadonlySet<string>;
  activePageIndex: number;
  onChangeActivePageIndex: (index: number) => void;
  documentTitle: string;
  isLoading: boolean;
  removingPasswordId: string | null;
  layoutConfig: NUpLayoutConfig;
  onChangeLayoutConfig: (next: NUpLayoutConfig, recordHistory?: boolean) => void;
  cropSettings: CropSettingsState;
  onChangeCropSettings: (patch: Partial<CropSettingsState>) => void;
  onLiveCropChange: (crop: CropInsets | undefined, recordHistory: boolean) => void;
  onApplyCropAll: (crop: CropInsets | undefined) => void;
  invertSettings: InvertSettingsState;
  onChangeInvertSettings: (patch: Partial<InvertSettingsState>) => void;
  onApplyLiveInvert: (mode: InvertMode) => void;
  onResetAllInvert: () => void;
  ocrSettings: OcrSettingsState;
  onChangeOcrSettings: (patch: Partial<OcrSettingsState>) => void;
  aiStudio: AiStudioState;
  onPatchAiStudio: (patch: Partial<AiStudioState>) => void;
  onAddFiles: (files: FileList | File[]) => void;
  onLoadSample: (deckId: SampleDeckId) => void;
  onRemoveSource: (sourceId: string) => void;
  onRemovePassword: (sourceId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onSelectByRange: (rangeText: string) => string | null;
  onDeleteByRange: (rangeText: string) => string | null;
  onReverseOrder: () => void;
  onInsertBlankPage: (style: BlankPageStyle) => void;
  onRotateSelected: () => void;
  onInvertSelected: () => void;
  onDeleteSelected: () => void;
  onUpdatePageOcr: (pageId: string, text: string, method: "vision" | "embedded") => void;
}

const TOOL_TABS: { id: WorkspaceTab; label: string; icon: typeof LayoutGrid }[] = [
  { id: "organize", label: "Organize", icon: FilePlus2 },
  { id: "crop", label: "Crop", icon: Crop },
  { id: "layout", label: "Layout", icon: LayoutGrid },
  { id: "invert", label: "Invert", icon: Contrast },
  { id: "ocr", label: "OCR", icon: ScanText },
  { id: "ai", label: "AI Studio", icon: Sparkles },
];

const CROP_PRESETS: { label: string; crop: CropInsets }[] = [
  { label: "Full Page", crop: { top: 0, right: 0, bottom: 0, left: 0 } },
  { label: "Trim Margins (6%)", crop: { top: 0.06, right: 0.06, bottom: 0.06, left: 0.06 } },
  { label: "Header / Footer", crop: { top: 0.11, right: 0.03, bottom: 0.11, left: 0.03 } },
  { label: "Left Half", crop: { top: 0, right: 0.5, bottom: 0, left: 0 } },
  { label: "Right Half", crop: { top: 0, right: 0, bottom: 0, left: 0.5 } },
];

const PRESET_COUNTS = [1, 2, 3, 4, 5, 6, 8, 9];

const INVERT_MODES: {
  id: InvertMode;
  name: string;
  summary: string;
}[] = [
  {
    id: "none",
    name: "Original (No Invert)",
    summary: "Keep original PDF colors unmodified.",
  },
  {
    id: "standard",
    name: "Standard Invert",
    summary: "Direct RGB inversion: converts pure black backgrounds to white and white text to black.",
  },
  {
    id: "smart-light",
    name: "Smart Light Mode",
    summary: "Inverts dark backgrounds to crisp white while preserving syntax and chart hue colors.",
  },
  {
    id: "ink-saver",
    name: "Ink-Saver Print",
    summary: "High-contrast grayscale with white paper snap so printing dark slides uses zero background toner.",
  },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function EditingOptionsPane({
  layoutMode,
  onJumpToLivePreview,
  activeTab,
  onTabChange,
  sources,
  sourcesById,
  pages,
  selectedIds,
  activePageIndex,
  onChangeActivePageIndex,
  documentTitle,
  isLoading,
  removingPasswordId,
  layoutConfig,
  onChangeLayoutConfig,
  cropSettings,
  onChangeCropSettings,
  onLiveCropChange,
  onApplyCropAll,
  invertSettings,
  onChangeInvertSettings,
  onApplyLiveInvert,
  onResetAllInvert,
  ocrSettings,
  onChangeOcrSettings,
  aiStudio,
  onPatchAiStudio,
  onAddFiles,
  onLoadSample,
  onRemoveSource,
  onRemovePassword,
  onSelectAll,
  onClearSelection,
  onSelectByRange,
  onDeleteByRange,
  onReverseOrder,
  onInsertBlankPage,
  onRotateSelected,
  onInvertSelected,
  onDeleteSelected,
  onUpdatePageOcr,
}: EditingOptionsPaneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ephemeral input-box text state only (actual edits all commit to unified store)
  const [rangeInput, setRangeInput] = useState("");
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [deleteRangeInput, setDeleteRangeInput] = useState("");
  const [deleteRangeError, setDeleteRangeError] = useState<string | null>(null);
  const [blankStyle, setBlankStyle] = useState<BlankPageStyle>("ruled");

  // OCR runtime status
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<{ current: number; total: number } | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [copiedOcr, setCopiedOcr] = useState(false);
  const ocrCancelRef = useRef(false);

  const safeIndex = Math.min(activePageIndex, Math.max(0, pages.length - 1));
  const activePage = pages[safeIndex];
  const liveCrop = normalizeCrop(activePage?.crop ?? ZERO_CROP);

  const protectedSources = sources.filter((s) => s.wasEncrypted);
  const croppedPageCount = pages.filter((p) => hasActiveCrop(p.crop)).length;
  const invertedCount = pages.filter((p) => p.invertMode !== "none").length;
  const pagesWithOcr = pages.filter((p) => (p.ocrText ?? "").trim().length > 0).length;
  const plan = pages.length > 0 ? computeImpositionPlan(pages, layoutConfig) : null;

  const updateLayout = (patch: Partial<NUpLayoutConfig>, recordHistory = true) => {
    onChangeLayoutConfig({ ...layoutConfig, ...patch }, recordHistory);
  };

  const updateCropEdgePct = (edge: keyof CropInsets, pctValue: number) => {
    const frac = Math.max(0, Math.min(80, pctValue)) / 100;
    const next = normalizeCrop({ ...liveCrop, [edge]: frac });
    onLiveCropChange(hasActiveCrop(next) ? next : undefined, false);
  };

  async function runOcrForSinglePage(page: PdfPageItem): Promise<string> {
    if (ocrSettings.mode === "embedded") {
      const text = await extractEmbeddedPageText(page, sourcesById);
      if (!text) {
        throw new Error(
          "No embedded text layer found on this page (it appears to be a scanned image). Switch to High-Accuracy Vision OCR to extract text.",
        );
      }
      onUpdatePageOcr(page.id, text, "embedded");
      return text;
    }

    const dataUrl = await renderPageToDataUrl(page, sourcesById, {
      scale: 2.0,
      applyInvert: true,
      applyCrop: true,
    });

    const resp = await fetch("/api/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: dataUrl,
        mimeType: "image/png",
        format: ocrSettings.outputFormat,
        languageHint: ocrSettings.languageHint.trim(),
      }),
    });

    const payload = (await resp.json().catch(() => ({}))) as { text?: string; error?: string };
    if (!resp.ok) {
      throw new Error(payload.error || `OCR failed with status ${resp.status}.`);
    }

    const extracted = (payload.text ?? "").trim();
    onUpdatePageOcr(page.id, extracted, "vision");
    return extracted;
  }

  const handleExtractCurrentOcr = async () => {
    if (!activePage || isOcrRunning) return;
    setOcrError(null);
    setIsOcrRunning(true);
    setOcrProgress({ current: 1, total: 1 });
    try {
      await runOcrForSinglePage(activePage);
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : "OCR failed.");
    } finally {
      setIsOcrRunning(false);
      setOcrProgress(null);
    }
  };

  const handleExtractAllOcr = async () => {
    if (pages.length === 0 || isOcrRunning) return;
    setOcrError(null);
    setIsOcrRunning(true);
    ocrCancelRef.current = false;
    try {
      for (let i = 0; i < pages.length; i++) {
        if (ocrCancelRef.current) break;
        onChangeActivePageIndex(i);
        setOcrProgress({ current: i + 1, total: pages.length });
        await runOcrForSinglePage(pages[i]);
      }
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : "Batch OCR stopped due to an error.");
    } finally {
      setIsOcrRunning(false);
      setOcrProgress(null);
    }
  };

  const handleCopyOcr = async () => {
    const text = activePage?.ocrText ?? "";
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedOcr(true);
    setTimeout(() => setCopiedOcr(false), 1800);
  };

  const handleDownloadAllOcr = (ext: "txt" | "md") => {
    const combined = pages
      .map((p, idx) => {
        const header = ext === "md" ? `## Page ${idx + 1}` : `--- Page ${idx + 1} ---`;
        return `${header}\n\n${(p.ocrText ?? "").trim() || "(No text extracted)"}`;
      })
      .join("\n\n");
    triggerFileDownload(
      combined,
      `foliodesk-ocr-extract.${ext}`,
      ext === "md" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8",
    );
  };

  const renderScopeToggle = (
    scope: EditScope,
    onChange: (next: EditScope) => void,
    label: string,
  ) => (
    <div className="space-y-1.5">
      <span className="block text-xs font-semibold text-slate-800">{label}</span>
      <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
        {(
          [
            { id: "all", text: `All (${pages.length})` },
            { id: "current", text: `Page ${safeIndex + 1}` },
            { id: "selected", text: `Selected (${selectedIds.size})` },
          ] as { id: EditScope; text: string }[]
        ).map((opt) => {
          const disabled = opt.id === "selected" && selectedIds.size === 0;
          const active = scope === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(opt.id)}
              className={`py-1.5 px-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap truncate ${
                active
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900 disabled:opacity-40"
              }`}
            >
              {opt.text}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderEmptyNotice = (toolName: string) => (
    <div className="p-5 text-center space-y-3">
      <p className="text-sm font-semibold text-slate-900">No PDF loaded yet</p>
      <p className="text-xs text-slate-500 leading-relaxed">
        Upload a PDF or open a sample deck from the Organize tab to start using {toolName}.
      </p>
      <button
        type="button"
        onClick={() => onTabChange("organize")}
        className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
      >
        Go to Files &amp; Samples
      </button>
    </div>
  );

  // Subtle tab indicator showing which tabs have live edits applied
  const tabHasActiveEdits: Record<WorkspaceTab, boolean> = {
    organize: sources.length > 1 || pages.some((p) => p.rotation !== 0),
    crop: croppedPageCount > 0,
    layout:
      layoutConfig.pagesPerSheet > 1 ||
      layoutConfig.customGrid ||
      layoutConfig.noteLines ||
      layoutConfig.watermarkText.trim().length > 0 ||
      layoutConfig.pageNumbers !== "none",
    invert: invertedCount > 0,
    ocr: pagesWithOcr > 0,
    ai:
      aiStudio.messages.length > 0 ||
      aiStudio.summaryText.length > 0 ||
      aiStudio.flashcards.length > 0 ||
      aiStudio.quizQuestions.length > 0 ||
      aiStudio.actionItemsText.length > 0,
  };

  return (
    <aside
      aria-label="PDF Editing Options"
      data-testid="editing-options-pane"
      className="flex flex-col h-full bg-white overflow-hidden"
    >
      {/* Hidden shared file picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        aria-label="Add or merge PDF files"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onAddFiles(e.target.files);
            e.target.value = "";
          }
        }}
      />

      {/* Sticky 6-Tool Mode Grid inside the Right 1/3 Editing Panel */}
      <div className="p-3 border-b border-slate-200 bg-slate-50/70 shrink-0">
        <nav aria-label="Workspace editing tools" className="grid grid-cols-3 gap-1.5">
          {TOOL_TABS.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;
            const hasEdits = tabHasActiveEdits[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTabChange(id)}
                aria-current={isActive ? "page" : undefined}
                data-has-edits={hasEdits ? "true" : "false"}
                className={`inline-flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                  isActive
                    ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                    : hasEdits
                      ? "bg-blue-50/60 text-blue-900 border-blue-300 hover:border-blue-400"
                      : "bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Quick encrypted source notice when on non-Organize tabs */}
        {activeTab !== "organize" && protectedSources.length > 0 && (
          <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
            <span className="flex items-center gap-1.5 truncate">
              <Lock className="h-3 w-3 text-amber-600 shrink-0" />
              <span className="truncate">Protected PDF loaded</span>
            </span>
            <button
              type="button"
              onClick={() => onRemovePassword(protectedSources[0].id)}
              disabled={removingPasswordId === protectedSources[0].id}
              className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-700 whitespace-nowrap shrink-0"
            >
              Remove Password
            </button>
          </div>
        )}
      </div>

      {/* Active Tool Body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* === 1. ORGANIZE, FILES, MERGE, ADD/DELETE & PASSWORD REMOVAL === */}
        {activeTab === "organize" && (
          <div className="divide-y divide-slate-200">
            {/* Source PDFs & Merge & Unlock */}
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-900 tracking-wide">
                  Source PDFs &amp; Merge
                </h2>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  {sources.length} {sources.length === 1 ? "file" : "files"} · {pages.length}p
                </span>
              </div>

              <button
                type="button"
                disabled={isLoading}
                onClick={() => fileInputRef.current?.click()}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 transition-colors"
              >
                <FilePlus2 className="h-4 w-4 text-blue-600" />
                <span>{sources.length === 0 ? "Upload PDF" : "Merge Another PDF"}</span>
              </button>

              {sources.length > 0 && (
                <ul className="space-y-2" aria-label="Loaded PDF files">
                  {sources.map((src) => {
                    const isRemovingPw = removingPasswordId === src.id;
                    return (
                      <li
                        key={src.id}
                        className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p
                              className="text-xs font-medium text-slate-800 truncate flex items-center gap-1"
                              title={src.name}
                            >
                              {src.wasEncrypted && (
                                <Lock
                                  className="h-3 w-3 text-amber-600 shrink-0"
                                  aria-label="Password protected"
                                />
                              )}
                              <span className="truncate">{src.name}</span>
                            </p>
                            <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                              {src.pageCount} {src.pageCount === 1 ? "page" : "pages"} ·{" "}
                              {formatBytes(src.byteLength)}
                              {src.wasEncrypted ? " · Protected" : ""}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onRemoveSource(src.id)}
                            aria-label={`Remove ${src.name}`}
                            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {src.wasEncrypted && (
                          <button
                            type="button"
                            disabled={isRemovingPw}
                            onClick={() => onRemovePassword(src.id)}
                            className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-md border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 disabled:opacity-50 transition-colors"
                          >
                            {isRemovingPw ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <span>Removing password...</span>
                              </>
                            ) : (
                              <>
                                <Unlock className="h-3 w-3" />
                                <span>Remove Password &amp; Save Unlocked</span>
                              </>
                            )}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Quick Sample Decks */}
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[11px] font-medium text-slate-500 mb-1.5">
                  {sources.length === 0 ? "Quick sample decks" : "Merge sample deck"}
                </p>
                <div className="grid grid-cols-1 gap-1">
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => onLoadSample("dark-lecture")}
                    className="text-left px-2.5 py-1.5 rounded-md text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  >
                    + Dark-Mode Lecture Slides (6p)
                  </button>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => onLoadSample("research-handout")}
                    className="text-left px-2.5 py-1.5 rounded-md text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  >
                    + Research Formula Sheet (3p)
                  </button>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => onLoadSample("scanned-worksheet")}
                    className="text-left px-2.5 py-1.5 rounded-md text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  >
                    + Scanned Lab Worksheet (2p)
                  </button>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => onLoadSample("encrypted-exam")}
                    className="text-left px-2.5 py-1.5 rounded-md text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors flex items-center gap-1.5"
                  >
                    <Lock className="h-3 w-3 text-amber-600 shrink-0" />
                    <span>Locked Exam Solutions (2p)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Add & Delete Pages */}
            <div className="p-4 space-y-3">
              <h2 className="text-xs font-semibold text-slate-900 tracking-wide">
                Add &amp; Delete Pages
              </h2>

              <div className="space-y-1.5">
                <label
                  htmlFor="blank-style-select"
                  className="block text-[11px] font-medium text-slate-600"
                >
                  Insert note / blank page
                </label>
                <div className="flex gap-1.5">
                  <select
                    id="blank-style-select"
                    value={blankStyle}
                    onChange={(e) => setBlankStyle(e.target.value as BlankPageStyle)}
                    className="flex-1 min-w-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="ruled">Ruled Lines</option>
                    <option value="grid">Graph Grid</option>
                    <option value="blank">Plain Blank</option>
                  </select>
                  <button
                    type="button"
                    disabled={pages.length === 0}
                    onClick={() => onInsertBlankPage(blankStyle)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-40 shrink-0"
                  >
                    <FilePlus className="h-3.5 w-3.5" />
                    <span>Add Page</span>
                  </button>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const err = onDeleteByRange(deleteRangeInput);
                  setDeleteRangeError(err);
                  if (!err) setDeleteRangeInput("");
                }}
                className="space-y-1.5"
              >
                <label
                  htmlFor="delete-range-input"
                  className="block text-[11px] font-medium text-slate-600"
                >
                  Delete pages by range (e.g. 2, 4-5)
                </label>
                <div className="flex gap-1.5">
                  <input
                    id="delete-range-input"
                    type="text"
                    value={deleteRangeInput}
                    disabled={pages.length === 0}
                    onChange={(e) => {
                      setDeleteRangeInput(e.target.value);
                      if (deleteRangeError) setDeleteRangeError(null);
                    }}
                    placeholder="2, 4-5"
                    className="w-full min-w-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:outline-none disabled:bg-slate-50"
                  />
                  <button
                    type="submit"
                    disabled={pages.length === 0}
                    className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40 shrink-0"
                  >
                    Delete
                  </button>
                </div>
                {deleteRangeError && (
                  <p role="alert" className="text-[11px] text-red-600">
                    {deleteRangeError}
                  </p>
                )}
              </form>

              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={onDeleteSelected}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete Selected ({selectedIds.size})</span>
                </button>
              )}
            </div>

            {/* Selection & Batch Operations */}
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-900 tracking-wide">
                  Selection &amp; Batch Actions
                </h2>
                {selectedIds.size > 0 && (
                  <span className="text-xs font-mono tabular-nums text-blue-600 font-medium">
                    {selectedIds.size} selected
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={pages.length === 0}
                  onClick={onSelectAll}
                  className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  <span>Select All</span>
                </button>
                <button
                  type="button"
                  disabled={selectedIds.size === 0}
                  onClick={onClearSelection}
                  className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  <Square className="h-3.5 w-3.5" />
                  <span>Clear</span>
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const err = onSelectByRange(rangeInput);
                  setRangeError(err);
                  if (!err) setRangeInput("");
                }}
                className="space-y-1.5"
              >
                <label
                  htmlFor="page-range-select"
                  className="block text-[11px] font-medium text-slate-600"
                >
                  Select page range (e.g. 1, 3-5)
                </label>
                <div className="flex gap-1.5">
                  <input
                    id="page-range-select"
                    type="text"
                    value={rangeInput}
                    disabled={pages.length === 0}
                    onChange={(e) => {
                      setRangeInput(e.target.value);
                      if (rangeError) setRangeError(null);
                    }}
                    placeholder="1, 3-5"
                    className="w-full min-w-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none disabled:bg-slate-50"
                  />
                  <button
                    type="submit"
                    disabled={pages.length === 0}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 shrink-0"
                  >
                    Select
                  </button>
                </div>
                {rangeError && (
                  <p role="alert" className="text-[11px] text-red-600">
                    {rangeError}
                  </p>
                )}
              </form>

              <div className="space-y-1.5 pt-1">
                <button
                  type="button"
                  disabled={pages.length < 2}
                  onClick={onReverseOrder}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  <ArrowUpDown className="h-3.5 w-3.5 text-slate-500" />
                  <span>Reverse All Page Order</span>
                </button>

                <button
                  type="button"
                  disabled={pages.length === 0}
                  onClick={onRotateSelected}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  <RotateCw className="h-3.5 w-3.5 text-slate-500" />
                  <span>
                    Rotate {selectedIds.size > 0 ? `Selected (${selectedIds.size})` : "All"} 90° CW
                  </span>
                </button>

                <button
                  type="button"
                  disabled={pages.length === 0}
                  onClick={onInvertSelected}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  <Contrast className="h-3.5 w-3.5 text-slate-500" />
                  <span>
                    Toggle Invert {selectedIds.size > 0 ? `(${selectedIds.size})` : "(All)"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* === 2. CROP CONTROLS (LIVE-SYNCED ACROSS ALL TABS) === */}
        {activeTab === "crop" &&
          (!activePage ? (
            renderEmptyNotice("Crop")
          ) : (
            <div className="p-4 space-y-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Crop Pages</h2>
                  <p className="text-xs text-slate-500">
                    Changes save live and stay synced in all tabs
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!hasActiveCrop(liveCrop)}
                  onClick={() => onLiveCropChange(undefined, true)}
                  aria-label="Reset crop selection"
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-40 shrink-0"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset</span>
                </button>
              </div>

              {renderScopeToggle(
                cropSettings.scope,
                (scope) => onChangeCropSettings({ scope }),
                "Apply crop edits live to",
              )}

              {/* Active Page Stepper */}
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono tabular-nums">
                <button
                  type="button"
                  disabled={safeIndex === 0}
                  onClick={() => onChangeActivePageIndex(Math.max(0, safeIndex - 1))}
                  aria-label="Previous page to crop"
                  className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-35"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="font-semibold text-slate-900">
                  Page {safeIndex + 1} of {pages.length}
                </span>
                <button
                  type="button"
                  disabled={safeIndex >= pages.length - 1}
                  onClick={() => onChangeActivePageIndex(Math.min(pages.length - 1, safeIndex + 1))}
                  aria-label="Next page to crop"
                  className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-35"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {layoutMode === "paged" && (
                <button
                  type="button"
                  onClick={onJumpToLivePreview}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>Open Visual Crop Canvas</span>
                </button>
              )}

              {/* Quick Presets (apply immediately!) */}
              <div className="space-y-2">
                <span className="block text-xs font-semibold text-slate-800">Quick presets</span>
                <div className="flex flex-wrap gap-1.5">
                  {CROP_PRESETS.map((preset) => {
                    const isMatch =
                      Math.abs(liveCrop.top - preset.crop.top) < 0.005 &&
                      Math.abs(liveCrop.right - preset.crop.right) < 0.005 &&
                      Math.abs(liveCrop.bottom - preset.crop.bottom) < 0.005 &&
                      Math.abs(liveCrop.left - preset.crop.left) < 0.005;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        aria-pressed={isMatch}
                        onClick={() =>
                          onLiveCropChange(
                            hasActiveCrop(preset.crop) ? normalizeCrop(preset.crop) : undefined,
                            true,
                          )
                        }
                        className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                          isMatch
                            ? "border-blue-600 bg-blue-50 text-blue-800 font-semibold"
                            : "border-slate-200 bg-white text-slate-700 hover:border-blue-400 hover:text-blue-700"
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Margin Inset Sliders (live-updating!) */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <span className="block text-xs font-semibold text-slate-800">Crop insets (%)</span>
                {(
                  [
                    { key: "top", label: "Top edge" },
                    { key: "bottom", label: "Bottom edge" },
                    { key: "left", label: "Left edge" },
                    { key: "right", label: "Right edge" },
                  ] as { key: keyof CropInsets; label: string }[]
                ).map(({ key, label }) => {
                  const pct = Math.round(liveCrop[key] * 100);
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <label htmlFor={`crop-${key}`} className="font-medium text-slate-700">
                          {label}
                        </label>
                        <span className="font-mono tabular-nums text-slate-500">{pct}%</span>
                      </div>
                      <input
                        id={`crop-${key}`}
                        type="range"
                        min={0}
                        max={60}
                        step={1}
                        value={pct}
                        onPointerDown={() =>
                          onLiveCropChange(hasActiveCrop(liveCrop) ? liveCrop : undefined, true)
                        }
                        onChange={(e) => updateCropEdgePct(key, Number(e.target.value))}
                        className="w-full accent-blue-600"
                      />
                    </div>
                  );
                })}
              </div>

              {/* Dimensions Readout */}
              {(() => {
                const fullDims = getEffectiveDimensions(activePage);
                const croppedDims = getCroppedDimensions({ ...activePage, crop: liveCrop });
                return (
                  <div className="rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs font-mono tabular-nums text-slate-600 space-y-1">
                    <div className="flex justify-between">
                      <span>Original</span>
                      <span className="text-slate-900">
                        {Math.round(fullDims.width)} × {Math.round(fullDims.height)} pt
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cropped (Live)</span>
                      <span className="font-semibold text-blue-700" data-testid="cropped-dimensions">
                        {Math.round(croppedDims.width)} × {Math.round(croppedDims.height)} pt
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Batch Sync / Clear Helpers */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                {cropSettings.scope !== "all" && hasActiveCrop(liveCrop) && (
                  <button
                    type="button"
                    onClick={() => onApplyCropAll(liveCrop)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
                  >
                    <Crop className="h-3.5 w-3.5" />
                    <span>Copy Page {safeIndex + 1} Crop to All {pages.length} Pages</span>
                  </button>
                )}

                {croppedPageCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onApplyCropAll(undefined)}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Clear Crop on All Pages ({croppedPageCount})</span>
                  </button>
                )}
              </div>
            </div>
          ))}

        {/* === 3. N-UP SHEET LAYOUT CONTROLS === */}
        {activeTab === "layout" &&
          (pages.length === 0 || !plan ? (
            renderEmptyNotice("N-Up Layout")
          ) : (
            <div className="p-4 space-y-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">N-Up Sheet Layout</h2>
                  <p className="text-xs text-slate-500">
                    {pages.length} pages → {plan.sheets.length}{" "}
                    {plan.sheets.length === 1 ? "sheet" : "sheets"} ({plan.cols}×{plan.rows})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onChangeLayoutConfig(DEFAULT_LAYOUT_CONFIG, true)}
                  aria-label="Reset layout to 1 page per sheet"
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 shrink-0"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset</span>
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">Pages per sheet</span>
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={layoutConfig.customGrid}
                      onChange={(e) => updateLayout({ customGrid: e.target.checked })}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>Custom grid</span>
                  </label>
                </div>

                {!layoutConfig.customGrid ? (
                  <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Pages per sheet">
                    {PRESET_COUNTS.map((count) => {
                      const active = layoutConfig.pagesPerSheet === count;
                      return (
                        <button
                          key={count}
                          type="button"
                          aria-pressed={active}
                          onClick={() => updateLayout({ pagesPerSheet: count, customGrid: false })}
                          className={`py-2 text-xs font-mono font-semibold rounded-lg border transition-colors tabular-nums ${
                            active
                              ? "bg-slate-900 text-white border-slate-900"
                              : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
                          }`}
                        >
                          {count}-up
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label
                        htmlFor="custom-cols"
                        className="block text-[11px] font-medium text-slate-600 mb-1"
                      >
                        Columns (1–6)
                      </label>
                      <input
                        id="custom-cols"
                        type="number"
                        min={1}
                        max={6}
                        value={layoutConfig.customCols}
                        onChange={(e) =>
                          updateLayout({
                            customCols: Math.max(1, Math.min(6, Number(e.target.value) || 1)),
                          })
                        }
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="custom-rows"
                        className="block text-[11px] font-medium text-slate-600 mb-1"
                      >
                        Rows (1–8)
                      </label>
                      <input
                        id="custom-rows"
                        type="number"
                        min={1}
                        max={8}
                        value={layoutConfig.customRows}
                        onChange={(e) =>
                          updateLayout({
                            customRows: Math.max(1, Math.min(8, Number(e.target.value) || 1)),
                          })
                        }
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono tabular-nums"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <span className="block text-xs font-semibold text-slate-800">
                  Arrangement direction
                </span>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg">
                  {(
                    [
                      { id: "horizontal", label: "Horizontal", icon: ArrowRight },
                      { id: "vertical", label: "Vertical", icon: ArrowDown },
                    ] as { id: LayoutDirection; label: string; icon: typeof ArrowRight }[]
                  ).map(({ id, label, icon: Icon }) => {
                    const active = layoutConfig.direction === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => updateLayout({ direction: id })}
                        className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-colors ${
                          active
                            ? "bg-white text-slate-900 shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="paper-size-select"
                    className="block text-xs font-semibold text-slate-800 mb-1"
                  >
                    Paper size
                  </label>
                  <select
                    id="paper-size-select"
                    value={layoutConfig.paperSize}
                    onChange={(e) => updateLayout({ paperSize: e.target.value as PaperSizeKey })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                  >
                    <option value="A4">A4</option>
                    <option value="LETTER">US Letter</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="orientation-select"
                    className="block text-xs font-semibold text-slate-800 mb-1"
                  >
                    Orientation
                  </label>
                  <select
                    id="orientation-select"
                    value={layoutConfig.orientation}
                    onChange={(e) =>
                      updateLayout({ orientation: e.target.value as SheetOrientation })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                  >
                    <option value="auto">Auto-fit</option>
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <label htmlFor="margin-slider" className="font-medium text-slate-700">
                      Outer margin
                    </label>
                    <span className="font-mono tabular-nums text-slate-500">
                      {layoutConfig.marginPt} pt
                    </span>
                  </div>
                  <input
                    id="margin-slider"
                    type="range"
                    min={8}
                    max={54}
                    step={2}
                    value={layoutConfig.marginPt}
                    onChange={(e) => updateLayout({ marginPt: Number(e.target.value) }, false)}
                    className="w-full accent-blue-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <label htmlFor="gap-slider" className="font-medium text-slate-700">
                      Spacing between pages
                    </label>
                    <span className="font-mono tabular-nums text-slate-500">
                      {layoutConfig.gapPt} pt
                    </span>
                  </div>
                  <input
                    id="gap-slider"
                    type="range"
                    min={0}
                    max={36}
                    step={2}
                    value={layoutConfig.gapPt}
                    onChange={(e) => updateLayout({ gapPt: Number(e.target.value) }, false)}
                    className="w-full accent-blue-600"
                  />
                </div>
              </div>

              <div className="space-y-2.5 pt-2 border-t border-slate-100">
                <span className="block text-xs font-semibold text-slate-800">
                  Handout &amp; print options
                </span>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layoutConfig.drawBorders}
                    onChange={(e) => updateLayout({ drawBorders: e.target.checked })}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <span>Draw hairline frame around each slide</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layoutConfig.noteLines}
                    onChange={(e) => updateLayout({ noteLines: e.target.checked })}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <span>Add student note lines beside/below slides</span>
                </label>

                <div className="pt-1">
                  <label
                    htmlFor="page-numbers-select"
                    className="block text-[11px] font-medium text-slate-600 mb-1"
                  >
                    Sheet page numbers
                  </label>
                  <select
                    id="page-numbers-select"
                    value={layoutConfig.pageNumbers}
                    onChange={(e) =>
                      updateLayout({ pageNumbers: e.target.value as PageNumberPosition })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                  >
                    <option value="none">None</option>
                    <option value="bottom-center">Bottom center (1 / N)</option>
                    <option value="bottom-right">Bottom right (1 / N)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="watermark-input"
                    className="block text-[11px] font-medium text-slate-600 mb-1"
                  >
                    Optional watermark text
                  </label>
                  <input
                    id="watermark-input"
                    type="text"
                    value={layoutConfig.watermarkText}
                    onChange={(e) => updateLayout({ watermarkText: e.target.value }, false)}
                    placeholder="e.g. CS 410 Handout or DRAFT"
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400"
                  />
                </div>
              </div>
            </div>
          ))}

        {/* === 4. COLOR INVERSION CONTROLS (LIVE-SYNCED ACROSS ALL TABS) === */}
        {activeTab === "invert" &&
          (!activePage ? (
            renderEmptyNotice("Color Inversion")
          ) : (
            <div className="p-4 space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Color Inversion</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Selecting a mode applies immediately and stays synced across all tabs.
                </p>
              </div>

              {renderScopeToggle(
                invertSettings.scope,
                (scope) => onChangeInvertSettings({ scope }),
                "Apply inversion live to",
              )}

              <div className="space-y-2" role="radiogroup" aria-label="Color inversion algorithm">
                <span className="block text-xs font-semibold text-slate-800">
                  Inversion mode
                </span>
                {INVERT_MODES.map((m) => {
                  const active = activePage.invertMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => onApplyLiveInvert(m.id)}
                      className={`w-full text-left rounded-lg border p-3 transition-colors ${
                        active
                          ? "border-blue-600 bg-blue-50/40"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-900">{m.name}</span>
                        {active && <Check className="h-3.5 w-3.5 text-blue-600" />}
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">{m.summary}</p>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={invertedCount === 0}
                  onClick={onResetAllInvert}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset All Pages to Original Colors</span>
                </button>
              </div>

              <div className="pt-2 border-t border-slate-100 text-xs text-slate-600 font-mono tabular-nums">
                Currently inverted: <strong className="text-slate-900">{invertedCount}</strong> /{" "}
                {pages.length} pages
              </div>
            </div>
          ))}

        {/* === 5. OCR EXTRACTION & TEXT EDITOR === */}
        {activeTab === "ocr" &&
          (!activePage ? (
            renderEmptyNotice("OCR")
          ) : (
            <div className="p-4 flex flex-col gap-4 min-h-full">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">OCR Text Extraction</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Reads your live cropped &amp; inverted pages and retains extracted text everywhere.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    onChangeOcrSettings({ mode: "vision" });
                    setOcrError(null);
                  }}
                  aria-pressed={ocrSettings.mode === "vision"}
                  className={`inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    ocrSettings.mode === "vision"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <ScanText className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  <span>Vision OCR</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChangeOcrSettings({ mode: "embedded" });
                    setOcrError(null);
                  }}
                  aria-pressed={ocrSettings.mode === "embedded"}
                  className={`inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    ocrSettings.mode === "embedded"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <FileSearch className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                  <span>Embedded</span>
                </button>
              </div>

              {ocrSettings.mode === "vision" && (
                <div className="grid grid-cols-2 gap-2">
                  <select
                    aria-label="OCR output format"
                    value={ocrSettings.outputFormat}
                    onChange={(e) =>
                      onChangeOcrSettings({ outputFormat: e.target.value as "markdown" | "plain" })
                    }
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                  >
                    <option value="markdown">Markdown &amp; Tables</option>
                    <option value="plain">Plain Text</option>
                  </select>
                  <input
                    type="text"
                    value={ocrSettings.languageHint}
                    onChange={(e) => onChangeOcrSettings({ languageHint: e.target.value })}
                    aria-label="Optional language hint"
                    placeholder="Language (auto)"
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400"
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {isOcrRunning ? (
                  <button
                    type="button"
                    onClick={() => {
                      ocrCancelRef.current = true;
                    }}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700"
                  >
                    <StopCircle className="h-3.5 w-3.5" />
                    <span>
                      Stop ({ocrProgress?.current ?? 1}/{ocrProgress?.total ?? 1})
                    </span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleExtractCurrentOcr}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      <ScanText className="h-3.5 w-3.5" />
                      <span>OCR Page {safeIndex + 1}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExtractAllOcr}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 transition-colors"
                    >
                      <span>OCR All ({pages.length})</span>
                    </button>
                  </>
                )}
              </div>

              {ocrError && (
                <div
                  role="alert"
                  className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 flex items-start gap-2 text-xs text-red-800"
                >
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <span className="flex-1">{ocrError}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <span className="text-xs font-semibold text-slate-900">
                  Page {safeIndex + 1} Text
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={!activePage.ocrText}
                    onClick={handleCopyOcr}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    {copiedOcr ? (
                      <Check className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    <span>{copiedOcr ? "Copied" : "Copy"}</span>
                  </button>
                  <button
                    type="button"
                    disabled={pagesWithOcr === 0}
                    onClick={() => handleDownloadAllOcr("txt")}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <Download className="h-3 w-3" />
                    <span>.txt</span>
                  </button>
                  <button
                    type="button"
                    disabled={pagesWithOcr === 0}
                    onClick={() => handleDownloadAllOcr("md")}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <Download className="h-3 w-3" />
                    <span>.md</span>
                  </button>
                </div>
              </div>

              <div className="relative flex-1 flex flex-col min-h-[240px]">
                {isOcrRunning && (
                  <div className="absolute inset-0 z-10 bg-white/80 rounded-lg flex flex-col items-center justify-center gap-2 text-slate-700">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                    <p className="text-xs font-semibold">
                      Extracting ({ocrProgress?.current ?? 1}/{ocrProgress?.total ?? 1})...
                    </p>
                  </div>
                )}
                <label htmlFor="ocr-text-editor" className="sr-only">
                  Extracted text for page {safeIndex + 1}
                </label>
                <textarea
                  id="ocr-text-editor"
                  data-testid="ocr-textarea"
                  value={activePage.ocrText ?? ""}
                  onChange={(e) =>
                    onUpdatePageOcr(
                      activePage.id,
                      e.target.value,
                      activePage.ocrMethod ?? ocrSettings.mode,
                    )
                  }
                  placeholder={`Click "OCR Page ${safeIndex + 1}" to extract text from this page.`}
                  className="flex-1 w-full min-h-[220px] resize-none rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs font-mono leading-relaxed text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ocrSettings.embedOcrTextLayer}
                  onChange={(e) => onChangeOcrSettings({ embedOcrTextLayer: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>Embed OCR text as searchable layer on export</span>
              </label>
            </div>
          ))}

        {/* === 6. AI STUDIO (STATE PERSISTED IN CENTRALIZED STORE) === */}
        {activeTab === "ai" &&
          (pages.length === 0 ? (
            renderEmptyNotice("AI Studio")
          ) : (
            <AiAssistantView
              pages={pages}
              sourcesById={sourcesById}
              documentTitle={documentTitle}
              aiState={aiStudio}
              onPatchAiState={onPatchAiStudio}
              compact
            />
          ))}
      </div>
    </aside>
  );
}
