import { useEffect, useRef, useState } from "react";
import { Crop, RotateCcw, Check } from "lucide-react";
import type { CropInsets, PdfPageItem, SourceDocument } from "../types/pdf";
import {
  getCroppedDimensions,
  hasActiveCrop,
  normalizeCrop,
  ZERO_CROP,
} from "../utils/cropMath";
import { getEffectiveDimensions } from "../utils/pageOperations";
import { PageThumbnail } from "./PageThumbnail";

interface CropViewProps {
  pages: PdfPageItem[];
  sourcesById: ReadonlyMap<string, SourceDocument>;
  selectedIds: ReadonlySet<string>;
  onApplyToSingle: (pageId: string, crop: CropInsets | undefined) => void;
  onApplyToAll: (crop: CropInsets | undefined) => void;
  onApplyToSelected: (crop: CropInsets | undefined) => void;
}

type DragHandle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se" | "move";

const CROP_PRESETS: { label: string; crop: CropInsets }[] = [
  { label: "Full Page", crop: { top: 0, right: 0, bottom: 0, left: 0 } },
  { label: "Trim Margins (6%)", crop: { top: 0.06, right: 0.06, bottom: 0.06, left: 0.06 } },
  { label: "Trim Header/Footer", crop: { top: 0.11, right: 0.03, bottom: 0.11, left: 0.03 } },
  { label: "Left Half", crop: { top: 0, right: 0.5, bottom: 0, left: 0 } },
  { label: "Right Half", crop: { top: 0, right: 0, bottom: 0, left: 0.5 } },
];

