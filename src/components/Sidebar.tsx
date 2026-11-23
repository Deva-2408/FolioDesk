import { useRef, useState } from "react";
import {
  FilePlus2,
  Undo2,
  Redo2,
  ArrowUpDown,
  RotateCw,
  Contrast,
  Trash2,
  FilePlus,
  X,
  CheckSquare,
  Square,
  Lock,
  Unlock,
  Loader2,
} from "lucide-react";
import type { BlankPageStyle, SourceDocument } from "../types/pdf";
import type { SampleDeckId } from "../utils/samplePdfs";

interface SidebarProps {
  sources: SourceDocument[];
  totalPages: number;
  selectedCount: number;
  canUndo: boolean;
  canRedo: boolean;
  isLoading: boolean;
  removingPasswordId: string | null;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onAddFiles: (files: FileList | File[]) => void;
  onLoadSample: (deckId: SampleDeckId) => void;
  onRemoveSource: (sourceId: string) => void;
  onRemovePassword: (sourceId: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onSelectByRange: (rangeText: string) => string | null;
  onReverseOrder: () => void;
  onInsertBlankPage: (style: BlankPageStyle) => void;
  onRotateSelected: () => void;
  onInvertSelected: () => void;
  onDeleteSelected: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function Sidebar({
  sources,
  totalPages,
  selectedCount,
  canUndo,
  canRedo,
  isLoading,
  removingPasswordId,
  mobileOpen,
  onCloseMobile,
  onAddFiles,
  onLoadSample,
  onRemoveSource,
  onRemovePassword,
  onUndo,
  onRedo,
  onSelectAll,
  onClearSelection,
  onSelectByRange,
  onReverseOrder,
  onInsertBlankPage,
  onRotateSelected,
  onInvertSelected,
  onDeleteSelected,
}: SidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rangeInput, setRangeInput] = useState("");
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [blankStyle, setBlankStyle] = useState<BlankPageStyle>("ruled");

  const handleRangeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = onSelectByRange(rangeInput);
    setRangeError(err);
    if (!err) setRangeInput("");
  };

