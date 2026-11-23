import { useRef, useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  RotateCw,
  Contrast,
  Copy,
  Trash2,
  Maximize2,
  GripVertical,
  LayoutGrid,
  List,
  Plus,
  FilePlus2,
  FileText,
} from "lucide-react";
import type { BlankPageStyle, PdfPageItem, SourceDocument } from "../types/pdf";
import type { MoveDirection } from "../utils/pageOperations";
import { PageThumbnail } from "./PageThumbnail";

interface OrganizeViewProps {
  pages: PdfPageItem[];
  sourcesById: ReadonlyMap<string, SourceDocument>;
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (pageId: string) => void;
  onMovePage: (index: number, direction: MoveDirection) => void;
  onReorderPages: (fromIndex: number, toIndex: number) => void;
  onRotatePage: (pageId: string) => void;
  onToggleInvertPage: (pageId: string) => void;
  onDuplicatePage: (pageId: string) => void;
  onDeletePage: (pageId: string) => void;
  onDeleteSelected: () => void;
  onDeleteByRange: (rangeText: string) => string | null;
  onInsertBlankPage: (style: BlankPageStyle, afterIndex?: number) => void;
  onAddPdfFiles: (files: FileList | File[], insertAtIndex?: number) => void;
  onInspectPage: (index: number) => void;
}

