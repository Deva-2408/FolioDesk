import { useEffect } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Contrast,
  ArrowUp,
  ArrowDown,
  Trash2,
} from "lucide-react";
import type { PdfPageItem, SourceDocument } from "../types/pdf";
import type { MoveDirection } from "../utils/pageOperations";
import { PageThumbnail } from "./PageThumbnail";

interface PageInspectorModalProps {
  pages: PdfPageItem[];
  index: number | null;
  sourcesById: ReadonlyMap<string, SourceDocument>;
  onClose: () => void;
  onChangeIndex: (nextIndex: number) => void;
  onRotatePage: (pageId: string) => void;
  onToggleInvertPage: (pageId: string) => void;
  onMovePage: (index: number, direction: MoveDirection) => void;
  onDeletePage: (pageId: string) => void;
}

export function PageInspectorModal({
  pages,
  index,
  sourcesById,
  onClose,
  onChangeIndex,
  onRotatePage,
  onToggleInvertPage,
  onMovePage,
  onDeletePage,
}: PageInspectorModalProps) {
  const isOpen = index !== null && index >= 0 && index < pages.length;

  useEffect(() => {
    if (!isOpen || index === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && index > 0) onChangeIndex(index - 1);
      else if (e.key === "ArrowRight" && index < pages.length - 1) onChangeIndex(index + 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, index, pages.length, onClose, onChangeIndex]);

  if (!isOpen || index === null) return null;

  const page = pages[index];
  const pageNumber = index + 1;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/85 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={`Inspecting page ${pageNumber}`}
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-4 px-5 py-3 bg-slate-900 text-white border-b border-slate-800">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-sm font-semibold tabular-nums">
            Page {pageNumber} / {pages.length}
          </span>
          <span className="text-xs text-slate-400 truncate">
            {page.kind === "blank"
              ? page.sourceName
              : `${page.sourceName} · Source p.${page.sourcePageIndex + 1}`}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => {
              onMovePage(index, "up");
              onChangeIndex(index - 1);
            }}
            aria-label="Move page earlier"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-35"
          >
            <ArrowUp className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Move Up</span>
          </button>
          <button
            type="button"
            disabled={index === pages.length - 1}
            onClick={() => {
              onMovePage(index, "down");
              onChangeIndex(index + 1);
            }}
            aria-label="Move page later"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-35"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Move Down</span>
          </button>
          <button
            type="button"
            onClick={() => onRotatePage(page.id)}
            aria-label="Rotate page clockwise"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700"
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Rotate</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleInvertPage(page.id)}
            aria-label="Toggle color inversion"
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg ${
              page.invertMode !== "none"
                ? "bg-blue-600 text-white hover:bg-blue-500"
                : "bg-slate-800 hover:bg-slate-700"
            }`}
          >
            <Contrast className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {page.invertMode !== "none" ? "Inverted" : "Invert"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              onDeletePage(page.id);
              if (pages.length <= 1) onClose();
              else if (index >= pages.length - 1) onChangeIndex(index - 1);
            }}
            aria-label="Delete this page"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-800 text-red-300 hover:bg-red-900/60"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Delete</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close page inspector"
            className="ml-2 h-8 w-8 inline-flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Zoom Viewport */}
      <div className="flex-1 flex items-center justify-center gap-4 p-6 overflow-auto">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => onChangeIndex(index - 1)}
          aria-label="Previous page"
          className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-full bg-slate-800/90 text-white hover:bg-slate-700 disabled:opacity-25"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="max-w-4xl max-h-full flex items-center justify-center">
          <PageThumbnail
            page={page}
            sourcesById={sourcesById}
            targetWidthPx={1100}
            exactPixelInvert
            className="max-h-[calc(100vh-8rem)] max-w-full rounded-lg shadow-2xl"
            alt={`Full preview of page ${pageNumber}`}
          />
        </div>

        <button
          type="button"
          disabled={index >= pages.length - 1}
          onClick={() => onChangeIndex(index + 1)}
          aria-label="Next page"
          className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-full bg-slate-800/90 text-white hover:bg-slate-700 disabled:opacity-25"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
