import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Undo2, X } from "lucide-react";
import type {
  BlankPageStyle,
  CropInsets,
  EditScope,
  InvertMode,
  NUpLayoutConfig,
  PdfPageItem,
  SourceDocument,
} from "./types/pdf";
import {
  deletePages,
  duplicatePage,
  insertBlankPageAt,
  movePage,
  parsePageRange,
  reorderPages,
  reversePages,
  rotatePages,
  setInvertModeForPages,
  togglePageInvert,
  type MoveDirection,
} from "./utils/pageOperations";
import { setCropForPages } from "./utils/cropMath";
import {
  createUnlockedPdfBytes,
  loadPdfFromBytes,
  PdfPasswordRequiredError,
  releaseSourceProxy,
  triggerFileDownload,
} from "./utils/pdfEngine";
import {
  ENCRYPTED_SAMPLE_PASSWORD,
  generateSamplePdf,
  type SampleDeckId,
} from "./utils/samplePdfs";
import { useWorkspaceLayoutMode } from "./utils/viewportLayout";
import { WorkspaceProvider, useWorkspaceStore } from "./store/WorkspaceContext";
import { summarizeActiveEdits } from "./store/workspaceReducer";
import { clearThumbnailCacheForSource } from "./components/PageThumbnail";
import { TopBar, type PagedMobileScreen } from "./components/TopBar";
import { LivePdfPane } from "./components/LivePdfPane";
import { EditingOptionsPane } from "./components/EditingOptionsPane";
import { ExportModal } from "./components/ExportModal";
import { PageInspectorModal } from "./components/PageInspectorModal";
import { PasswordModal } from "./components/PasswordModal";

interface ToastNotice {
  id: number;
  kind: "info" | "error";
  message: string;
  showUndo?: boolean;
}

interface PendingLockedPdf {
  name: string;
  bytes: Uint8Array;
  insertAtIndex?: number;
  hintText?: string;
}

function makeUid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function resolveScopeIds(
  scope: EditScope,
  pages: PdfPageItem[],
  activePageId: string | undefined,
  selectedIds: ReadonlySet<string>,
): Set<string> {
  if (scope === "selected" && selectedIds.size > 0) {
    return new Set(selectedIds);
  }
  if (scope === "current" && activePageId) {
    return new Set([activePageId]);
  }
  return new Set(pages.map((p) => p.id));
}

