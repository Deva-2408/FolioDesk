import { ArrowRight, ArrowDown, Download, RotateCcw } from "lucide-react";
import type {
  LayoutDirection,
  NUpLayoutConfig,
  PageNumberPosition,
  PaperSizeKey,
  PdfPageItem,
  SheetOrientation,
  SourceDocument,
} from "../types/pdf";
import { computeImpositionPlan, DEFAULT_LAYOUT_CONFIG } from "../utils/layoutMath";
import { PageThumbnail } from "./PageThumbnail";

interface LayoutNUpViewProps {
  pages: PdfPageItem[];
  sourcesById: ReadonlyMap<string, SourceDocument>;
  config: NUpLayoutConfig;
  onChange: (next: NUpLayoutConfig) => void;
  onOpenExport: () => void;
}

const PRESET_COUNTS = [1, 2, 3, 4, 5, 6, 8, 9];

export function LayoutNUpView({
  pages,
  sourcesById,
  config,
  onChange,
  onOpenExport,
}: LayoutNUpViewProps) {
  const plan = computeImpositionPlan(pages, config);

  const update = (patch: Partial<NUpLayoutConfig>) => {
    onChange({ ...config, ...patch });
  };

  return (
    <div className="flex flex-col xl:flex-row h-full overflow-y-auto xl:overflow-hidden">
      {/* Configuration Column */}
      <section
        aria-label="Multi-page layout controls"
        className="w-full xl:w-84 shrink-0 bg-white border-b xl:border-b-0 xl:border-r border-slate-200 xl:overflow-y-auto p-5 space-y-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">N-Up Sheet Layout</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Arrange multiple PDF pages on every sheet
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange(DEFAULT_LAYOUT_CONFIG)}
            aria-label="Reset layout to 1 page per sheet"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>
        </div>

        {/* Pages Per Sheet Presets */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-800">Pages per sheet</span>
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={config.customGrid}
                onChange={(e) => update({ customGrid: e.target.checked })}
                className="rounded border-slate-300 text-blue-600"
              />
              <span>Custom grid</span>
            </label>
          </div>

          {!config.customGrid ? (
            <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Pages per sheet">
              {PRESET_COUNTS.map((count) => {
                const active = config.pagesPerSheet === count;
                return (
                  <button
                    key={count}
                    type="button"
                    aria-pressed={active}
                    onClick={() => update({ pagesPerSheet: count, customGrid: false })}
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
                <label htmlFor="custom-cols" className="block text-[11px] font-medium text-slate-600 mb-1">
                  Columns (1–6)
                </label>
                <input
                  id="custom-cols"
                  type="number"
                  min={1}
                  max={6}
                  value={config.customCols}
                  onChange={(e) =>
                    update({ customCols: Math.max(1, Math.min(6, Number(e.target.value) || 1)) })
                  }
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="custom-rows" className="block text-[11px] font-medium text-slate-600 mb-1">
                  Rows (1–8)
                </label>
                <input
                  id="custom-rows"
                  type="number"
                  min={1}
                  max={8}
                  value={config.customRows}
                  onChange={(e) =>
                    update({ customRows: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })
                  }
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono tabular-nums"
                />
              </div>
            </div>
          )}
        </div>

        {/* Direction: Horizontal vs Vertical */}
        <div className="space-y-2">
          <span className="block text-xs font-semibold text-slate-800">Arrangement direction</span>
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: "horizontal", label: "Horizontal", icon: ArrowRight },
                { id: "vertical", label: "Vertical", icon: ArrowDown },
              ] as { id: LayoutDirection; label: string; icon: typeof ArrowRight }[]
            ).map(({ id, label, icon: Icon }) => {
              const active = config.direction === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => update({ direction: id })}
                  className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-colors ${
                    active ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500">
            {config.direction === "horizontal"
              ? `Places slides left-to-right across ${plan.cols} × ${plan.rows} grid.`
              : `Stacks slides top-to-bottom down ${plan.cols} × ${plan.rows} grid.`}
          </p>
        </div>

        {/* Paper Size & Orientation */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="paper-size-select" className="block text-xs font-semibold text-slate-800 mb-1.5">
              Paper size
            </label>
            <select
              id="paper-size-select"
              value={config.paperSize}
              onChange={(e) => update({ paperSize: e.target.value as PaperSizeKey })}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
            >
              <option value="A4">A4 (210 × 297 mm)</option>
              <option value="LETTER">US Letter (8.5 × 11 in)</option>
            </select>
          </div>
          <div>
            <label htmlFor="orientation-select" className="block text-xs font-semibold text-slate-800 mb-1.5">
              Orientation
            </label>
            <select
              id="orientation-select"
              value={config.orientation}
              onChange={(e) => update({ orientation: e.target.value as SheetOrientation })}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
            >
              <option value="auto">Auto-fit</option>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </div>
        </div>

        {/* Margins & Gaps */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <label htmlFor="margin-slider" className="font-medium text-slate-700">
                Outer margin
              </label>
              <span className="font-mono tabular-nums text-slate-500">{config.marginPt} pt</span>
            </div>
            <input
              id="margin-slider"
              type="range"
              min={8}
              max={54}
              step={2}
              value={config.marginPt}
              onChange={(e) => update({ marginPt: Number(e.target.value) })}
              className="w-full accent-blue-600"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <label htmlFor="gap-slider" className="font-medium text-slate-700">
                Spacing between pages
              </label>
              <span className="font-mono tabular-nums text-slate-500">{config.gapPt} pt</span>
            </div>
            <input
              id="gap-slider"
              type="range"
              min={0}
              max={36}
              step={2}
              value={config.gapPt}
              onChange={(e) => update({ gapPt: Number(e.target.value) })}
              className="w-full accent-blue-600"
            />
          </div>
        </div>

        {/* Handout & Stamp Options */}
        <div className="space-y-2.5 pt-2 border-t border-slate-100">
          <span className="block text-xs font-semibold text-slate-800">Handout &amp; print options</span>
          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={config.drawBorders}
              onChange={(e) => update({ drawBorders: e.target.checked })}
              className="rounded border-slate-300 text-blue-600"
            />
            <span>Draw hairline frame around each slide</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={config.noteLines}
              onChange={(e) => update({ noteLines: e.target.checked })}
              className="rounded border-slate-300 text-blue-600"
            />
            <span>Add student note lines beside/below slides</span>
          </label>

          <div className="pt-1">
            <label htmlFor="page-numbers-select" className="block text-[11px] font-medium text-slate-600 mb-1">
              Sheet page numbers
            </label>
            <select
              id="page-numbers-select"
              value={config.pageNumbers}
              onChange={(e) => update({ pageNumbers: e.target.value as PageNumberPosition })}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
            >
              <option value="none">None</option>
              <option value="bottom-center">Bottom center (1 / N)</option>
              <option value="bottom-right">Bottom right (1 / N)</option>
            </select>
          </div>

          <div>
            <label htmlFor="watermark-input" className="block text-[11px] font-medium text-slate-600 mb-1">
              Optional watermark text
            </label>
            <input
              id="watermark-input"
              type="text"
              value={config.watermarkText}
              onChange={(e) => update({ watermarkText: e.target.value })}
              placeholder="e.g. CS 410 Handout or DRAFT"
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400"
            />
          </div>
        </div>
      </section>

      {/* Live Multi-Page Imposed Sheet Preview Canvas */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <div
            data-testid="layout-summary"
            className="flex items-center gap-2 text-xs text-slate-600 font-mono tabular-nums"
          >
            <span className="font-semibold text-slate-900">
              {pages.length} source {pages.length === 1 ? "page" : "pages"} → {plan.sheets.length}{" "}
              output {plan.sheets.length === 1 ? "sheet" : "sheets"}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {plan.cols}×{plan.rows} ({plan.perSheet}-up {config.direction})
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {config.paperSize} {plan.sheetWidth > plan.sheetHeight ? "Landscape" : "Portrait"}
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenExport}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Imposed PDF</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto desk-surface p-6">
          <div className="max-w-4xl mx-auto space-y-8">
            {plan.sheets.map((sheet) => {
              const aspect = `${sheet.sheetWidth} / ${sheet.sheetHeight}`;
              return (
                <div key={sheet.sheetIndex} className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
                    <span>
                      Output Sheet {sheet.sheetIndex + 1} of {plan.sheets.length}
                    </span>
                    <span>
                      Pages {sheet.placements[0].pageIndex + 1}–
                      {sheet.placements[sheet.placements.length - 1].pageIndex + 1}
                    </span>
                  </div>

                  {/* Proportional Paper Sheet Container */}
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
                              config.drawBorders ? "ring-1 ring-slate-300" : ""
                            }`}
                          >
                            <PageThumbnail
                              page={page}
                              sourcesById={sourcesById}
                              targetWidthPx={320}
                              exactPixelInvert
                              className="w-full h-full"
                              alt={`Slide ${placement.pageIndex + 1} on sheet ${sheet.sheetIndex + 1}`}
                            />
                            <span className="absolute bottom-1 right-1 bg-slate-900/75 text-white text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded">
                              {placement.pageIndex + 1}
                            </span>
                          </div>

                          {/* Student Note Lines Preview */}
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
                                length: Math.max(3, Math.min(8, Math.floor(placement.noteArea.height / 18))),
                              }).map((_, lineIdx) => (
                                <div key={lineIdx} className="w-full border-b border-slate-300" />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Watermark Preview */}
                    {config.watermarkText.trim() && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 flex items-center justify-center"
                      >
                        <span className="text-3xl sm:text-4xl font-bold text-slate-400/25 -rotate-24 select-none">
                          {config.watermarkText.trim()}
                        </span>
                      </div>
                    )}

                    {/* Sheet Page Number Preview */}
                    {config.pageNumbers !== "none" && (
                      <div
                        className={`absolute bottom-2 inset-x-6 text-[10px] font-mono tabular-nums text-slate-500 ${
                          config.pageNumbers === "bottom-center" ? "text-center" : "text-right"
                        }`}
                      >
                        {sheet.sheetIndex + 1} / {plan.sheets.length}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
