import { useEffect, useMemo, useState } from "react";
import { Download, X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import type {
  ExportCompressionPreset,
  NUpLayoutConfig,
  PdfPageItem,
  SourceDocument,
} from "../types/pdf";
import { computeImpositionPlan } from "../utils/layoutMath";
import {
  COMPRESSION_PRESETS,
  computeSizeSavings,
  formatFileSize,
  shouldRecompressHeavySource,
} from "../utils/pdfCompression";
import { exportEditedPdf, triggerFileDownload } from "../utils/pdfEngine";

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  pages: PdfPageItem[];
  sourcesById: ReadonlyMap<string, SourceDocument>;
  selectedIds: ReadonlySet<string>;
  layout: NUpLayoutConfig;
  embedOcrTextLayer: boolean;
  defaultFilename: string;
}

const PRESET_ORDER: ExportCompressionPreset[] = ["compact", "balanced", "high"];

export function ExportModal({
  open,
  onClose,
  pages,
  sourcesById,
  selectedIds,
  layout,
  embedOcrTextLayer,
  defaultFilename,
}: ExportModalProps) {
  const [filename, setFilename] = useState(defaultFilename);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [compressionPreset, setCompressionPreset] = useState<ExportCompressionPreset>("balanced");
  const [compressHeavyPages, setCompressHeavyPages] = useState(false);
  const [includeOcrLayer, setIncludeOcrLayer] = useState(embedOcrTextLayer);
  const [isExporting, setIsExporting] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [resultSummary, setResultSummary] = useState<string | null>(null);
  const [lastExportBytes, setLastExportBytes] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFilename(defaultFilename);
      setIncludeOcrLayer(embedOcrTextLayer);
      setResultSummary(null);
      setLastExportBytes(null);
      setErrorMsg(null);
      setSelectedOnly(false);
    }
  }, [open, defaultFilename, embedOcrTextLayer]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isExporting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isExporting, onClose]);

  const targetPages = useMemo(
    () =>
      selectedOnly && selectedIds.size > 0
        ? pages.filter((p) => selectedIds.has(p.id))
        : pages,
    [pages, selectedOnly, selectedIds],
  );

  // Estimate proportional bytes contributed by the exported pages' source PDFs
  const sourceReferenceBytes = useMemo(() => {
    let total = 0;
    for (const p of targetPages) {
      if (p.kind !== "pdf") continue;
      const src = sourcesById.get(p.sourceId);
      if (src && src.pageCount > 0) {
        total += src.byteLength / src.pageCount;
      }
    }
    return Math.round(total);
  }, [targetPages, sourcesById]);

  const hasHeavySource = useMemo(
    () =>
      targetPages.some((p) =>
        shouldRecompressHeavySource(sourcesById.get(p.sourceId), true),
      ),
    [targetPages, sourcesById],
  );

  if (!open) return null;

  const activePreset = COMPRESSION_PRESETS[compressionPreset];
  const invertedCount = targetPages.filter((p) => p.invertMode !== "none").length;
  const croppedCount = targetPages.filter(
    (p) =>
      p.crop &&
      (p.crop.top > 0.001 ||
        p.crop.right > 0.001 ||
        p.crop.bottom > 0.001 ||
        p.crop.left > 0.001),
  ).length;
  const hasEncryptedSource = targetPages.some((p) => sourcesById.get(p.sourceId)?.wasEncrypted);
  const plan = computeImpositionPlan(targetPages, layout);
  const useNUp =
    layout.customGrid ||
    layout.pagesPerSheet > 1 ||
    layout.noteLines ||
    layout.orientation !== "auto";
  const outputSheets = useNUp ? plan.sheets.length : targetPages.length;

  const handleSelectPreset = (next: ExportCompressionPreset) => {
    setCompressionPreset(next);
    setCompressHeavyPages(COMPRESSION_PRESETS[next].defaultCompressHeavyPages);
  };

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isExporting || targetPages.length === 0) return;

    setIsExporting(true);
    setErrorMsg(null);
    setResultSummary(null);
    setLastExportBytes(null);
    setProgressText("Optimizing & building PDF...");

    try {
      const result = await exportEditedPdf(
        pages,
        sourcesById,
        {
          filename,
          layout,
          selectedOnly,
          selectedIds: new Set(selectedIds),
          embedOcrTextLayer: includeOcrLayer,
          renderDpiScale: activePreset.dpiScale,
          compressionPreset,
          jpegQuality: activePreset.jpegQuality,
          maxLongEdgePx: activePreset.maxLongEdgePx,
          compressHeavyPages,
        },
        (_cur, _tot, label) => setProgressText(label),
      );

      triggerFileDownload(result.bytes, result.filename, "application/pdf");
      setLastExportBytes(result.bytes.byteLength);
      const formattedSize = formatFileSize(result.bytes.byteLength);
      const savings = computeSizeSavings(sourceReferenceBytes, result.bytes.byteLength);
      const savingsNote =
        savings && savings.deltaPercent >= 5 ? ` · ${savings.label}` : "";
      setResultSummary(
        `Downloaded ${result.filename} (${result.sheetCount} ${
          result.sheetCount === 1 ? "sheet" : "sheets"
        }, ${formattedSize}${savingsNote}).`,
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setIsExporting(false);
      setProgressText("");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <h2 id="export-modal-title" className="text-base font-semibold text-slate-900">
            Export Edited PDF
          </h2>
          <button
            type="button"
            disabled={isExporting}
            onClick={onClose}
            aria-label="Close export dialog"
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleExport} className="p-5 space-y-4 overflow-y-auto">
          {/* Output Filename */}
          <div>
            <label htmlFor="export-filename" className="block text-xs font-semibold text-slate-800 mb-1.5">
              Output filename
            </label>
            <input
              id="export-filename"
              type="text"
              required
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Page Scope */}
          {selectedIds.size > 0 && (
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-slate-800">Pages to include</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedOnly(false)}
                  className={`py-2 px-3 rounded-lg border text-xs font-medium text-left transition-colors ${
                    !selectedOnly
                      ? "border-blue-600 bg-blue-50/40 text-slate-900"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  All pages ({pages.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedOnly(true)}
                  className={`py-2 px-3 rounded-lg border text-xs font-medium text-left transition-colors ${
                    selectedOnly
                      ? "border-blue-600 bg-blue-50/40 text-slate-900"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  Selected only ({selectedIds.size})
                </button>
              </div>
            </div>
          )}

          {/* File Size & Compression Presets */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="block text-xs font-semibold text-slate-800">
                File size &amp; compression
              </span>
              <span className="text-[11px] text-slate-500">
                Vector pages stay lossless · JPEG for rasters
              </span>
            </div>
            <div
              className="grid grid-cols-3 gap-2"
              role="radiogroup"
              aria-label="Export compression level"
            >
              {PRESET_ORDER.map((presetId) => {
                const cfg = COMPRESSION_PRESETS[presetId];
                const selected = compressionPreset === presetId;
                return (
                  <button
                    key={presetId}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => handleSelectPreset(presetId)}
                    className={`p-2.5 rounded-lg border text-left transition-colors ${
                      selected
                        ? "border-blue-600 bg-blue-50/50 text-slate-900"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <div className="text-xs font-semibold leading-tight">{cfg.label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{cfg.badge}</div>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {activePreset.description}
            </p>
          </div>

          {/* Additional Optimization Checkboxes */}
          <div className="space-y-2 pt-1">
            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={compressHeavyPages}
                onChange={(e) => setCompressHeavyPages(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-blue-600"
              />
              <span>
                Shrink heavy scans &amp; image-dense pages
                {hasHeavySource && (
                  <span className="text-blue-600 font-medium"> (recommended for this file)</span>
                )}
              </span>
            </label>

            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeOcrLayer}
                onChange={(e) => setIncludeOcrLayer(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              <span>Embed extracted OCR text layer</span>
            </label>
          </div>

          {/* Summary Strip */}
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-600 space-y-1 font-mono tabular-nums">
            <div className="flex justify-between">
              <span>Input pages</span>
              <span className="font-semibold text-slate-900">
                {targetPages.length}
                {sourceReferenceBytes > 0 ? ` (${formatFileSize(sourceReferenceBytes)} source)` : ""}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Output layout</span>
              <span className="font-semibold text-slate-900">
                {useNUp
                  ? `${plan.perSheet}-up ${layout.direction} (${outputSheets} ${
                      outputSheets === 1 ? "sheet" : "sheets"
                    })`
                  : `Original 1-up (${outputSheets} ${outputSheets === 1 ? "page" : "pages"})`}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Cropped / Inverted</span>
              <span className="font-semibold text-slate-900">
                {croppedCount} cropped · {invertedCount} inverted
              </span>
            </div>
            {lastExportBytes !== null && (
              <div className="flex justify-between text-blue-700 pt-1 border-t border-slate-200">
                <span>Exported file size</span>
                <span className="font-semibold" data-testid="exported-file-size">
                  {formatFileSize(lastExportBytes)}
                </span>
              </div>
            )}
            {hasEncryptedSource && (
              <div className="flex justify-between text-emerald-700 pt-1 border-t border-slate-200">
                <span>Password protection</span>
                <span className="font-semibold">Removed (unlocked output)</span>
              </div>
            )}
          </div>

          {resultSummary && (
            <div
              data-testid="export-result-summary"
              className="flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs text-emerald-800"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{resultSummary}</span>
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-800"
            >
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              disabled={isExporting}
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={isExporting || targetPages.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{progressText || "Exporting..."}</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  <span>Download PDF</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
