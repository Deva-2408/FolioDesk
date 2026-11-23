import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Contrast,
  Copy,
  FileText,
  GripVertical,
  LayoutGrid,
  Layers,
  List,
  Maximize2,
  Plus,
  RotateCw,
  Trash2,
} from "lucide-react";
import type {
  ActiveEditSummaryItem,
  BlankPageStyle,
  CropInsets,
  InvertMode,
  NUpLayoutConfig,
  PdfPageItem,
  PreviewDisplayMode,
  SourceDocument,
  WorkspaceTab,
} from "../types/pdf";
import type { MoveDirection } from "../utils/pageOperations";
import { getEffectiveDimensions } from "../utils/pageOperations";
import { hasActiveCrop, normalizeCrop, ZERO_CROP } from "../utils/cropMath";
import { computeImpositionPlan } from "../utils/layoutMath";
import type { SampleDeckId } from "../utils/samplePdfs";
import { EmptyDropzone } from "./EmptyDropzone";
import { PageThumbnail } from "./PageThumbnail";

type DragHandle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se" | "move";

interface LivePdfPaneProps {
  pages: PdfPageItem[];
  sourcesById: ReadonlyMap<string, SourceDocument>;
  selectedIds: ReadonlySet<string>;
  activeTab: WorkspaceTab;
  onJumpToTab: (tab: WorkspaceTab) => void;
  activePageIndex: number;
  onChangeActivePageIndex: (index: number) => void;
  previewMode: PreviewDisplayMode;
  onChangePreviewMode: (mode: PreviewDisplayMode) => void;
  layoutConfig: NUpLayoutConfig;
  activeEdits: ActiveEditSummaryItem[];
  onLiveCropChange: (next: CropInsets, recordHistory: boolean) => void;
  chosenInvertMode: Exclude<InvertMode, "none">;
  isLoading: boolean;
  onFilesSelected: (files: FileList | File[]) => void;
  onLoadSample: (deckId: SampleDeckId) => void;
  onToggleSelect: (pageId: string) => void;
  onMovePage: (index: number, direction: MoveDirection) => void;
  onReorderPages: (fromIndex: number, toIndex: number) => void;
  onRotatePage: (pageId: string) => void;
  onToggleInvertPage: (pageId: string) => void;
  onApplyInvertSingle: (pageId: string, mode: InvertMode) => void;
  onDuplicatePage: (pageId: string) => void;
  onDeletePage: (pageId: string) => void;
  onInsertBlankPage: (style: BlankPageStyle, explicitIndex?: number) => void;
  onInspectPage: (index: number) => void;
}

