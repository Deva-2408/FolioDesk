import { useEffect, useState } from "react";
import { Download, X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import type { NUpLayoutConfig, PdfPageItem, SourceDocument } from "../types/pdf";
import { computeImpositionPlan } from "../utils/layoutMath";
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
  const [dpiScale, setDpiScale] = useState(2.0);
  const [includeOcrLayer, setIncludeOcrLayer] = useState(embedOcrTextLayer);
  const [isExporting, setIsExporting] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [resultSummary, setResultSummary] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFilename(defaultFilename);
      setIncludeOcrLayer(embedOcrTextLayer);
      setResultSummary(null);
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

  if (!open) return null;

  const targetPages =
    selectedOnly && selectedIds.size > 0
      ? pages.filter((p) => selectedIds.has(p.id))
      : pages;
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

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isExporting || targetPages.length === 0) return;

    setIsExporting(true);
    setErrorMsg(null);
    setResultSummary(null);
    setProgressText("Preparing document...");

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
          renderDpiScale: dpiScale,
        },
        (_cur, _tot, label) => setProgressText(label),
      );

      triggerFileDownload(result.bytes, result.filename, "application/pdf");
      const sizeKb = (result.bytes.byteLength / 1024).toFixed(1);
      setResultSummary(
        `Downloaded ${result.filename} (${result.sheetCount} ${
          result.sheetCount === 1 ? "sheet" : "sheets"
        }, ${sizeKb} KB).`,
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
      <div className="w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
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

        <form onSubmit={handleExport} className="p-5 space-y-5">
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

          {/* Render Quality for Inverted / Encrypted Pages */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="export-dpi-select" className="block text-xs font-semibold text-slate-800 mb-1.5">
                Raster quality (inverted / decrypted)
              </label>
              <select
                id="export-dpi-select"
                value={dpiScale}
                onChange={(e) => setDpiScale(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800"
              >
                <option value={1.5}>Standard (110 DPI · Compact)</option>
                <option value={2.0}>Print Crisp (150 DPI · Recommended)</option>
                <option value={2.75}>High Resolution (200 DPI)</option>
              </select>
            </div>

            <div className="flex items-end pb-1">
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeOcrLayer}
                  onChange={(e) => setIncludeOcrLayer(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>Embed extracted OCR text layer</span>
              </label>
            </div>
          </div>

          {/* Summary Strip */}
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-600 space-y-1 font-mono tabular-nums">
            <div className="flex justify-between">
              <span>Input pages</span>
              <span className="font-semibold text-slate-900">{targetPages.length}</span>
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
            {hasEncryptedSource && (
              <div className="flex justify-between text-emerald-700 pt-1 border-t border-slate-200">
                <span>Password protection</span>
                <span className="font-semibold">Removed (unlocked output)</span>
              </div>
            )}
          </div>

          {resultSummary && (
            <div className="flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs text-emerald-800">
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