function WorkspaceShell() {
  const { state, dispatch } = useWorkspaceStore();
  const layoutMode = useWorkspaceLayoutMode();
  const [mobileScreen, setMobileScreen] = useState<PagedMobileScreen>("preview");

  // Transient UI-only modals and loading indicators
  const [isLoading, setIsLoading] = useState(false);
  const [removingPasswordId, setRemovingPasswordId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [inspectIndex, setInspectIndex] = useState<number | null>(null);
  const [notice, setNotice] = useState<ToastNotice | null>(null);

  const [lockedQueue, setLockedQueue] = useState<PendingLockedPdf[]>([]);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const activeLocked = lockedQueue[0] ?? null;
  const { sources, pages, layout, activeTab, activePageIndex, previewMode, past, future } = state;

  const selectedIds = useMemo(() => new Set(state.selectedIds), [state.selectedIds]);

  const sourcesById = useMemo(() => {
    const map = new Map<string, SourceDocument>();
    for (const s of sources) map.set(s.id, s);
    return map;
  }, [sources]);

  const activeEdits = useMemo(() => summarizeActiveEdits(state), [state]);
  const safeActiveIndex = Math.min(activePageIndex, Math.max(0, pages.length - 1));
  const activePage = pages[safeActiveIndex];

  const showNotice = useCallback(
    (message: string, kind: "info" | "error" = "info", showUndo = false) => {
      setNotice({ id: Date.now(), kind, message, showUndo });
    },
    [],
  );

  useEffect(() => {
    if (!notice || notice.kind === "error") return;
    const timer = window.setTimeout(() => {
      setNotice((cur) => (cur?.id === notice.id ? null : cur));
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const handleUndo = useCallback(() => dispatch({ type: "UNDO" }), [dispatch]);
  const handleRedo = useCallback(() => dispatch({ type: "REDO" }), [dispatch]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleUndo, handleRedo]);

  const handleAddFiles = useCallback(
    async (fileList: FileList | File[], insertAtIndex?: number) => {
      const files = Array.from(fileList).filter(
        (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
      );
      if (files.length === 0) {
        showNotice("Please select one or more valid .pdf files.", "error");
        return;
      }

      setIsLoading(true);
      let loadedCount = 0;
      let totalAddedPages = 0;
      const newlyLocked: PendingLockedPdf[] = [];

      try {
        for (const file of files) {
          const rawBytes = new Uint8Array(await file.arrayBuffer());
          try {
            const loaded = await loadPdfFromBytes(file.name, rawBytes);
            dispatch({
              type: "APPEND_SOURCE",
              source: loaded.source,
              pages: loaded.pages,
              insertAtIndex,
            });
            loadedCount++;
            totalAddedPages += loaded.pages.length;
          } catch (err) {
            if (err instanceof PdfPasswordRequiredError) {
              newlyLocked.push({ name: file.name, bytes: rawBytes, insertAtIndex });
            } else {
              throw err;
            }
          }
        }

        if (newlyLocked.length > 0) {
          setPasswordError(null);
          setLockedQueue((prev) => [...prev, ...newlyLocked]);
        }

        if (loadedCount > 0) {
          showNotice(
            loadedCount === 1
              ? `Added PDF (${totalAddedPages} ${totalAddedPages === 1 ? "page" : "pages"}).`
              : `Merged ${loadedCount} PDF files (${totalAddedPages} pages added).`,
          );
        }
      } catch (err) {
        showNotice(
          err instanceof Error ? `Could not load PDF: ${err.message}` : "Failed to parse PDF file.",
          "error",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [dispatch, showNotice],
  );

  const handleLoadSample = useCallback(
    async (deckId: SampleDeckId) => {
      setIsLoading(true);
      try {
        const sample = await generateSamplePdf(deckId);
        try {
          const loaded = await loadPdfFromBytes(sample.name, sample.bytes);
          dispatch({
            type: "APPEND_SOURCE",
            source: loaded.source,
            pages: loaded.pages,
          });
          showNotice(`Loaded "${sample.name}" (${loaded.pages.length} pages).`);
        } catch (err) {
          if (err instanceof PdfPasswordRequiredError) {
            setPasswordError(null);
            setLockedQueue((prev) => [
              ...prev,
              {
                name: sample.name,
                bytes: sample.bytes,
                hintText:
                  deckId === "encrypted-exam"
                    ? `Sample document password: ${ENCRYPTED_SAMPLE_PASSWORD}`
                    : undefined,
              },
            ]);
          } else {
            throw err;
          }
        }
      } catch (err) {
        showNotice(
          err instanceof Error ? err.message : "Failed to generate sample PDF.",
          "error",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [dispatch, showNotice],
  );

  const handleUnlockSubmit = useCallback(
    async (password: string) => {
      if (!activeLocked || isUnlocking) return;
      setIsUnlocking(true);
      setPasswordError(null);
      try {
        const loaded = await loadPdfFromBytes(activeLocked.name, activeLocked.bytes, password);
        dispatch({
          type: "APPEND_SOURCE",
          source: loaded.source,
          pages: loaded.pages,
          insertAtIndex: activeLocked.insertAtIndex,
        });
        setLockedQueue((prev) => prev.slice(1));
        showNotice(
          `Unlocked "${activeLocked.name}" (${loaded.pages.length} ${
            loaded.pages.length === 1 ? "page" : "pages"
          }).`,
        );
      } catch (err) {
        if (err instanceof PdfPasswordRequiredError) {
          setPasswordError(err.message);
        } else {
          setPasswordError(
            err instanceof Error ? err.message : "Unable to unlock this PDF file.",
          );
        }
      } finally {
        setIsUnlocking(false);
      }
    },
    [activeLocked, dispatch, isUnlocking, showNotice],
  );

  const handleUnlockCancel = useCallback(() => {
    setLockedQueue((prev) => prev.slice(1));
    setPasswordError(null);
  }, []);

  const handleRemovePassword = useCallback(
    async (sourceId: string) => {
      const target = sources.find((s) => s.id === sourceId);
      if (!target || removingPasswordId) return;
      setRemovingPasswordId(sourceId);
      try {
        const unlockedBytes = await createUnlockedPdfBytes(target);
        const unlockedName = target.name.replace(/\.pdf$/i, "") + "-unlocked.pdf";
        triggerFileDownload(unlockedBytes, unlockedName, "application/pdf");

        releaseSourceProxy(sourceId);
        clearThumbnailCacheForSource(sourceId);
        dispatch({
          type: "REPLACE_SOURCE_UNLOCKED",
          sourceId,
          unlockedName,
          unlockedBytes,
        });
        showNotice(`Password removed and saved as "${unlockedName}".`);
      } catch (err) {
        showNotice(
          err instanceof Error
            ? `Could not remove password: ${err.message}`
            : "Password removal failed.",
          "error",
        );
      } finally {
        setRemovingPasswordId(null);
      }
    },
    [dispatch, removingPasswordId, showNotice, sources],
  );

  const handleRemoveSource = useCallback(
    (sourceId: string) => {
      const removedSource = sources.find((s) => s.id === sourceId);
      dispatch({ type: "REMOVE_SOURCE", sourceId });
      releaseSourceProxy(sourceId);
      clearThumbnailCacheForSource(sourceId);
      if (removedSource) {
        showNotice(`Removed "${removedSource.name}" from workspace.`);
      }
    },
    [dispatch, showNotice, sources],
  );

  const handleSelectByRange = useCallback(
    (rangeText: string): string | null => {
      const parsed = parsePageRange(rangeText, pages.length);
      if (parsed.error) return parsed.error;
      const ids = parsed.indices.map((idx) => pages[idx].id);
      dispatch({ type: "SET_SELECTED_IDS", ids });
      showNotice(`Selected ${ids.length} ${ids.length === 1 ? "page" : "pages"}.`);
      return null;
    },
    [dispatch, pages, showNotice],
  );

  const handleMovePage = useCallback(
    (index: number, direction: MoveDirection) => {
      dispatch({
        type: "COMMIT_PAGES",
        updater: (prev) => movePage(prev, index, direction),
      });
    },
    [dispatch],
  );

  const handleReorderPages = useCallback(
    (fromIndex: number, toIndex: number) => {
      dispatch({
        type: "COMMIT_PAGES",
        updater: (prev) => reorderPages(prev, fromIndex, toIndex),
      });
    },
    [dispatch],
  );

  const handleReverseOrder = useCallback(() => {
    dispatch({ type: "COMMIT_PAGES", updater: (prev) => reversePages(prev) });
    showNotice("Reversed all page order.", "info", true);
  }, [dispatch, showNotice]);

  const handleRotatePage = useCallback(
    (pageId: string) => {
      dispatch({
        type: "COMMIT_PAGES",
        updater: (prev) => rotatePages(prev, new Set([pageId]), 90),
      });
    },
    [dispatch],
  );

  const handleRotateSelected = useCallback(() => {
    const target = selectedIds.size > 0 ? selectedIds : new Set(pages.map((p) => p.id));
    dispatch({
      type: "COMMIT_PAGES",
      updater: (prev) => rotatePages(prev, target, 90),
    });
    showNotice(
      `Rotated ${target.size} ${target.size === 1 ? "page" : "pages"} 90° clockwise.`,
      "info",
      true,
    );
  }, [dispatch, pages, selectedIds, showNotice]);

  const handleToggleInvertPage = useCallback(
    (pageId: string) => {
      dispatch({
        type: "COMMIT_PAGES",
        updater: (prev) => togglePageInvert(prev, pageId, state.invertSettings.preferredMode),
      });
    },
    [dispatch, state.invertSettings.preferredMode],
  );

  const handleInvertSelected = useCallback(() => {
    const target = selectedIds.size > 0 ? selectedIds : new Set(pages.map((p) => p.id));
    dispatch({
      type: "COMMIT_PAGES",
      updater: (prev) => {
        const anyNotInverted = prev.some((p) => target.has(p.id) && p.invertMode === "none");
        const nextMode: InvertMode = anyNotInverted ? state.invertSettings.preferredMode : "none";
        return setInvertModeForPages(prev, target, nextMode);
      },
    });
  }, [dispatch, pages, selectedIds, state.invertSettings.preferredMode]);

  const handleApplyLiveInvert = useCallback(
    (mode: InvertMode) => {
      const targetIds = resolveScopeIds(
        state.invertSettings.scope,
        pages,
        activePage?.id,
        selectedIds,
      );
      if (mode !== "none") {
        dispatch({ type: "SET_INVERT_SETTINGS", patch: { preferredMode: mode } });
      }
      dispatch({
        type: "COMMIT_PAGES",
        updater: (prev) => setInvertModeForPages(prev, targetIds, mode),
      });
    },
    [activePage?.id, dispatch, pages, selectedIds, state.invertSettings.scope],
  );

  const handleResetAllInvert = useCallback(() => {
    const allIds = new Set(pages.map((p) => p.id));
    dispatch({
      type: "COMMIT_PAGES",
      updater: (prev) => setInvertModeForPages(prev, allIds, "none"),
    });
    showNotice("Restored original colors on all pages.", "info", true);
  }, [dispatch, pages, showNotice]);

  const handleApplyInvertSingle = useCallback(
    (pageId: string, mode: InvertMode) => {
      dispatch({
        type: "COMMIT_PAGES",
        updater: (prev) => setInvertModeForPages(prev, new Set([pageId]), mode),
      });
    },
    [dispatch],
  );

  const handleLiveCropChange = useCallback(
    (crop: CropInsets | undefined, recordHistory: boolean) => {
      const targetIds = resolveScopeIds(
        state.cropSettings.scope,
        pages,
        activePage?.id,
        selectedIds,
      );
      dispatch({
        type: "APPLY_LIVE_CROP",
        crop,
        targetIds,
        recordHistory,
      });
    },
    [activePage?.id, dispatch, pages, selectedIds, state.cropSettings.scope],
  );

  const handleApplyCropAll = useCallback(
    (crop: CropInsets | undefined) => {
      const allIds = new Set(pages.map((p) => p.id));
      dispatch({
        type: "COMMIT_PAGES",
        updater: (prev) => setCropForPages(prev, allIds, crop),
      });
      showNotice(
        crop ? `Synced crop across all ${pages.length} pages.` : "Cleared crop on all pages.",
        "info",
        true,
      );
    },
    [dispatch, pages, showNotice],
  );

  const handleChangeLayoutConfig = useCallback(
    (nextLayout: NUpLayoutConfig, recordHistory = true) => {
      dispatch({ type: "SET_LAYOUT", layout: nextLayout, recordHistory });
    },
    [dispatch],
  );

  const handleDuplicatePage = useCallback(
    (pageId: string) => {
      dispatch({
        type: "COMMIT_PAGES",
        updater: (prev) => duplicatePage(prev, pageId, makeUid("pg")),
      });
      showNotice("Duplicated page.", "info", true);
    },
    [dispatch, showNotice],
  );

  const handleDeletePage = useCallback(
    (pageId: string) => {
      dispatch({
        type: "COMMIT_PAGES",
        updater: (prev) => deletePages(prev, new Set([pageId])),
      });
      showNotice("Deleted 1 page.", "info", true);
    },
    [dispatch, showNotice],
  );

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    dispatch({
      type: "COMMIT_PAGES",
      updater: (prev) => deletePages(prev, selectedIds),
      clearSelection: true,
    });
    showNotice(`Deleted ${count} ${count === 1 ? "page" : "pages"}.`, "info", true);
  }, [dispatch, selectedIds, showNotice]);

  const handleDeleteByRange = useCallback(
    (rangeText: string): string | null => {
      const parsed = parsePageRange(rangeText, pages.length);
      if (parsed.error) return parsed.error;
      const toDelete = new Set(parsed.indices.map((i) => pages[i].id));
      dispatch({
        type: "COMMIT_PAGES",
        updater: (prev) => deletePages(prev, toDelete),
      });
      showNotice(
        `Deleted ${toDelete.size} ${toDelete.size === 1 ? "page" : "pages"}.`,
        "info",
        true,
      );
      return null;
    },
    [dispatch, pages, showNotice],
  );

  const handleInsertBlankPage = useCallback(
    (style: BlankPageStyle, explicitIndex?: number) => {
      const refPage = pages[0];
      const w = refPage ? refPage.widthPt : 612;
      const h = refPage ? refPage.heightPt : 792;
      const insertAt =
        explicitIndex !== undefined
          ? explicitIndex
          : selectedIds.size === 1
            ? pages.findIndex((p) => selectedIds.has(p.id)) + 1
            : pages.length;

      dispatch({
        type: "COMMIT_PAGES",
        updater: (prev) => insertBlankPageAt(prev, insertAt, makeUid("note"), style, w, h),
      });
      const label =
        style === "ruled" ? "ruled note page" : style === "grid" ? "grid page" : "blank page";
      showNotice(`Added ${label} at position ${insertAt + 1}.`, "info", true);
    },
    [dispatch, pages, selectedIds, showNotice],
  );

  const documentTitle = useMemo(() => {
    if (sources.length === 0) return "Untitled Document";
    if (sources.length === 1) return sources[0].name;
    return `${sources[0].name} + ${sources.length - 1} more`;
  }, [sources]);

  const defaultExportFilename = useMemo(() => {
    if (sources.length === 0) return "foliodesk-document.pdf";
    const base = sources[0].name.replace(/\.pdf$/i, "");
    const suffix =
      sources.length > 1
        ? "-merged"
        : layout.pagesPerSheet > 1 || layout.customGrid
          ? `-${layout.pagesPerSheet}up`
          : pages.some((p) => p.invertMode !== "none")
            ? "-inverted"
            : sources.some((s) => s.wasEncrypted)
              ? "-unlocked"
              : "-edited";
    return `${base}${suffix}.pdf`;
  }, [sources, layout.pagesPerSheet, layout.customGrid, pages]);

  const livePdfPane = (
    <LivePdfPane
      pages={pages}
      sourcesById={sourcesById}
      selectedIds={selectedIds}
      activeTab={activeTab}
      onJumpToTab={(tab) => {
        dispatch({ type: "SET_ACTIVE_TAB", tab });
        if (layoutMode === "paged") setMobileScreen("editor");
      }}
      activePageIndex={safeActiveIndex}
      onChangeActivePageIndex={(index) => dispatch({ type: "SET_ACTIVE_PAGE_INDEX", index })}
      previewMode={previewMode}
      onChangePreviewMode={(mode) => dispatch({ type: "SET_PREVIEW_MODE", mode })}
      layoutConfig={layout}
      activeEdits={activeEdits}
      onLiveCropChange={handleLiveCropChange}
      chosenInvertMode={state.invertSettings.preferredMode}
      isLoading={isLoading}
      onFilesSelected={(files) => handleAddFiles(files)}
      onLoadSample={handleLoadSample}
      onToggleSelect={(pageId) => dispatch({ type: "TOGGLE_SELECT_PAGE", pageId })}
      onMovePage={handleMovePage}
      onReorderPages={handleReorderPages}
      onRotatePage={handleRotatePage}
      onToggleInvertPage={handleToggleInvertPage}
      onApplyInvertSingle={handleApplyInvertSingle}
      onDuplicatePage={handleDuplicatePage}
      onDeletePage={handleDeletePage}
      onInsertBlankPage={handleInsertBlankPage}
      onInspectPage={setInspectIndex}
    />
  );

  const editingOptionsPane = (
    <EditingOptionsPane
      layoutMode={layoutMode}
      onJumpToLivePreview={() => setMobileScreen("preview")}
      activeTab={activeTab}
      onTabChange={(tab) => dispatch({ type: "SET_ACTIVE_TAB", tab })}
      sources={sources}
      sourcesById={sourcesById}
      pages={pages}
      selectedIds={selectedIds}
      activePageIndex={safeActiveIndex}
      onChangeActivePageIndex={(index) => dispatch({ type: "SET_ACTIVE_PAGE_INDEX", index })}
      documentTitle={documentTitle}
      isLoading={isLoading}
      removingPasswordId={removingPasswordId}
      layoutConfig={layout}
      onChangeLayoutConfig={handleChangeLayoutConfig}
      cropSettings={state.cropSettings}
      onChangeCropSettings={(patch) => dispatch({ type: "SET_CROP_SETTINGS", patch })}
      onLiveCropChange={handleLiveCropChange}
      onApplyCropAll={handleApplyCropAll}
      invertSettings={state.invertSettings}
      onChangeInvertSettings={(patch) => dispatch({ type: "SET_INVERT_SETTINGS", patch })}
      onApplyLiveInvert={handleApplyLiveInvert}
      onResetAllInvert={handleResetAllInvert}
      ocrSettings={state.ocrSettings}
      onChangeOcrSettings={(patch) => dispatch({ type: "SET_OCR_SETTINGS", patch })}
      aiStudio={state.aiStudio}
      onPatchAiStudio={(patch) => dispatch({ type: "PATCH_AI_STUDIO", patch })}
      onAddFiles={(files) => handleAddFiles(files)}
      onLoadSample={handleLoadSample}
      onRemoveSource={handleRemoveSource}
      onRemovePassword={handleRemovePassword}
      onSelectAll={() =>
        dispatch({ type: "SET_SELECTED_IDS", ids: pages.map((p) => p.id) })
      }
      onClearSelection={() => dispatch({ type: "SET_SELECTED_IDS", ids: [] })}
      onSelectByRange={handleSelectByRange}
      onDeleteByRange={handleDeleteByRange}
      onReverseOrder={handleReverseOrder}
      onInsertBlankPage={(style) => handleInsertBlankPage(style)}
      onRotateSelected={handleRotateSelected}
      onInvertSelected={handleInvertSelected}
      onDeleteSelected={handleDeleteSelected}
      onUpdatePageOcr={(pageId, text, method) =>
        dispatch({ type: "UPDATE_PAGE_OCR", pageId, text, method })
      }
    />
  );

  return (
    <div
      data-layout-mode={layoutMode}
      className="min-h-screen flex flex-col bg-[#F8F9FB] text-slate-900"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          e.preventDefault();
          handleAddFiles(e.dataTransfer.files);
        }
      }}
    >
      <TopBar
        layoutMode={layoutMode}
        mobileScreen={mobileScreen}
        onChangeMobileScreen={setMobileScreen}
        activeTab={activeTab}
        pageCount={pages.length}
        documentTitle={documentTitle}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenExport={() => setExportOpen(true)}
      />

      {layoutMode === "split" ? (
        /* Desktop & Tablet Horizontal: 2/3 Left Live Edited PDF + 1/3 Right Editing Options */
        <main className="flex flex-1 min-h-0 h-[calc(100vh-3.5rem)] overflow-hidden">
          <div className="w-2/3 min-w-0 h-full overflow-hidden">{livePdfPane}</div>
          <div className="w-1/3 min-w-0 h-full border-l border-slate-200 overflow-hidden">
            {editingOptionsPane}
          </div>
        </main>
      ) : (
        /* Mobile & Tablet Vertical: Two Separated Switchable Pages (100% synced via WorkspaceProvider) */
        <main className="flex-1 min-h-0 h-[calc(100vh-6.25rem)] overflow-hidden">
          {mobileScreen === "preview" ? livePdfPane : editingOptionsPane}
        </main>
      )}

      {/* Floating Feedback & Undo Toast */}
      {notice && (
        <div
          role={notice.kind === "error" ? "alert" : "status"}
          className={`fixed bottom-4 left-4 right-4 sm:right-auto z-40 max-w-md rounded-xl border px-4 py-3 shadow-lg flex items-center gap-3 text-xs font-medium ${
            notice.kind === "error"
              ? "bg-red-50 border-red-200 text-red-900"
              : "bg-slate-900 border-slate-800 text-white"
          }`}
        >
          {notice.kind === "error" ? (
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          )}
          <span className="flex-1">{notice.message}</span>
          {notice.showUndo && past.length > 0 && (
            <button
              type="button"
              onClick={() => {
                handleUndo();
                setNotice(null);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/15 hover:bg-white/25 text-white font-semibold shrink-0"
            >
              <Undo2 className="h-3 w-3" />
              <span>Undo</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss notification"
            className="opacity-70 hover:opacity-100 shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <PasswordModal
        open={Boolean(activeLocked)}
        filename={activeLocked?.name ?? ""}
        errorMessage={passwordError}
        hintText={activeLocked?.hintText}
        isUnlocking={isUnlocking}
        onSubmit={handleUnlockSubmit}
        onCancel={handleUnlockCancel}
      />

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        pages={pages}
        sourcesById={sourcesById}
        selectedIds={selectedIds}
        layout={layout}
        embedOcrTextLayer={state.ocrSettings.embedOcrTextLayer}
        defaultFilename={defaultExportFilename}
      />

      <PageInspectorModal
        pages={pages}
        index={inspectIndex}
        sourcesById={sourcesById}
        onClose={() => setInspectIndex(null)}
        onChangeIndex={setInspectIndex}
        onRotatePage={handleRotatePage}
        onToggleInvertPage={handleToggleInvertPage}
        onMovePage={handleMovePage}
        onDeletePage={handleDeletePage}
      />
    </div>
  );
}

export default function App() {
  return (
    <WorkspaceProvider>
      <WorkspaceShell />
    </WorkspaceProvider>
  );
}