export function LivePdfPane({
  pages,
  sourcesById,
  selectedIds,
  activeTab,
  onJumpToTab,
  activePageIndex,
  onChangeActivePageIndex,
  previewMode,
  onChangePreviewMode,
  layoutConfig,
  activeEdits,
  onLiveCropChange,
  chosenInvertMode,
  isLoading,
  onFilesSelected,
  onLoadSample,
  onToggleSelect,
  onMovePage,
  onReorderPages,
  onRotatePage,
  onToggleInvertPage,
  onApplyInvertSingle,
  onDuplicatePage,
  onDeletePage,
  onInsertBlankPage,
  onInspectPage,
}: LivePdfPaneProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const insertPdfInputRef = useRef<HTMLInputElement>(null);

  const safeIndex = Math.min(activePageIndex, Math.max(0, pages.length - 1));
  const activePage = pages[safeIndex];
  const liveCrop = normalizeCrop(activePage?.crop ?? ZERO_CROP);

  // Interactive crop drag state — directly commits live crop to unified store
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    handle: DragHandle;
    startX: number;
    startY: number;
    startCrop: CropInsets;
    rect: DOMRect;
    hasRecordedHistory: boolean;
  } | null>(null);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = (e.clientX - d.startX) / Math.max(1, d.rect.width);
      const dy = (e.clientY - d.startY) / Math.max(1, d.rect.height);
      const s = d.startCrop;
      let next: CropInsets = { ...s };

      if (d.handle === "move") {
        const boxW = 1 - s.left - s.right;
        const boxH = 1 - s.top - s.bottom;
        const newLeft = Math.max(0, Math.min(1 - boxW, s.left + dx));
        const newTop = Math.max(0, Math.min(1 - boxH, s.top + dy));
        next = {
          left: newLeft,
          right: Math.max(0, 1 - newLeft - boxW),
          top: newTop,
          bottom: Math.max(0, 1 - newTop - boxH),
        };
      } else {
        if (d.handle.includes("n")) next.top = s.top + dy;
        if (d.handle.includes("s")) next.bottom = s.bottom - dy;
        if (d.handle.includes("w")) next.left = s.left + dx;
        if (d.handle.includes("e")) next.right = s.right - dx;
      }

      const recordHistory = !d.hasRecordedHistory;
      d.hasRecordedHistory = true;
      onLiveCropChange(normalizeCrop(next), recordHistory);
    };

    const onPointerUp = () => {
      dragRef.current = null;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [onLiveCropChange]);

  const startCropDrag = (handle: DragHandle) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: liveCrop,
      rect,
      hasRecordedHistory: false,
    };
  };

  if (pages.length === 0) {
    return (
      <section
        aria-label="Live PDF Preview"
        data-testid="live-pdf-pane"
        className="flex flex-col h-full overflow-y-auto bg-[#F8F9FB]"
      >
        <EmptyDropzone
          onFilesSelected={onFilesSelected}
          onLoadSample={onLoadSample}
          isLoading={isLoading}
        />
      </section>
    );
  }

  const isSheetLayoutConfigured =
    layoutConfig.pagesPerSheet > 1 ||
    layoutConfig.customGrid ||
    layoutConfig.noteLines ||
    layoutConfig.watermarkText.trim().length > 0 ||
    layoutConfig.pageNumbers !== "none";

  const impositionPlan =
    activeTab === "layout" || previewMode === "sheets"
      ? computeImpositionPlan(pages, layoutConfig)
      : null;

  const croppedCount = pages.filter((p) => hasActiveCrop(p.crop)).length;

  // Shared strip showing every currently retained edit across all tabs
  const renderSyncedEditsStrip = () => {
    if (activeEdits.length === 0) return null;
    return (
      <div
        data-testid="synced-edits-bar"
        className="bg-slate-50/90 border-b border-slate-200 px-4 py-1.5 flex items-center gap-2 overflow-x-auto text-[11px] text-slate-600"
      >
        <span className="font-semibold text-slate-500 whitespace-nowrap shrink-0">
          Synced edits:
        </span>
        {activeEdits.map((item, idx) => (
          <span key={item.id} className="inline-flex items-center gap-2 shrink-0">
            {idx > 0 && (
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
            )}
            <button
              type="button"
              onClick={() => onJumpToTab(item.tab)}
              className={`font-medium whitespace-nowrap transition-colors ${
                activeTab === item.tab
                  ? "text-blue-700 underline underline-offset-2"
                  : "text-slate-700 hover:text-blue-700"
              }`}
            >
              {item.label}
            </button>
          </span>
        ))}
      </div>
    );
  };

  // --- 1. Interactive Crop Stage (live-synced with Invert & Rotation) ---
  if (activeTab === "crop" && activePage) {
    const fullDims = getEffectiveDimensions(activePage);
    return (
      <section
        aria-label="Live PDF Crop Preview"
        data-testid="live-pdf-pane"
        className="flex flex-col h-full overflow-hidden"
      >
        <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 font-mono tabular-nums">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safeIndex === 0}
              onClick={() => onChangeActivePageIndex(Math.max(0, safeIndex - 1))}
              aria-label="Previous page"
              className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-35"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span>
              Live Crop · Page <strong className="text-slate-900">{safeIndex + 1}</strong> /{" "}
              {pages.length}
            </span>
            <button
              type="button"
              disabled={safeIndex >= pages.length - 1}
              onClick={() => onChangeActivePageIndex(Math.min(pages.length - 1, safeIndex + 1))}
              aria-label="Next page"
              className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-35"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <span className="text-slate-500">
            {croppedCount} / {pages.length} cropped
          </span>
        </div>
        {renderSyncedEditsStrip()}

        <div className="flex-1 overflow-y-auto desk-surface p-4 lg:p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex justify-center">
              <div
                ref={stageRef}
                data-testid="crop-stage"
                className="relative inline-block max-w-full shadow-md border border-slate-300 bg-white select-none touch-none"
                style={{ width: fullDims.width >= fullDims.height ? "640px" : "440px" }}
              >
                <PageThumbnail
                  page={activePage}
                  sourcesById={sourcesById}
                  targetWidthPx={860}
                  exactPixelInvert
                  disableCrop
                  className="w-full block"
                  alt={`Page ${safeIndex + 1} crop preview`}
                />

                {/* Excluded margin scrims */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 left-0 right-0 bg-slate-950/50"
                  style={{ height: `${liveCrop.top * 100}%` }}
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-0 left-0 right-0 bg-slate-950/50"
                  style={{ height: `${liveCrop.bottom * 100}%` }}
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 bg-slate-950/50"
                  style={{
                    top: `${liveCrop.top * 100}%`,
                    bottom: `${liveCrop.bottom * 100}%`,
                    width: `${liveCrop.left * 100}%`,
                  }}
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute right-0 bg-slate-950/50"
                  style={{
                    top: `${liveCrop.top * 100}%`,
                    bottom: `${liveCrop.bottom * 100}%`,
                    width: `${liveCrop.right * 100}%`,
                  }}
                />

                {/* Active Draggable Crop Box */}
                <div
                  onPointerDown={startCropDrag("move")}
                  style={{
                    position: "absolute",
                    top: `${liveCrop.top * 100}%`,
                    right: `${liveCrop.right * 100}%`,
                    bottom: `${liveCrop.bottom * 100}%`,
                    left: `${liveCrop.left * 100}%`,
                  }}
                  className="border-2 border-blue-500 cursor-move"
                >
                  <div className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-white/40" />
                  <div className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-white/40" />
                  <div className="pointer-events-none absolute inset-y-0 left-1/3 border-l border-white/40" />
                  <div className="pointer-events-none absolute inset-y-0 left-2/3 border-l border-white/40" />

                  <button
                    type="button"
                    aria-label="Drag top-left crop corner"
                    onPointerDown={startCropDrag("nw")}
                    className="absolute -top-2 -left-2 h-4 w-4 rounded-sm bg-blue-600 border-2 border-white shadow cursor-nwse-resize"
                  />
                  <button
                    type="button"
                    aria-label="Drag top-right crop corner"
                    onPointerDown={startCropDrag("ne")}
                    className="absolute -top-2 -right-2 h-4 w-4 rounded-sm bg-blue-600 border-2 border-white shadow cursor-nesw-resize"
                  />
                  <button
                    type="button"
                    aria-label="Drag bottom-left crop corner"
                    onPointerDown={startCropDrag("sw")}
                    className="absolute -bottom-2 -left-2 h-4 w-4 rounded-sm bg-blue-600 border-2 border-white shadow cursor-nesw-resize"
                  />
                  <button
                    type="button"
                    aria-label="Drag bottom-right crop corner"
                    onPointerDown={startCropDrag("se")}
                    className="absolute -bottom-2 -right-2 h-4 w-4 rounded-sm bg-blue-600 border-2 border-white shadow cursor-nwse-resize"
                  />

                  <button
                    type="button"
                    aria-label="Drag top crop edge"
                    onPointerDown={startCropDrag("n")}
                    className="absolute -top-1.5 left-1/2 -translate-x-1/2 h-3 w-8 rounded-full bg-blue-600 border border-white cursor-ns-resize"
                  />
                  <button
                    type="button"
                    aria-label="Drag bottom crop edge"
                    onPointerDown={startCropDrag("s")}
                    className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-3 w-8 rounded-full bg-blue-600 border border-white cursor-ns-resize"
                  />
                  <button
                    type="button"
                    aria-label="Drag left crop edge"
                    onPointerDown={startCropDrag("w")}
                    className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-8 rounded-full bg-blue-600 border border-white cursor-ew-resize"
                  />
                  <button
                    type="button"
                    aria-label="Drag right crop edge"
                    onPointerDown={startCropDrag("e")}
                    className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-8 rounded-full bg-blue-600 border border-white cursor-ew-resize"
                  />
                </div>
              </div>
            </div>

            {/* Page Selector Filmstrip */}
            <div className="pt-4 border-t border-slate-200">
              <p className="text-xs font-semibold text-slate-700 mb-3">
                Select page to adjust crop
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {pages.map((p, idx) => {
                  const isCurrent = idx === safeIndex;
                  const cropped = hasActiveCrop(p.crop);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onChangeActivePageIndex(idx)}
                      aria-label={`Edit crop for page ${idx + 1}`}
                      className={`rounded-lg border p-1.5 bg-white text-left transition-all ${
                        isCurrent
                          ? "border-blue-600 ring-2 ring-blue-600/20"
                          : "border-slate-200 hover:border-slate-400"
                      }`}
                    >
                      <PageThumbnail
                        page={p}
                        sourcesById={sourcesById}
                        targetWidthPx={180}
                        exactPixelInvert
                        className="w-full rounded border border-slate-100"
                      />
                      <div className="mt-1.5 flex items-center justify-between text-[11px] font-mono tabular-nums px-0.5">
                        <span className="text-slate-800 font-semibold">{idx + 1}</span>
                        <span className={cropped ? "text-blue-600" : "text-slate-400"}>
                          {cropped ? "Crop" : "Full"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // --- 2. Live N-Up Imposed Sheets Preview (active in Layout tab OR whenever user views Sheets) ---
  if ((activeTab === "layout" || previewMode === "sheets") && impositionPlan) {
    return (
      <section
        aria-label="Live Imposed PDF Sheets"
        data-testid="live-pdf-pane"
        className="flex flex-col h-full overflow-hidden"
      >
        <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div
            data-testid="layout-summary"
            className="flex flex-wrap items-center gap-2 text-xs text-slate-600 font-mono tabular-nums"
          >
            <span className="font-semibold text-slate-900">
              Live Output · {pages.length} {pages.length === 1 ? "page" : "pages"} →{" "}
              {impositionPlan.sheets.length}{" "}
              {impositionPlan.sheets.length === 1 ? "sheet" : "sheets"}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {impositionPlan.cols}×{impositionPlan.rows} ({impositionPlan.perSheet}-up{" "}
              {layoutConfig.direction})
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {layoutConfig.paperSize}{" "}
              {impositionPlan.sheetWidth > impositionPlan.sheetHeight ? "Landscape" : "Portrait"}
            </span>
          </div>

          {activeTab !== "layout" && (
            <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => onChangePreviewMode("document")}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md text-slate-600 hover:text-slate-900"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Document</span>
              </button>
              <button
                type="button"
                onClick={() => onChangePreviewMode("grid")}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md text-slate-600 hover:text-slate-900"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Grid</span>
              </button>
              <button
                type="button"
                onClick={() => onChangePreviewMode("list")}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md text-slate-600 hover:text-slate-900"
              >
                <List className="h-3.5 w-3.5" />
                <span>List</span>
              </button>
              <button
                type="button"
                aria-pressed="true"
                onClick={() => onChangePreviewMode("sheets")}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md bg-white text-blue-700 shadow-xs"
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Sheets</span>
              </button>
            </div>
          )}
        </div>
        {renderSyncedEditsStrip()}

        <div className="flex-1 overflow-y-auto desk-surface p-4 lg:p-6">
          <div className="max-w-4xl mx-auto space-y-7">
            {impositionPlan.sheets.map((sheet) => {
              const aspect = `${sheet.sheetWidth} / ${sheet.sheetHeight}`;
              return (
                <div key={sheet.sheetIndex} className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
                    <span>
                      Output Sheet {sheet.sheetIndex + 1} of {impositionPlan.sheets.length}
                    </span>
                    <span>
                      Pages {sheet.placements[0].pageIndex + 1}–
                      {sheet.placements[sheet.placements.length - 1].pageIndex + 1}
                    </span>
                  </div>

                  <div
                    data-testid={`imposed-sheet-${sheet.sheetIndex + 1}`}
                    className="relative w-full bg-white rounded-md shadow-sm border border-slate-300 overflow-hidden"
                    style={{
                      aspectRatio: aspect,
                      maxHeight: "640px",
                      marginInline: "auto",
                    }}
                  >
                    {sheet.placements.map((placement) => {
                      const page = pages[placement.pageIndex];
                      const leftPct = (placement.drawX / sheet.sheetWidth) * 100;
                      const topPct = (placement.drawY / sheet.sheetHeight) * 100;
                      const widthPct = (placement.drawWidth / sheet.sheetWidth) * 100;
                      const heightPct = (placement.drawHeight / sheet.sheetHeight) * 100;

                      return (
                        <div key={`${sheet.sheetIndex}-${placement.pageIndex}`}>
                          <div
                            style={{
                              position: "absolute",
                              left: `${leftPct}%`,
                              top: `${topPct}%`,
                              width: `${widthPct}%`,
                              height: `${heightPct}%`,
                            }}
                            className={`overflow-hidden ${
                              layoutConfig.drawBorders ? "ring-1 ring-slate-300" : ""
                            }`}
                          >
                            <PageThumbnail
                              page={page}
                              sourcesById={sourcesById}
                              targetWidthPx={340}
                              exactPixelInvert
                              className="w-full h-full"
                              alt={`Slide ${placement.pageIndex + 1} on sheet ${sheet.sheetIndex + 1}`}
                            />
                            <span className="absolute bottom-1 right-1 bg-slate-900/75 text-white text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded">
                              {placement.pageIndex + 1}
                            </span>
                          </div>

                          {placement.noteArea && (
                            <div
                              style={{
                                position: "absolute",
                                left: `${(placement.noteArea.x / sheet.sheetWidth) * 100}%`,
                                top: `${(placement.noteArea.y / sheet.sheetHeight) * 100}%`,
                                width: `${(placement.noteArea.width / sheet.sheetWidth) * 100}%`,
                                height: `${(placement.noteArea.height / sheet.sheetHeight) * 100}%`,
                              }}
                              className="flex flex-col justify-evenly px-1"
                              aria-hidden="true"
                            >
                              {Array.from({
                                length: Math.max(
                                  3,
                                  Math.min(8, Math.floor(placement.noteArea.height / 18)),
                                ),
                              }).map((_, lineIdx) => (
                                <div
                                  key={lineIdx}
                                  className="w-full border-b border-slate-300"
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {layoutConfig.watermarkText.trim() && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 flex items-center justify-center"
                      >
                        <span className="text-3xl sm:text-4xl font-bold text-slate-400/25 -rotate-24 select-none">
                          {layoutConfig.watermarkText.trim()}
                        </span>
                      </div>
                    )}

                    {layoutConfig.pageNumbers !== "none" && (
                      <div
                        className={`absolute bottom-2 inset-x-6 text-[10px] font-mono tabular-nums text-slate-500 ${
                          layoutConfig.pageNumbers === "bottom-center"
                            ? "text-center"
                            : "text-right"
                        }`}
                      >
                        {sheet.sheetIndex + 1} / {impositionPlan.sheets.length}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  // --- 3. Live Color Inversion Comparison Preview (shows ACTUAL live document state) ---
  if (activeTab === "invert" && activePage) {
    return (
      <section
        aria-label="Live Color Inversion Preview"
        data-testid="live-pdf-pane"
        className="flex flex-col h-full overflow-hidden"
      >
        <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-slate-600 font-mono tabular-nums">
            <button
              type="button"
              disabled={safeIndex === 0}
              onClick={() => onChangeActivePageIndex(Math.max(0, safeIndex - 1))}
              aria-label="Previous page"
              className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-35"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span>
              Page <strong className="text-slate-900">{safeIndex + 1}</strong> / {pages.length} ·{" "}
              <strong className={activePage.invertMode !== "none" ? "text-blue-700" : "text-slate-800"}>
                {activePage.invertMode === "none" ? "Original" : activePage.invertMode}
              </strong>
            </span>
            <button
              type="button"
              disabled={safeIndex >= pages.length - 1}
              onClick={() => onChangeActivePageIndex(Math.min(pages.length - 1, safeIndex + 1))}
              aria-label="Next page"
              className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-35"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {activePage.invertMode === "none" ? (
            <button
              type="button"
              onClick={() => onApplyInvertSingle(activePage.id, chosenInvertMode)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
            >
              Invert Page {safeIndex + 1}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onApplyInvertSingle(activePage.id, "none")}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 transition-colors"
            >
              Restore Original
            </button>
          )}
        </div>
        {renderSyncedEditsStrip()}

        <div className="flex-1 overflow-y-auto desk-surface p-4 lg:p-6">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">Original Colors</span>
                  <span className="text-slate-500">With live crop &amp; rotation</span>
                </div>
                <div className="rounded-xl bg-white border border-slate-200 p-2.5 shadow-xs">
                  <PageThumbnail
                    page={activePage}
                    sourcesById={sourcesById}
                    targetWidthPx={560}
                    exactPixelInvert
                    overrideInvertMode="none"
                    className="w-full rounded"
                    alt={`Original page ${safeIndex + 1}`}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-blue-700">
                    {activePage.invertMode !== "none"
                      ? `Live Edited Output (${activePage.invertMode})`
                      : "Live Edited Output (Original)"}
                  </span>
                  <span className="text-slate-500">Synced across all tabs</span>
                </div>
                <div
                  className={`rounded-xl bg-white border p-2.5 shadow-xs ${
                    activePage.invertMode !== "none" ? "border-blue-300" : "border-slate-200"
                  }`}
                >
                  <PageThumbnail
                    page={activePage}
                    sourcesById={sourcesById}
                    targetWidthPx={560}
                    exactPixelInvert
                    className="w-full rounded"
                    alt={`Live output page ${safeIndex + 1}`}
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200">
              <p className="text-xs font-semibold text-slate-700 mb-3">Select page to inspect</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {pages.map((p, idx) => {
                  const isCurrent = idx === safeIndex;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onChangeActivePageIndex(idx)}
                      aria-label={`Inspect page ${idx + 1} color inversion`}
                      className={`rounded-lg border p-1.5 bg-white text-left transition-all ${
                        isCurrent
                          ? "border-blue-600 ring-2 ring-blue-600/20"
                          : "border-slate-200 hover:border-slate-400"
                      }`}
                    >
                      <PageThumbnail
                        page={p}
                        sourcesById={sourcesById}
                        targetWidthPx={180}
                        exactPixelInvert
                        className="w-full rounded border border-slate-100"
                      />
                      <div className="mt-1.5 flex items-center justify-between text-[11px] font-mono tabular-nums px-0.5">
                        <span className="text-slate-800 font-semibold">{idx + 1}</span>
                        <span className={p.invertMode !== "none" ? "text-blue-600" : "text-slate-400"}>
                          {p.invertMode !== "none" ? "Inv" : "Orig"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // --- 4. Live Focused Page Preview (when OCR tool is active) ---
  if (activeTab === "ocr" && activePage) {
    const pagesWithOcr = pages.filter((p) => (p.ocrText ?? "").trim().length > 0).length;
    return (
      <section
        aria-label="Live PDF OCR Page Preview"
        data-testid="live-pdf-pane"
        className="flex flex-col h-full overflow-hidden"
      >
        <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safeIndex === 0}
              onClick={() => onChangeActivePageIndex(Math.max(0, safeIndex - 1))}
              aria-label="Previous page"
              className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-35"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-semibold text-slate-900">
              Live OCR Source · Page {safeIndex + 1} / {pages.length}
            </span>
            <button
              type="button"
              disabled={safeIndex >= pages.length - 1}
              onClick={() => onChangeActivePageIndex(Math.min(pages.length - 1, safeIndex + 1))}
              aria-label="Next page"
              className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-35"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <span className="text-slate-500">
            {pagesWithOcr} / {pages.length} extracted
          </span>
        </div>
        {renderSyncedEditsStrip()}

        <div className="flex-1 overflow-y-auto desk-surface p-4 lg:p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="rounded-xl bg-white p-3 border border-slate-200 shadow-sm">
              <PageThumbnail
                page={activePage}
                sourcesById={sourcesById}
                targetWidthPx={860}
                exactPixelInvert
                className="w-full rounded"
                alt={`Page ${safeIndex + 1} live source preview for OCR`}
              />
            </div>

            {pages.length > 1 && (
              <div className="pt-4 border-t border-slate-200">
                <p className="text-xs font-semibold text-slate-700 mb-3">Jump to page</p>
                <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2.5">
                  {pages.map((p, idx) => {
                    const isCurrent = idx === safeIndex;
                    const hasOcr = Boolean((p.ocrText ?? "").trim());
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onChangeActivePageIndex(idx)}
                        className={`rounded-lg border p-1.5 bg-white text-left transition-all ${
                          isCurrent
                            ? "border-blue-600 ring-2 ring-blue-600/20"
                            : "border-slate-200 hover:border-slate-400"
                        }`}
                      >
                        <PageThumbnail
                          page={p}
                          sourcesById={sourcesById}
                          targetWidthPx={160}
                          exactPixelInvert
                          className="w-full rounded border border-slate-100"
                        />
                        <div className="mt-1 flex items-center justify-between text-[11px] font-mono tabular-nums px-0.5">
                          <span className="text-slate-800 font-semibold">{idx + 1}</span>
                          <span className={hasOcr ? "text-emerald-600" : "text-slate-400"}>
                            {hasOcr ? "OCR" : "—"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  // --- 5. Default Live Edited PDF Document / Grid / List View (Organize & AI Studio) ---
  return (
    <section
      aria-label="Live Edited PDF Document"
      data-testid="live-pdf-pane"
      className="flex flex-col h-full overflow-hidden"
    >
      <input
        ref={insertPdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        aria-label="Append pages from PDF files"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onFilesSelected(e.target.files);
            e.target.value = "";
          }
        }}
      />

      {/* Live Preview Header Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-900">Live Edited PDF</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            {pages.length} {pages.length === 1 ? "page" : "pages"}
          </span>
          {selectedIds.size > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-blue-700 font-medium font-mono tabular-nums">
                {selectedIds.size} selected
              </span>
            </>
          )}
        </div>

        {/* Persistent View Mode Switcher */}
        <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => onChangePreviewMode("document")}
            aria-label="Live document stream view"
            aria-pressed={previewMode === "document"}
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              previewMode === "document"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Document</span>
          </button>
          <button
            type="button"
            onClick={() => onChangePreviewMode("grid")}
            aria-label="Grid view"
            aria-pressed={previewMode === "grid"}
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              previewMode === "grid"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>Grid</span>
          </button>
          <button
            type="button"
            onClick={() => onChangePreviewMode("list")}
            aria-label="List view"
            aria-pressed={previewMode === "list"}
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              previewMode === "list"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <List className="h-3.5 w-3.5" />
            <span>List</span>
          </button>
          {isSheetLayoutConfigured && (
            <button
              type="button"
              onClick={() => onChangePreviewMode("sheets")}
              aria-label="Live imposed sheets view"
              aria-pressed={previewMode === "sheets"}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md text-blue-700 hover:bg-white transition-colors whitespace-nowrap"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>
                {layoutConfig.customGrid
                  ? `${layoutConfig.customCols}×${layoutConfig.customRows}`
                  : layoutConfig.pagesPerSheet > 1
                    ? `${layoutConfig.pagesPerSheet}-Up`
                    : "Sheets"}
              </span>
            </button>
          )}
        </div>
      </div>
      {renderSyncedEditsStrip()}

      {/* Live Scrollable Canvas */}
      <div className="flex-1 overflow-y-auto desk-surface p-4 lg:p-6">
        {previewMode === "document" ? (
          <div data-testid="live-document-stream" className="max-w-3xl mx-auto space-y-6">
            {pages.map((page, index) => {
              const pageNumber = index + 1;
              const isSelected = selectedIds.has(page.id);
              const isDragTarget = dragOverIndex === index && dragIndex !== index;

              return (
                <article
                  key={page.id}
                  data-testid={`page-card-${pageNumber}`}
                  draggable
                  onClick={() => onChangeActivePageIndex(index)}
                  onDragStart={(e) => {
                    setDragIndex(index);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(index));
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverIndex !== index) setDragOverIndex(index);
                  }}
                  onDragLeave={() => {
                    if (dragOverIndex === index) setDragOverIndex(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null && dragIndex !== index) {
                      onReorderPages(dragIndex, index);
                    }
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  className={`rounded-xl bg-white border shadow-sm overflow-hidden transition-all ${
                    isDragTarget
                      ? "border-blue-500 ring-2 ring-blue-500/30"
                      : isSelected
                        ? "border-blue-600 ring-2 ring-blue-600/20"
                        : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {/* Slim Page Header Chrome */}
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 border-b border-slate-100 bg-slate-50/80">
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => onToggleSelect(page.id)}
                        aria-label={`Select page ${pageNumber}`}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 cursor-pointer"
                      />
                      <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums shrink-0">
                        Page {String(pageNumber).padStart(2, "0")}
                      </span>
                      <span className="text-[11px] text-slate-500 truncate" title={page.sourceName}>
                        {page.kind === "blank"
                          ? page.sourceName
                          : `${page.sourceName} · p.${page.sourcePageIndex + 1}`}
                      </span>
                      {page.invertMode !== "none" && (
                        <span className="text-[11px] font-medium text-blue-700 shrink-0">
                          · Inverted
                        </span>
                      )}
                      {hasActiveCrop(page.crop) && (
                        <span className="text-[11px] font-medium text-emerald-700 shrink-0">
                          · Cropped
                        </span>
                      )}
                    </div>

                    <div
                      className="flex items-center gap-0.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => onMovePage(index, "up")}
                        aria-label={`Move page ${pageNumber} up`}
                        title="Move page up"
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={index === pages.length - 1}
                        onClick={() => onMovePage(index, "down")}
                        aria-label={`Move page ${pageNumber} down`}
                        title="Move page down"
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRotatePage(page.id)}
                        aria-label={`Rotate page ${pageNumber} clockwise`}
                        title="Rotate 90° CW"
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
                      >
                        <RotateCw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleInvertPage(page.id)}
                        aria-label={`Invert colors on page ${pageNumber}`}
                        aria-pressed={page.invertMode !== "none"}
                        title="Toggle color inversion"
                        className={`h-7 w-7 inline-flex items-center justify-center rounded-md ${
                          page.invertMode !== "none"
                            ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                            : "text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
                        }`}
                      >
                        <Contrast className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDuplicatePage(page.id)}
                        aria-label={`Duplicate page ${pageNumber}`}
                        title="Duplicate page"
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onInspectPage(index)}
                        aria-label={`Zoom page ${pageNumber}`}
                        title="Full-screen inspect"
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeletePage(page.id)}
                        aria-label={`Delete page ${pageNumber}`}
                        title="Delete page"
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Full-width Live Rendered PDF Page with live watermark & page number overlays */}
                  <div className="p-3 sm:p-4 bg-slate-100/50 flex justify-center">
                    <button
                      type="button"
                      onClick={() => onInspectPage(index)}
                      aria-label={`Inspect page ${pageNumber}`}
                      className="relative w-full max-w-[660px] flex justify-center focus-visible:outline-2 focus-visible:outline-blue-600 rounded overflow-hidden"
                    >
                      <PageThumbnail
                        page={page}
                        sourcesById={sourcesById}
                        targetWidthPx={780}
                        exactPixelInvert
                        className="w-full rounded shadow-xs border border-slate-200/90"
                        alt={`Live page ${pageNumber} from ${page.sourceName}`}
                      />
                      {layoutConfig.watermarkText.trim() && (
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 flex items-center justify-center"
                        >
                          <span className="text-3xl sm:text-4xl font-bold text-slate-400/25 -rotate-24 select-none">
                            {layoutConfig.watermarkText.trim()}
                          </span>
                        </div>
                      )}
                      {layoutConfig.pageNumbers !== "none" && (
                        <div
                          className={`pointer-events-none absolute bottom-2 inset-x-4 text-[11px] font-mono tabular-nums text-slate-500 ${
                            layoutConfig.pageNumbers === "bottom-center"
                              ? "text-center"
                              : "text-right"
                          }`}
                        >
                          {pageNumber} / {pages.length}
                        </div>
                      )}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : previewMode === "grid" ? (
          <div
            data-testid="page-grid"
            className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-4 max-w-5xl mx-auto"
          >
            {pages.map((page, index) => {
              const pageNumber = index + 1;
              const isSelected = selectedIds.has(page.id);
              const isDragTarget = dragOverIndex === index && dragIndex !== index;

              return (
                <article
                  key={page.id}
                  data-testid={`page-card-${pageNumber}`}
                  draggable
                  onClick={() => onChangeActivePageIndex(index)}
                  onDragStart={(e) => {
                    setDragIndex(index);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(index));
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverIndex !== index) setDragOverIndex(index);
                  }}
                  onDragLeave={() => {
                    if (dragOverIndex === index) setDragOverIndex(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null && dragIndex !== index) {
                      onReorderPages(dragIndex, index);
                    }
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  className={`rounded-xl bg-white border transition-all flex flex-col overflow-hidden ${
                    isDragTarget
                      ? "border-blue-500 ring-2 ring-blue-500/30"
                      : isSelected
                        ? "border-blue-600 ring-2 ring-blue-600/20"
                        : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/70">
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => onToggleSelect(page.id)}
                        aria-label={`Select page ${pageNumber}`}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 cursor-pointer"
                      />
                      <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums shrink-0">
                        {String(pageNumber).padStart(2, "0")}
                      </span>
                      <span className="text-[11px] text-slate-500 truncate" title={page.sourceName}>
                        {page.kind === "blank"
                          ? page.sourceName
                          : `${page.sourceName} · p.${page.sourcePageIndex + 1}`}
                      </span>
                    </div>
                    <GripVertical
                      aria-hidden="true"
                      className="h-4 w-4 text-slate-400 cursor-grab shrink-0"
                    />
                  </div>

                  <div className="p-3 bg-slate-100/70 flex items-center justify-center min-h-[170px]">
                    <button
                      type="button"
                      onClick={() => onInspectPage(index)}
                      aria-label={`Inspect page ${pageNumber}`}
                      className="w-full max-h-[220px] flex items-center justify-center rounded"
                    >
                      <PageThumbnail
                        page={page}
                        sourcesById={sourcesById}
                        targetWidthPx={360}
                        exactPixelInvert
                        className="w-full max-h-[216px] rounded shadow-xs border border-slate-200/80"
                        alt={`Page ${pageNumber} from ${page.sourceName}`}
                      />
                    </button>
                  </div>

                  <div
                    className="px-2 py-1.5 border-t border-slate-100 bg-white flex items-center justify-between gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => onMovePage(index, "up")}
                        aria-label={`Move page ${pageNumber} up`}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={index === pages.length - 1}
                        onClick={() => onMovePage(index, "down")}
                        aria-label={`Move page ${pageNumber} down`}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => onRotatePage(page.id)}
                        aria-label={`Rotate page ${pageNumber} clockwise`}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                      >
                        <RotateCw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleInvertPage(page.id)}
                        aria-label={`Invert colors on page ${pageNumber}`}
                        className={`h-7 w-7 inline-flex items-center justify-center rounded-md ${
                          page.invertMode !== "none"
                            ? "bg-blue-50 text-blue-700"
                            : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        <Contrast className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDuplicatePage(page.id)}
                        aria-label={`Duplicate page ${pageNumber}`}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeletePage(page.id)}
                        aria-label={`Delete page ${pageNumber}`}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}

            {/* Quick-Add Card */}
            <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white/60 hover:bg-white hover:border-slate-400 transition-colors flex flex-col items-center justify-center p-5 min-h-[230px] text-center gap-3">
              <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                <Plus className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold text-slate-800">Add Pages</p>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onInsertBlankPage("blank")}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                >
                  + Blank
                </button>
                <button
                  type="button"
                  onClick={() => onInsertBlankPage("ruled")}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                >
                  + Note
                </button>
                <button
                  type="button"
                  onClick={() => insertPdfInputRef.current?.click()}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800"
                >
                  + PDF
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* List View */
          <div data-testid="page-list" className="max-w-3xl mx-auto space-y-2">
            {pages.map((page, index) => {
              const pageNumber = index + 1;
              const isSelected = selectedIds.has(page.id);
              return (
                <article
                  key={page.id}
                  data-testid={`page-row-${pageNumber}`}
                  draggable
                  onClick={() => onChangeActivePageIndex(index)}
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverIndex(index);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null && dragIndex !== index) {
                      onReorderPages(dragIndex, index);
                    }
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  className={`flex items-center justify-between gap-3 rounded-xl bg-white border px-3.5 py-2.5 transition-colors ${
                    isSelected ? "border-blue-600 ring-1 ring-blue-600/20" : "border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => onToggleSelect(page.id)}
                      aria-label={`Select page ${pageNumber}`}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                    />
                    <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums w-6 shrink-0">
                      {String(pageNumber).padStart(2, "0")}
                    </span>
                    <div className="w-12 shrink-0">
                      <PageThumbnail
                        page={page}
                        sourcesById={sourcesById}
                        targetWidthPx={120}
                        exactPixelInvert
                        className="w-12 max-h-12 rounded border border-slate-200"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-900 truncate">
                        {page.kind === "blank"
                          ? page.sourceName
                          : `${page.sourceName} — p.${page.sourcePageIndex + 1}`}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                        {Math.round(page.widthPt)} × {Math.round(page.heightPt)} pt
                        {page.rotation !== 0 ? ` · ${page.rotation}°` : ""}
                        {page.invertMode !== "none" ? ` · Inv` : ""}
                        {hasActiveCrop(page.crop) ? " · Crop" : ""}
                      </p>
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-1 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => onMovePage(index, "up")}
                      aria-label={`Move page ${pageNumber} up`}
                      className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-35"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={index === pages.length - 1}
                      onClick={() => onMovePage(index, "down")}
                      aria-label={`Move page ${pageNumber} down`}
                      className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-35"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeletePage(page.id)}
                      aria-label={`Delete page ${pageNumber}`}
                      className="h-7 w-7 inline-flex items-center justify-center rounded text-slate-500 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