export function OrganizeView({
  pages,
  sourcesById,
  selectedIds,
  onToggleSelect,
  onMovePage,
  onReorderPages,
  onRotatePage,
  onToggleInvertPage,
  onDuplicatePage,
  onDeletePage,
  onDeleteSelected,
  onDeleteByRange,
  onInsertBlankPage,
  onAddPdfFiles,
  onInspectPage,
}: OrganizeViewProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [deleteRangeOpen, setDeleteRangeOpen] = useState(false);
  const [deleteRangeValue, setDeleteRangeValue] = useState("");
  const [deleteRangeError, setDeleteRangeError] = useState<string | null>(null);
  const insertPdfInputRef = useRef<HTMLInputElement>(null);

  const invertedCount = pages.filter((p) => p.invertMode !== "none").length;

  const handleDeleteRangeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = onDeleteByRange(deleteRangeValue);
    setDeleteRangeError(err);
    if (!err) {
      setDeleteRangeValue("");
      setDeleteRangeOpen(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Contextual Sub-Toolbar */}
      <div className="bg-white border-b border-slate-200 px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-900 font-mono tabular-nums">
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
          {invertedCount > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{invertedCount} inverted</span>
            </>
          )}
          <span aria-hidden="true" className="hidden sm:inline">·</span>
          <span className="hidden sm:inline text-slate-500">
            Drag cards or use Up / Down arrows to rearrange
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={insertPdfInputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            aria-label="Insert pages from PDF files"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onAddPdfFiles(e.target.files);
                e.target.value = "";
              }
            }}
          />

          {/* Add Pages Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setAddMenuOpen((v) => !v)}
              aria-expanded={addMenuOpen}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5 text-blue-600" />
              <span>Add Pages</span>
            </button>
            {addMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setAddMenuOpen(false)}
                  aria-hidden="true"
                />
                <div
                  role="menu"
                  className="absolute right-0 mt-1.5 z-20 w-56 rounded-lg border border-slate-200 bg-white shadow-lg py-1"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAddMenuOpen(false);
                      insertPdfInputRef.current?.click();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs text-slate-800 hover:bg-slate-50"
                  >
                    <FilePlus2 className="h-4 w-4 text-blue-600 shrink-0" />
                    <span>Append pages from PDF file...</span>
                  </button>
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAddMenuOpen(false);
                      onInsertBlankPage("blank");
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs text-slate-800 hover:bg-slate-50"
                  >
                    <FileText className="h-4 w-4 text-slate-500 shrink-0" />
                    <span>Insert Blank Page</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAddMenuOpen(false);
                      onInsertBlankPage("ruled");
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs text-slate-800 hover:bg-slate-50"
                  >
                    <FileText className="h-4 w-4 text-slate-500 shrink-0" />
                    <span>Insert Ruled Note Page</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAddMenuOpen(false);
                      onInsertBlankPage("grid");
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs text-slate-800 hover:bg-slate-50"
                  >
                    <FileText className="h-4 w-4 text-slate-500 shrink-0" />
                    <span>Insert Graph Grid Page</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Delete Selected or Delete by Range */}
          {selectedIds.size > 0 ? (
            <button
              type="button"
              onClick={onDeleteSelected}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors whitespace-nowrap"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete Selected ({selectedIds.size})</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDeleteRangeOpen((v) => !v);
                setDeleteRangeError(null);
              }}
              aria-expanded={deleteRangeOpen}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-red-200 hover:text-red-700 hover:bg-red-50/50 transition-colors whitespace-nowrap"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete Pages</span>
            </button>
          )}

          {/* Grid / List Toggle */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
              aria-pressed={viewMode === "grid"}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === "grid"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              aria-label="List view"
              aria-pressed={viewMode === "list"}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === "list"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>List</span>
            </button>
          </div>
        </div>
      </div>

      {/* Inline Delete by Range Bar */}
      {deleteRangeOpen && (
        <form
          onSubmit={handleDeleteRangeSubmit}
          className="bg-red-50/60 border-b border-red-200 px-4 lg:px-6 py-2.5 flex flex-wrap items-center gap-3"
        >
          <label htmlFor="delete-range-input" className="text-xs font-medium text-red-900">
            Delete pages by number or range (1–{pages.length}):
          </label>
          <input
            id="delete-range-input"
            type="text"
            value={deleteRangeValue}
            onChange={(e) => {
              setDeleteRangeValue(e.target.value);
              if (deleteRangeError) setDeleteRangeError(null);
            }}
            placeholder="e.g. 2, 4-5"
            className="w-40 rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:outline-none"
          />
          <button
            type="submit"
            className="px-3 py-1 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            Remove Pages
          </button>
          <button
            type="button"
            onClick={() => {
              setDeleteRangeOpen(false);
              setDeleteRangeError(null);
            }}
            className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            Cancel
          </button>
          {deleteRangeError && (
            <span role="alert" className="text-xs text-red-700 font-medium">
              {deleteRangeError}
            </span>
          )}
        </form>
      )}

      {/* Main Page Sorter Canvas */}
      <div className="flex-1 overflow-y-auto desk-surface p-4 lg:p-6">
        {viewMode === "grid" ? (
          <div
            data-testid="page-grid"
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5 max-w-[1600px] mx-auto"
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
                  className={`group rounded-xl bg-white border transition-all flex flex-col overflow-hidden ${
                    isDragTarget
                      ? "border-blue-500 ring-2 ring-blue-500/30"
                      : isSelected
                        ? "border-blue-600 ring-2 ring-blue-600/20"
                        : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {/* Card Top Bar */}
                  <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/70">
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(page.id)}
                        aria-label={`Select page ${pageNumber}`}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
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

                    <div className="flex items-center gap-1 shrink-0">
                      {page.invertMode !== "none" && (
                        <span className="text-[11px] font-medium text-blue-700 mr-1">
                          Inverted
                        </span>
                      )}
                      <GripVertical
                        aria-hidden="true"
                        className="h-4 w-4 text-slate-400 cursor-grab active:cursor-grabbing"
                      />
                    </div>
                  </div>

                  {/* Page Thumbnail Preview */}
                  <div className="p-3 bg-slate-100/70 flex items-center justify-center min-h-[190px]">
                    <button
                      type="button"
                      onClick={() => onInspectPage(index)}
                      aria-label={`Inspect page ${pageNumber}`}
                      className="w-full max-h-[240px] flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rounded"
                    >
                      <PageThumbnail
                        page={page}
                        sourcesById={sourcesById}
                        targetWidthPx={360}
                        className="w-full max-h-[236px] rounded shadow-xs border border-slate-200/80"
                        alt={`Page ${pageNumber} from ${page.sourceName}`}
                      />
                    </button>
                  </div>

                  {/* Card Action Controls */}
                  <div className="px-2.5 py-2 border-t border-slate-100 bg-white flex items-center justify-between gap-1">
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => onMovePage(index, "up")}
                        aria-label={`Move page ${pageNumber} up`}
                        title="Move page up"
                        className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={index === pages.length - 1}
                        onClick={() => onMovePage(index, "down")}
                        aria-label={`Move page ${pageNumber} down`}
                        title="Move page down"
                        className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => onRotatePage(page.id)}
                        aria-label={`Rotate page ${pageNumber} clockwise`}
                        title="Rotate 90° clockwise"
                        className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                      >
                        <RotateCw className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleInvertPage(page.id)}
                        aria-label={`Invert colors on page ${pageNumber}`}
                        aria-pressed={page.invertMode !== "none"}
                        title="Toggle color inversion"
                        className={`h-8 w-8 inline-flex items-center justify-center rounded-md transition-colors ${
                          page.invertMode !== "none"
                            ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        <Contrast className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDuplicatePage(page.id)}
                        aria-label={`Duplicate page ${pageNumber}`}
                        title="Duplicate page"
                        className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onInsertBlankPage("ruled", index + 1)}
                        aria-label={`Insert note page after page ${pageNumber}`}
                        title="Insert note page after this page"
                        className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onInspectPage(index)}
                        aria-label={`Zoom page ${pageNumber}`}
                        title="Inspect page"
                        className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeletePage(page.id)}
                        aria-label={`Delete page ${pageNumber}`}
                        title="Delete page"
                        className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}

            {/* Inline Quick-Add Page Card */}
            <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white/60 hover:bg-white hover:border-slate-400 transition-colors flex flex-col items-center justify-center p-6 min-h-[260px] text-center gap-3">
              <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                <Plus className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Add Pages</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Insert blank note pages or append another PDF
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => onInsertBlankPage("blank")}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 transition-colors"
                >
                  + Blank Page
                </button>
                <button
                  type="button"
                  onClick={() => onInsertBlankPage("ruled")}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 transition-colors"
                >
                  + Note Page
                </button>
                <button
                  type="button"
                  onClick={() => insertPdfInputRef.current?.click()}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
                >
                  + From PDF
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* High-Density Reorder List View (ideal for rapid Up/Down slide sorting) */
          <div data-testid="page-list" className="max-w-4xl mx-auto space-y-2.5">
            {pages.map((page, index) => {
              const pageNumber = index + 1;
              const isSelected = selectedIds.has(page.id);

              return (
                <article
                  key={page.id}
                  data-testid={`page-row-${pageNumber}`}
                  draggable
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
                  className={`flex items-center justify-between gap-4 rounded-xl bg-white border px-4 py-3 transition-colors ${
                    isSelected ? "border-blue-600 ring-1 ring-blue-600/20" : "border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(page.id)}
                      aria-label={`Select page ${pageNumber}`}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                    />
                    <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums w-7 shrink-0">
                      {String(pageNumber).padStart(2, "0")}
                    </span>
                    <div className="w-16 shrink-0">
                      <PageThumbnail
                        page={page}
                        sourcesById={sourcesById}
                        targetWidthPx={140}
                        className="w-16 max-h-14 rounded border border-slate-200"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {page.kind === "blank"
                          ? page.sourceName
                          : `${page.sourceName} — Original Page ${page.sourcePageIndex + 1}`}
                      </p>
                      <p className="text-xs text-slate-500 font-mono tabular-nums">
                        {Math.round(page.widthPt)} × {Math.round(page.heightPt)} pt
                        {page.rotation !== 0 ? ` · Rotated ${page.rotation}°` : ""}
                        {page.invertMode !== "none" ? ` · Inverted (${page.invertMode})` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => onMovePage(index, "up")}
                      aria-label={`Move page ${pageNumber} up`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-35"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Up</span>
                    </button>
                    <button
                      type="button"
                      disabled={index === pages.length - 1}
                      onClick={() => onMovePage(index, "down")}
                      aria-label={`Move page ${pageNumber} down`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-35"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Down</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRotatePage(page.id)}
                      aria-label={`Rotate page ${pageNumber} clockwise`}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
                    >
                      <RotateCw className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleInvertPage(page.id)}
                      aria-label={`Invert colors on page ${pageNumber}`}
                      className={`h-8 w-8 inline-flex items-center justify-center rounded-lg ${
                        page.invertMode !== "none"
                          ? "bg-blue-50 text-blue-700"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <Contrast className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeletePage(page.id)}
                      aria-label={`Delete page ${pageNumber}`}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