  const content = (
    <aside
      aria-label="Document sources and page actions"
      className="flex h-full w-68 flex-col bg-white border-r border-slate-200 overflow-y-auto"
    >
      {/* Mobile Header */}
      <div className="flex lg:hidden items-center justify-between px-4 py-3 border-b border-slate-200">
        <span className="font-[var(--font-display)] text-sm font-semibold text-slate-900">
          Workspace Tools
        </span>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close sidebar"
          className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Section 1: Merge & Source PDFs */}
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-slate-900 tracking-wide">
            Source PDFs
          </h2>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {sources.length} {sources.length === 1 ? "file" : "files"} · {totalPages}p
          </span>
        </div>

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
          <ul className="mt-3 space-y-2.5" aria-label="Loaded PDF files">
            {sources.map((src) => {
              const isRemovingPw = removingPasswordId === src.id;
              return (
                <li
                  key={src.id}
                  className="py-1.5 border-t border-slate-100 first:border-t-0 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-800 truncate flex items-center gap-1" title={src.name}>
                        {src.wasEncrypted && (
                          <Lock className="h-3 w-3 text-amber-600 shrink-0" aria-label="Password protected" />
                        )}
                        <span className="truncate">{src.name}</span>
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                        {src.pageCount} {src.pageCount === 1 ? "page" : "pages"} · {formatBytes(src.byteLength)}
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

        {/* Quick Merge Sample PDFs */}
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-[11px] font-medium text-slate-500 mb-1.5">
            {sources.length === 0 ? "Quick sample decks" : "Merge sample deck"}
          </p>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => onLoadSample("dark-lecture")}
              className="text-left px-2 py-1.5 rounded-md text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              + Dark-Mode Lecture Slides (6p)
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => onLoadSample("research-handout")}
              className="text-left px-2 py-1.5 rounded-md text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              + Research Formula Sheet (3p)
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => onLoadSample("scanned-worksheet")}
              className="text-left px-2 py-1.5 rounded-md text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              + Scanned Lab Worksheet (2p)
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => onLoadSample("encrypted-exam")}
              className="text-left px-2 py-1.5 rounded-md text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors flex items-center gap-1.5"
            >
              <Lock className="h-3 w-3 text-amber-600 shrink-0" />
              <span>Locked Exam Solutions (2p)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Section 2: History & Selection */}
      <div className="p-4 border-b border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-900 tracking-wide">
            History &amp; Selection
          </h2>
          {selectedCount > 0 && (
            <span className="text-xs font-mono tabular-nums text-blue-600 font-medium">
              {selectedCount} selected
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Undo2 className="h-3.5 w-3.5" />
            <span>Undo</span>
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Redo2 className="h-3.5 w-3.5" />
            <span>Redo</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={totalPages === 0}
            onClick={onSelectAll}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            <span>Select All</span>
          </button>
          <button
            type="button"
            disabled={selectedCount === 0}
            onClick={onClearSelection}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
          >
            <Square className="h-3.5 w-3.5" />
            <span>Clear</span>
          </button>
        </div>

        <form onSubmit={handleRangeSubmit} className="space-y-1.5">
          <label htmlFor="page-range-select" className="block text-[11px] font-medium text-slate-600">
            Select page range (e.g. 1, 3-5)
          </label>
          <div className="flex gap-1.5">
            <input
              id="page-range-select"
              type="text"
              value={rangeInput}
              disabled={totalPages === 0}
              onChange={(e) => {
                setRangeInput(e.target.value);
                if (rangeError) setRangeError(null);
              }}
              placeholder="1, 3-5"
              className="w-full min-w-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none disabled:bg-slate-50"
            />
            <button
              type="submit"
              disabled={totalPages === 0}
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
      </div>

      {/* Section 3: Batch Page Actions */}
      <div className="p-4 space-y-3">
        <h2 className="text-xs font-semibold text-slate-900 tracking-wide">
          Page Operations
        </h2>

        <div className="space-y-1.5">
          <button
            type="button"
            disabled={totalPages < 2}
            onClick={onReverseOrder}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
          >
            <ArrowUpDown className="h-3.5 w-3.5 text-slate-500" />
            <span>Reverse All Page Order</span>
          </button>

          <button
            type="button"
            disabled={totalPages === 0}
            onClick={onRotateSelected}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
          >
            <RotateCw className="h-3.5 w-3.5 text-slate-500" />
            <span>
              Rotate {selectedCount > 0 ? `Selected (${selectedCount})` : "All"} 90° CW
            </span>
          </button>

          <button
            type="button"
            disabled={totalPages === 0}
            onClick={onInvertSelected}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
          >
            <Contrast className="h-3.5 w-3.5 text-slate-500" />
            <span>
              Toggle Invert {selectedCount > 0 ? `(${selectedCount})` : "(All)"}
            </span>
          </button>

          {selectedCount > 0 && (
            <button
              type="button"
              onClick={onDeleteSelected}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-red-200 text-red-700 bg-red-50/50 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete Selected ({selectedCount})</span>
            </button>
          )}
        </div>

        {/* Insert Student Note Page */}
        <div className="pt-3 border-t border-slate-100 space-y-2">
          <label htmlFor="blank-style-select" className="block text-[11px] font-medium text-slate-600">
            Insert Note Page
          </label>
          <div className="flex gap-1.5">
            <select
              id="blank-style-select"
              value={blankStyle}
              onChange={(e) => setBlankStyle(e.target.value as BlankPageStyle)}
              className="flex-1 min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
            >
              <option value="ruled">Ruled Lines</option>
              <option value="grid">Graph Grid</option>
              <option value="blank">Plain Blank</option>
            </select>
            <button
              type="button"
              disabled={totalPages === 0}
              onClick={() => onInsertBlankPage(blankStyle)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-40 shrink-0"
            >
              <FilePlus className="h-3.5 w-3.5" />
              <span>Add</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop persistent sidebar */}
      <div className="hidden lg:block shrink-0 h-[calc(100vh-3.5rem)] sticky top-14">
        {content}
      </div>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  );
}