export function CropView({
  pages,
  sourcesById,
  selectedIds,
  onApplyToSingle,
  onApplyToAll,
  onApplyToSelected,
}: CropViewProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const safeIndex = Math.min(activeIndex, Math.max(0, pages.length - 1));
  const activePage = pages[safeIndex];

  const [draftCrop, setDraftCrop] = useState<CropInsets>(() =>
    normalizeCrop(activePage?.crop ?? ZERO_CROP),
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    handle: DragHandle;
    startX: number;
    startY: number;
    startCrop: CropInsets;
    rect: DOMRect;
  } | null>(null);

  // Sync draft crop when switching pages
  useEffect(() => {
    setDraftCrop(normalizeCrop(activePage?.crop ?? ZERO_CROP));
  }, [activePage?.id, activePage?.crop]);

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

      setDraftCrop(normalizeCrop(next));
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
  }, []);

  const startDrag = (handle: DragHandle) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: draftCrop,
      rect,
    };
  };

  if (!activePage) return null;

  const fullDims = getEffectiveDimensions(activePage);
  const croppedDims = getCroppedDimensions({ ...activePage, crop: draftCrop });
  const croppedPageCount = pages.filter((p) => hasActiveCrop(p.crop)).length;

  const updateEdgePct = (edge: keyof CropInsets, pctValue: number) => {
    const frac = Math.max(0, Math.min(80, pctValue)) / 100;
    setDraftCrop((prev) => normalizeCrop({ ...prev, [edge]: frac }));
  };

  return (
    <div className="flex flex-col xl:flex-row h-full overflow-y-auto xl:overflow-hidden">
      {/* Left Crop Controls */}
      <section
        aria-label="Page crop controls"
        className="w-full xl:w-84 shrink-0 bg-white border-b xl:border-b-0 xl:border-r border-slate-200 xl:overflow-y-auto p-5 space-y-5"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Crop Pages</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Drag edges on the preview or dial in exact margins
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDraftCrop({ ...ZERO_CROP })}
            aria-label="Reset crop selection"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>
        </div>

        {/* Presets */}
        <div className="space-y-2">
          <span className="block text-xs font-semibold text-slate-800">Quick presets</span>
          <div className="flex flex-wrap gap-1.5">
            {CROP_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setDraftCrop(normalizeCrop(preset.crop))}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-blue-400 hover:text-blue-700 transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Edge Margin Sliders */}
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
            const pct = Math.round(draftCrop[key] * 100);
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
                  onChange={(e) => updateEdgePct(key, Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>
            );
          })}
        </div>

        {/* Resulting Dimensions */}
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs font-mono tabular-nums text-slate-600 space-y-1">
          <div className="flex justify-between">
            <span>Original</span>
            <span className="text-slate-900">
              {Math.round(fullDims.width)} × {Math.round(fullDims.height)} pt
            </span>
          </div>
          <div className="flex justify-between">
            <span>Cropped</span>
            <span className="font-semibold text-blue-700" data-testid="cropped-dimensions">
              {Math.round(croppedDims.width)} × {Math.round(croppedDims.height)} pt
            </span>
          </div>
        </div>

        {/* Apply Buttons */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() =>
              onApplyToSingle(activePage.id, hasActiveCrop(draftCrop) ? draftCrop : undefined)
            }
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <Check className="h-4 w-4" />
            <span>Apply Crop to Page {safeIndex + 1}</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onApplyToAll(hasActiveCrop(draftCrop) ? draftCrop : undefined)
            }
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
          >
            <Crop className="h-3.5 w-3.5" />
            <span>Apply Crop to All {pages.length} Pages</span>
          </button>

          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={() =>
                onApplyToSelected(hasActiveCrop(draftCrop) ? draftCrop : undefined)
              }
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 transition-colors"
            >
              <span>Apply to Selected ({selectedIds.size} pages)</span>
            </button>
          )}

          {croppedPageCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setDraftCrop({ ...ZERO_CROP });
                onApplyToAll(undefined);
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Clear Crop on All Pages ({croppedPageCount})</span>
            </button>
          )}
        </div>
      </section>

      {/* Visual Crop Stage + Page Filmstrip */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 font-mono tabular-nums">
          <span>
            Cropping Page <strong className="text-slate-900">{safeIndex + 1}</strong> of{" "}
            {pages.length}
            {hasActiveCrop(activePage.crop) ? " · Saved crop active" : " · Uncropped"}
          </span>
          <span className="text-slate-500">
            {croppedPageCount} / {pages.length} pages cropped
          </span>
        </div>

        <div className="flex-1 overflow-y-auto desk-surface p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Interactive Visual Crop Stage */}
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
                  disableCrop
                  className="w-full block"
                  alt={`Page ${safeIndex + 1} crop preview`}
                />

                {/* Darkened excluded margins */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 left-0 right-0 bg-slate-950/50"
                  style={{ height: `${draftCrop.top * 100}%` }}
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-0 left-0 right-0 bg-slate-950/50"
                  style={{ height: `${draftCrop.bottom * 100}%` }}
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 bg-slate-950/50"
                  style={{
                    top: `${draftCrop.top * 100}%`,
                    bottom: `${draftCrop.bottom * 100}%`,
                    width: `${draftCrop.left * 100}%`,
                  }}
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute right-0 bg-slate-950/50"
                  style={{
                    top: `${draftCrop.top * 100}%`,
                    bottom: `${draftCrop.bottom * 100}%`,
                    width: `${draftCrop.right * 100}%`,
                  }}
                />

                {/* Active Draggable Crop Box */}
                <div
                  onPointerDown={startDrag("move")}
                  style={{
                    position: "absolute",
                    top: `${draftCrop.top * 100}%`,
                    right: `${draftCrop.right * 100}%`,
                    bottom: `${draftCrop.bottom * 100}%`,
                    left: `${draftCrop.left * 100}%`,
                  }}
                  className="border-2 border-blue-500 cursor-move"
                >
                  {/* Subtle rule-of-thirds guides */}
                  <div className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-white/40" />
                  <div className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-white/40" />
                  <div className="pointer-events-none absolute inset-y-0 left-1/3 border-l border-white/40" />
                  <div className="pointer-events-none absolute inset-y-0 left-2/3 border-l border-white/40" />

                  {/* Corner Handles */}
                  <button
                    type="button"
                    aria-label="Drag top-left crop corner"
                    onPointerDown={startDrag("nw")}
                    className="absolute -top-2 -left-2 h-4 w-4 rounded-sm bg-blue-600 border-2 border-white shadow cursor-nwse-resize"
                  />
                  <button
                    type="button"
                    aria-label="Drag top-right crop corner"
                    onPointerDown={startDrag("ne")}
                    className="absolute -top-2 -right-2 h-4 w-4 rounded-sm bg-blue-600 border-2 border-white shadow cursor-nesw-resize"
                  />
                  <button
                    type="button"
                    aria-label="Drag bottom-left crop corner"
                    onPointerDown={startDrag("sw")}
                    className="absolute -bottom-2 -left-2 h-4 w-4 rounded-sm bg-blue-600 border-2 border-white shadow cursor-nesw-resize"
                  />
                  <button
                    type="button"
                    aria-label="Drag bottom-right crop corner"
                    onPointerDown={startDrag("se")}
                    className="absolute -bottom-2 -right-2 h-4 w-4 rounded-sm bg-blue-600 border-2 border-white shadow cursor-nwse-resize"
                  />

                  {/* Edge Handles */}
                  <button
                    type="button"
                    aria-label="Drag top crop edge"
                    onPointerDown={startDrag("n")}
                    className="absolute -top-1.5 left-1/2 -translate-x-1/2 h-3 w-8 rounded-full bg-blue-600 border border-white cursor-ns-resize"
                  />
                  <button
                    type="button"
                    aria-label="Drag bottom crop edge"
                    onPointerDown={startDrag("s")}
                    className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-3 w-8 rounded-full bg-blue-600 border border-white cursor-ns-resize"
                  />
                  <button
                    type="button"
                    aria-label="Drag left crop edge"
                    onPointerDown={startDrag("w")}
                    className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-8 rounded-full bg-blue-600 border border-white cursor-ew-resize"
                  />
                  <button
                    type="button"
                    aria-label="Drag right crop edge"
                    onPointerDown={startDrag("e")}
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
                      onClick={() => setActiveIndex(idx)}
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
      </div>
    </div>
  );
}
