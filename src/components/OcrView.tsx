import { useRef, useState } from "react";
import {
  ScanText,
  FileSearch,
  Copy,
  Check,
  Download,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  StopCircle,
} from "lucide-react";
import type { PdfPageItem, SourceDocument } from "../types/pdf";
import {
  extractEmbeddedPageText,
  renderPageToDataUrl,
  triggerFileDownload,
} from "../utils/pdfEngine";
import { PageThumbnail } from "./PageThumbnail";

interface OcrViewProps {
  pages: PdfPageItem[];
  sourcesById: ReadonlyMap<string, SourceDocument>;
  embedOcrTextLayer: boolean;
  onToggleEmbedOcr: (embed: boolean) => void;
  onUpdatePageOcr: (pageId: string, text: string, method: "vision" | "embedded") => void;
}

export function OcrView({
  pages,
  sourcesById,
  embedOcrTextLayer,
  onToggleEmbedOcr,
  onUpdatePageOcr,
}: OcrViewProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [ocrMode, setOcrMode] = useState<"vision" | "embedded">("vision");
  const [outputFormat, setOutputFormat] = useState<"markdown" | "plain">("markdown");
  const [languageHint, setLanguageHint] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const cancelRef = useRef(false);

  const safeIndex = Math.min(activeIndex, Math.max(0, pages.length - 1));
  const activePage = pages[safeIndex];
  const pagesWithOcr = pages.filter((p) => (p.ocrText ?? "").trim().length > 0).length;

  async function runOcrForSinglePage(page: PdfPageItem): Promise<string> {
    if (ocrMode === "embedded") {
      const text = await extractEmbeddedPageText(page, sourcesById);
      if (!text) {
        throw new Error(
          "No embedded text layer found on this page (it appears to be a scanned image). Switch to High-Accuracy Vision OCR to extract text.",
        );
      }
      onUpdatePageOcr(page.id, text, "embedded");
      return text;
    }

    // High-Accuracy Vision OCR: render crisp 2x image and send to server /api/ocr
    const dataUrl = await renderPageToDataUrl(page, sourcesById, {
      scale: 2.0,
      applyInvert: true,
    });

    const resp = await fetch("/api/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: dataUrl,
        mimeType: "image/png",
        format: outputFormat,
        languageHint: languageHint.trim(),
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

  const handleExtractCurrent = async () => {
    if (!activePage || isRunning) return;
    setErrorMessage(null);
    setIsRunning(true);
    setProgress({ current: 1, total: 1 });
    try {
      await runOcrForSinglePage(activePage);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "OCR failed.");
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  };

  const handleExtractAll = async () => {
    if (pages.length === 0 || isRunning) return;
    setErrorMessage(null);
    setIsRunning(true);
    cancelRef.current = false;

    try {
      for (let i = 0; i < pages.length; i++) {
        if (cancelRef.current) break;
        setActiveIndex(i);
        setProgress({ current: i + 1, total: pages.length });
        await runOcrForSinglePage(pages[i]);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Batch OCR stopped due to an error.");
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  };

  const handleCopyCurrent = async () => {
    const text = activePage?.ocrText ?? "";
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadAllText = (ext: "txt" | "md") => {
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top OCR Action Toolbar */}
      <div className="bg-white border-b border-slate-200 px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Engine Selector */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setOcrMode("vision");
                setErrorMessage(null);
              }}
              aria-pressed={ocrMode === "vision"}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                ocrMode === "vision"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <ScanText className="h-3.5 w-3.5 text-blue-600" />
              <span>High-Accuracy Vision OCR</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOcrMode("embedded");
                setErrorMessage(null);
              }}
              aria-pressed={ocrMode === "embedded"}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                ocrMode === "embedded"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <FileSearch className="h-3.5 w-3.5 text-slate-600" />
              <span>Fast Embedded Text</span>
            </button>
          </div>

          {ocrMode === "vision" && (
            <>
              <select
                aria-label="OCR output format"
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value as "markdown" | "plain")}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
              >
                <option value="markdown">Structured Markdown &amp; Tables</option>
                <option value="plain">Plain Text</option>
              </select>

              <input
                type="text"
                value={languageHint}
                onChange={(e) => setLanguageHint(e.target.value)}
                aria-label="Optional language hint"
                placeholder="Language hint (auto)"
                className="w-36 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400"
              />
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isRunning ? (
            <button
              type="button"
              onClick={() => {
                cancelRef.current = true;
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700"
            >
              <StopCircle className="h-3.5 w-3.5" />
              <span>
                Stop ({progress?.current ?? 1}/{progress?.total ?? 1})
              </span>
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={!activePage}
                onClick={handleExtractCurrent}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                <ScanText className="h-3.5 w-3.5" />
                <span>OCR Page {safeIndex + 1}</span>
              </button>
              <button
                type="button"
                disabled={pages.length === 0}
                onClick={handleExtractAll}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <span>OCR All {pages.length} Pages</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error Alert Banner */}
      {errorMessage && (
        <div
          role="alert"
          className="bg-red-50 border-b border-red-200 px-5 py-3 flex items-start gap-2.5 text-xs text-red-800"
        >
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">{errorMessage}</div>
        </div>
      )}

      {/* Split Workspace: Page Image on Left, Extracted Text Editor on Right */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden">
        {/* Left Pane: Active Page Preview */}
        <div className="flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200 overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safeIndex === 0}
                onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                aria-label="Previous page"
                className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-35"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-mono font-semibold text-slate-800 tabular-nums">
                Page {safeIndex + 1} / {pages.length}
              </span>
              <button
                type="button"
                disabled={safeIndex >= pages.length - 1}
                onClick={() => setActiveIndex((i) => Math.min(pages.length - 1, i + 1))}
                aria-label="Next page"
                className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-35"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {pagesWithOcr} / {pages.length} extracted
            </span>
          </div>

          <div className="flex-1 overflow-y-auto desk-surface p-5 flex items-start justify-center">
            {activePage && (
              <div className="w-full max-w-lg rounded-xl bg-white p-3 border border-slate-200 shadow-xs">
                <PageThumbnail
                  page={activePage}
                  sourcesById={sourcesById}
                  targetWidthPx={760}
                  className="w-full rounded"
                  alt={`Page ${safeIndex + 1} source preview for OCR`}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Pane: Extracted Text Editor & Export Controls */}
        <div className="flex flex-col bg-white overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span className="font-semibold text-slate-900">Extracted Text</span>
              {activePage?.ocrMethod && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-500">
                    {activePage.ocrMethod === "vision" ? "Vision OCR" : "Embedded layer"}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={!activePage?.ocrText}
                onClick={handleCopyCurrent}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
              <button
                type="button"
                disabled={pagesWithOcr === 0}
                onClick={() => handleDownloadAllText("txt")}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
                <span>.txt</span>
              </button>
              <button
                type="button"
                disabled={pagesWithOcr === 0}
                onClick={() => handleDownloadAllText("md")}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
                <span>.md</span>
              </button>
            </div>
          </div>

          <div className="relative flex-1 flex flex-col p-4 overflow-hidden">
            {isRunning && (
              <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 text-slate-700">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                <p className="text-xs font-semibold">
                  Running {ocrMode === "vision" ? "High-Accuracy Vision OCR" : "Embedded Text Extraction"} (
                  {progress?.current ?? 1} / {progress?.total ?? 1})...
                </p>
              </div>
            )}

            <label htmlFor="ocr-text-editor" className="sr-only">
              Extracted text for page {safeIndex + 1}
            </label>
            <textarea
              id="ocr-text-editor"
              data-testid="ocr-textarea"
              value={activePage?.ocrText ?? ""}
              onChange={(e) => {
                if (activePage) {
                  onUpdatePageOcr(activePage.id, e.target.value, activePage.ocrMethod ?? ocrMode);
                }
              }}
              placeholder={
                ocrMode === "vision"
                  ? `Click "OCR Page ${safeIndex + 1}" to transcribe scanned text, tables, and formulas from this page with high accuracy.`
                  : `Click "OCR Page ${safeIndex + 1}" to pull embedded digital text directly from this page.`
              }
              className="flex-1 w-full resize-none rounded-lg border border-slate-200 bg-slate-50/50 p-4 text-sm font-mono leading-relaxed text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:outline-none"
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={embedOcrTextLayer}
                  onChange={(e) => onToggleEmbedOcr(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>Embed OCR text as invisible searchable layer on PDF export</span>
              </label>

              <span className="font-mono tabular-nums">
                {(activePage?.ocrText ?? "").trim()
                  ? `${(activePage?.ocrText ?? "").trim().split(/\s+/).length} words`
                  : "0 words"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
