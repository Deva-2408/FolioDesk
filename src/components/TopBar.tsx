import { Download, FileText, Redo2, SlidersHorizontal, Undo2 } from "lucide-react";
import type { WorkspaceTab } from "../types/pdf";
import type { WorkspaceLayoutMode } from "../utils/viewportLayout";

export type PagedMobileScreen = "preview" | "editor";

interface TopBarProps {
  layoutMode: WorkspaceLayoutMode;
  mobileScreen: PagedMobileScreen;
  onChangeMobileScreen: (screen: PagedMobileScreen) => void;
  activeTab: WorkspaceTab;
  pageCount: number;
  documentTitle: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenExport: () => void;
}

const TAB_LABELS: Record<WorkspaceTab, string> = {
  organize: "Organize",
  crop: "Crop",
  layout: "Layout",
  invert: "Invert",
  ocr: "OCR",
  ai: "AI Studio",
};

export function TopBar({
  layoutMode,
  mobileScreen,
  onChangeMobileScreen,
  activeTab,
  pageCount,
  documentTitle,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenExport,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
      <div className="h-14 px-4 lg:px-6 flex items-center justify-between gap-4">
        {/* Zone 1: Brand Wordmark + Active Document Context */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-[var(--font-display)] text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            FolioDesk
          </span>
          {pageCount > 0 && (
            <div className="hidden sm:flex items-center gap-2 min-w-0 text-xs text-slate-500 border-l border-slate-200 pl-3">
              <span className="truncate font-medium text-slate-700 max-w-[260px]" title={documentTitle}>
                {documentTitle}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums whitespace-nowrap shrink-0">
                {pageCount} {pageCount === 1 ? "page" : "pages"}
              </span>
            </div>
          )}
        </div>

        {/* Zone 2: Undo/Redo + Primary Export Action */}
        <div className="flex items-center gap-2 shrink-0">
          {pageCount > 0 && (
            <div className="flex items-center gap-1 mr-1">
              <button
                type="button"
                disabled={!canUndo}
                onClick={onUndo}
                aria-label="Undo last edit"
                title="Undo (Ctrl+Z)"
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
              >
                <Undo2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={!canRedo}
                onClick={onRedo}
                aria-label="Redo last edit"
                title="Redo (Ctrl+Shift+Z)"
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
              >
                <Redo2 className="h-4 w-4" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onOpenExport}
            disabled={pageCount === 0}
            className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="h-4 w-4" />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      {/* Mobile & Portrait Tablet Two-Page Switcher */}
      {layoutMode === "paged" && (
        <nav
          aria-label="Switch between Live PDF and Edit Options pages"
          data-testid="mobile-page-switcher"
          className="grid grid-cols-2 border-t border-slate-200 bg-slate-50"
        >
          <button
            type="button"
            onClick={() => onChangeMobileScreen("preview")}
            aria-current={mobileScreen === "preview" ? "page" : undefined}
            className={`h-11 inline-flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              mobileScreen === "preview"
                ? "bg-white text-blue-700 border-blue-600"
                : "text-slate-600 border-transparent hover:text-slate-900 hover:bg-white/60"
            }`}
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span>Live PDF</span>
            {pageCount > 0 && (
              <span className="font-mono text-[11px] tabular-nums opacity-75">
                ({pageCount}p)
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onChangeMobileScreen("editor")}
            aria-current={mobileScreen === "editor" ? "page" : undefined}
            className={`h-11 inline-flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              mobileScreen === "editor"
                ? "bg-white text-blue-700 border-blue-600"
                : "text-slate-600 border-transparent hover:text-slate-900 hover:bg-white/60"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0" />
            <span>Edit Options</span>
            <span className="text-[11px] font-medium opacity-75">
              · {TAB_LABELS[activeTab]}
            </span>
          </button>
        </nav>
      )}
    </header>
  );
}
