import { useEffect, useState } from "react";
import type { InvertMode, PdfPageItem, SourceDocument } from "../types/pdf";
import { getPreviewCssFilter } from "../utils/colorTransform";
import { getCroppedDimensions, hasActiveCrop } from "../utils/cropMath";
import { getEffectiveDimensions } from "../utils/pageOperations";
import { renderPageToDataUrl } from "../utils/pdfEngine";

// Lightweight in-memory thumbnail cache keyed by page source, geometry, and crop
const thumbnailCache = new Map<string, string>();
const MAX_CACHE_ENTRIES = 280;

export function clearThumbnailCacheForSource(sourceId: string): void {
  for (const key of thumbnailCache.keys()) {
    if (key.startsWith(`${sourceId}:`)) {
      thumbnailCache.delete(key);
    }
  }
}

interface PageThumbnailProps {
  page: PdfPageItem;
  sourcesById: ReadonlyMap<string, SourceDocument>;
  targetWidthPx?: number;
  exactPixelInvert?: boolean;
  overrideInvertMode?: InvertMode;
  disableCrop?: boolean;
  className?: string;
  alt?: string;
}

export function PageThumbnail({
  page,
  sourcesById,
  targetWidthPx = 320,
  exactPixelInvert = false,
  overrideInvertMode,
  disableCrop = false,
  className = "",
  alt,
}: PageThumbnailProps) {
  const effectiveInvert = overrideInvertMode ?? page.invertMode;
  const applyCrop = !disableCrop && hasActiveCrop(page.crop);
  const cropKey =
    applyCrop && page.crop
      ? `${page.crop.top}:${page.crop.right}:${page.crop.bottom}:${page.crop.left}`
      : "full";

  const source = sourcesById.get(page.sourceId);
  const cacheKey = `${page.sourceId}:${source?.byteLength ?? 0}:${page.sourcePageIndex}:${page.blankStyle ?? ""}:${page.rotation}:${cropKey}:${targetWidthPx}:${
    exactPixelInvert ? effectiveInvert : "raw"
  }`;

  const [dataUrl, setDataUrl] = useState<string | null>(() => thumbnailCache.get(cacheKey) ?? null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const cached = thumbnailCache.get(cacheKey);
    if (cached) {
      setDataUrl(cached);
      setError(false);
      return;
    }

    let cancelled = false;
    setError(false);

    renderPageToDataUrl(page, sourcesById, {
      targetWidthPx,
      applyInvert: exactPixelInvert,
      overrideInvertMode: exactPixelInvert ? effectiveInvert : "none",
      applyCrop,
    })
      .then((url) => {
        if (cancelled) return;
        if (thumbnailCache.size >= MAX_CACHE_ENTRIES) {
          const oldestKey = thumbnailCache.keys().next().value;
          if (oldestKey) thumbnailCache.delete(oldestKey);
        }
        thumbnailCache.set(cacheKey, url);
        setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
    // Keying strictly on cacheKey prevents unrelated metadata changes (like ocrText or crop on disableCrop stages) from aborting an in-flight render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  const dims = applyCrop ? getCroppedDimensions(page) : getEffectiveDimensions(page);
  const aspectRatio = `${dims.width} / ${dims.height}`;
  const cssFilter = exactPixelInvert ? "none" : getPreviewCssFilter(effectiveInvert);

  return (
    <div
      className={`relative overflow-hidden bg-white select-none ${className}`}
      style={{ aspectRatio }}
    >
      {dataUrl ? (
        <img
          src={dataUrl}
          alt={alt ?? `${page.sourceName} page ${page.sourcePageIndex + 1}`}
          draggable={false}
          className="h-full w-full object-contain block transition-[filter] duration-150"
          style={{ filter: cssFilter }}
        />
      ) : error ? (
        <div className="flex h-full w-full items-center justify-center bg-slate-50 text-xs text-slate-400 p-2 text-center">
          Preview unavailable
        </div>
      ) : (
        <div className="h-full w-full animate-pulse bg-slate-100" />
      )}
    </div>
  );
}
