import { useState } from "react";
import { Contrast, RotateCcw, Check } from "lucide-react";
import type { InvertMode, PdfPageItem, SourceDocument } from "../types/pdf";
import { PageThumbnail } from "./PageThumbnail";

interface InvertColorViewProps {
  pages: PdfPageItem[];
  sourcesById: ReadonlyMap<string, SourceDocument>;
  selectedIds: ReadonlySet<string>;
  onApplyToAll: (mode: InvertMode) => void;
  onApplyToSelected: (mode: InvertMode) => void;
  onApplyToSingle: (pageId: string, mode: InvertMode) => void;
}

const INVERT_MODES: {
  id: Exclude<InvertMode, "none">;
  name: string;
  summary: string;
}[] = [
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

export function InvertColorView({
  pages,
  sourcesById,
  selectedIds,
  onApplyToAll,
  onApplyToSelected,
  onApplyToSingle,
}: InvertColorViewProps) {
  const [chosenMode, setChosenMode] = useState<Exclude<InvertMode, "none">>("smart-light");
  const [activeIndex, setActiveIndex] = useState(0);

  const safeIndex = Math.min(activeIndex, Math.max(0, pages.length - 1));
  const activePage = pages[safeIndex];
  const invertedCount = pages.filter((p) => p.invertMode !== "none").length;

  return (
    <div className="flex flex-col xl:flex-row h-full overflow-y-auto xl:overflow-hidden">
      {/* Left Control Panel */}
      <section
        aria-label="Color inversion controls"
        className="w-full xl:w-84 shrink-0 bg-white border-b xl:border-b-0 xl:border-r border-slate-200 xl:overflow-y-auto p-5 space-y-6"
      >
        <div>
          <h2 className="text-base font-semibold text-slate-900">Color Inversion Studio</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Convert dark-mode slides to printable white pages. Baked cleanly into your exported PDF.
          </p>
        </div>

        {/* Inversion Mode Radio Cards */}
        <div className="space-y-2" role="radiogroup" aria-label="Color inversion algorithm">
          <span className="block text-xs font-semibold text-slate-800">Inversion algorithm</span>
          {INVERT_MODES.map((m) => {
            const active = chosenMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setChosenMode(m.id)}
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

        {/* Apply Scope Buttons */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <span className="block text-xs font-semibold text-slate-800">Apply to document</span>
          <button
            type="button"
            onClick={() => onApplyToAll(chosenMode)}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <Contrast className="h-4 w-4" />
            <span>Invert All {pages.length} Pages</span>
          </button>

          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={() => onApplyToSelected(chosenMode)}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 transition-colors"
            >
              <span>Invert Selected ({selectedIds.size} pages)</span>
            </button>
          )}

          <button
            type="button"
            disabled={invertedCount === 0}
            onClick={() => onApplyToAll("none")}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset All to Original Colors</span>
          </button>
        </div>

        <div className="pt-2 border-t border-slate-100 text-xs text-slate-600 font-mono tabular-nums">
          Currently inverted: <strong className="text-slate-900">{invertedCount}</strong> / {pages.length} pages
        </div>
      </section>

      {/* Main Comparison & Filmstrip Canvas */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activePage && (
          <div className="bg-white border-b border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-600 font-mono tabular-nums">
              Comparing Page <strong className="text-slate-900">{safeIndex + 1}</strong> of{" "}
              {pages.length} · Status:{" "}
              <strong className={activePage.invertMode !== "none" ? "text-blue-700" : "text-slate-800"}>
                {activePage.invertMode === "none" ? "Original" : `Active (${activePage.invertMode})`}
              </strong>
            </div>
            <div className="flex items-center gap-2">
              {activePage.invertMode === "none" ? (
                <button
                  type="button"
                  onClick={() => onApplyToSingle(activePage.id, chosenMode)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
                >
                  Apply to Page {safeIndex + 1}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onApplyToSingle(activePage.id, "none")}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 transition-colors"
                >
                  Restore Page {safeIndex + 1} Original
                </button>
              )}
            </div>
          </div>
        )}

        {/* Side-by-Side Exact Pixel Comparison */}
        <div className="flex-1 overflow-y-auto desk-surface p-6">
          {activePage && (
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">Original Page</span>
                    <span className="text-slate-500">Source colors</span>
                  </div>
                  <div className="rounded-xl bg-white border border-slate-200 p-3 shadow-xs">
                    <PageThumbnail
                      page={activePage}
                      sourcesById={sourcesById}
                      targetWidthPx={640}
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
                        ? `Applied Output (${activePage.invertMode})`
                        : `Preview (${chosenMode})`}
                    </span>
                    <span className="text-slate-500">Exact pixel transform</span>
                  </div>
                  <div className="rounded-xl bg-white border border-blue-200 p-3 shadow-xs">
                    <PageThumbnail
                      page={activePage}
                      sourcesById={sourcesById}
                      targetWidthPx={640}
                      exactPixelInvert
                      overrideInvertMode={
                        activePage.invertMode !== "none" ? activePage.invertMode : chosenMode
                      }
                      className="w-full rounded"
                      alt={`Inverted page ${safeIndex + 1}`}
                    />
                  </div>
                </div>
              </div>

              {/* Page Selector Filmstrip */}
              <div className="pt-4 border-t border-slate-200">
                <p className="text-xs font-semibold text-slate-700 mb-3">
                  Select a page to inspect or toggle individually
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {pages.map((p, idx) => {
                    const isCurrent = idx === safeIndex;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setActiveIndex(idx)}
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
          )}
        </div>
      </div>
    </div>
  );
}
