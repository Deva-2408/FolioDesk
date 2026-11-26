import type { ExportCompressionPreset, SourceDocument } from "../types/pdf";

export interface CompressionPresetConfig {
  id: ExportCompressionPreset;
  label: string;
  badge: string;
  description: string;
  dpiScale: number;
  jpegQuality: number;
  maxLongEdgePx: number;
  defaultCompressHeavyPages: boolean;
}

export const COMPRESSION_PRESETS: Record<ExportCompressionPreset, CompressionPresetConfig> = {
  compact: {
    id: "compact",
    label: "Smallest File",
    badge: "Email & LMS",
    description: "Compact 100 DPI JPEG compression · also shrinks heavy scans",
    dpiScale: 1.38,
    jpegQuality: 0.64,
    maxLongEdgePx: 1500,
    defaultCompressHeavyPages: true,
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    badge: "Recommended",
    description: "Crisp 120 DPI JPEG · lossless vectors kept where possible",
    dpiScale: 1.65,
    jpegQuality: 0.78,
    maxLongEdgePx: 1900,
    defaultCompressHeavyPages: false,
  },
  high: {
    id: "high",
    label: "High Quality",
    badge: "Print",
    description: "Sharp 155 DPI JPEG · ideal for dense formulas & fine print",
    dpiScale: 2.15,
    jpegQuality: 0.88,
    maxLongEdgePx: 2400,
    defaultCompressHeavyPages: false,
  },
};

/**
 * Average bytes-per-page threshold above which a non-inverted source PDF is considered
 * image/scan-heavy enough to benefit from JPEG re-compression when "Shrink heavy pages" is enabled.
 * Lightweight pure-vector PDFs stay below this threshold and are never unnecessarily rasterized.
 */
export const HEAVY_SOURCE_BYTES_PER_PAGE = 90_000;

/**
 * Computes the optimal rasterization scale for a page drawn at (drawWidthPt x drawHeightPt)
 * from a cropped page of size (croppedWidthPt x croppedHeightPt).
 *
 * For 1-up exports, matches targetDpiScale (capped by maxLongEdgePx so oversized posters
 * never explode memory or file size).
 * For N-up sheets (2-up, 4-up, 6-up, 9-up), scales pixels proportionally to the drawn cell
 * size so slides don't store 4x-9x excess pixels invisible at print size.
 */
export function computePlacementRenderScale(params: {
  croppedWidthPt: number;
  croppedHeightPt: number;
  drawWidthPt: number;
  drawHeightPt: number;
  targetDpiScale: number;
  maxLongEdgePx?: number;
}): number {
  const safeCropW = Math.max(1, params.croppedWidthPt);
  const safeCropH = Math.max(1, params.croppedHeightPt);
  const safeDrawW = Math.max(1, params.drawWidthPt);
  const safeDrawH = Math.max(1, params.drawHeightPt);
  const target = Math.max(0.75, params.targetDpiScale);

  const physicalRatio = Math.max(safeDrawW / safeCropW, safeDrawH / safeCropH);
  // Slight 1.15x oversampling on downscaled N-up cells preserves crisp small text while cutting pixels 3x-7x
  const placementScale =
    physicalRatio < 0.98
      ? Math.min(target, Math.max(0.75, physicalRatio * target * 1.15))
      : target;

  const maxLongEdge = params.maxLongEdgePx ?? 1900;
  const longEdgePt = Math.max(safeCropW, safeCropH);
  const maxAllowedScale = Math.max(0.75, maxLongEdge / longEdgePt);

  return Math.round(Math.min(placementScale, maxAllowedScale) * 1000) / 1000;
}

/**
 * Returns true only when the user requested heavy-page optimization AND the source PDF
 * has enough bytes per page to indicate embedded raster scans/photos rather than tiny vector text.
 */
export function shouldRecompressHeavySource(
  source: Pick<SourceDocument, "byteLength" | "pageCount"> | undefined,
  compressHeavyPages: boolean,
): boolean {
  if (!compressHeavyPages || !source) return false;
  const count = Math.max(1, source.pageCount);
  return source.byteLength / count >= HEAVY_SOURCE_BYTES_PER_PAGE;
}

/**
 * Computes exact pdf-lib `drawPage` coordinates, unrotated dimensions, and CCW rotation angle
 * so an embedded unrotated vector XObject lands precisely inside [drawX, drawX + drawWidth] x
 * [pdfDrawY, pdfDrawY + drawHeight] after clockwise rotation (0, 90, 180, or 270 deg).
 */
export function computeVectorDrawPlacement(
  drawX: number,
  pdfDrawY: number,
  drawWidth: number,
  drawHeight: number,
  totalRotationCW: number,
): { x: number; y: number; width: number; height: number; rotateDeg: number } {
  const rot = (((totalRotationCW % 360) + 360) % 360) as 0 | 90 | 180 | 270;

  if (rot === 90) {
    return {
      x: drawX,
      y: pdfDrawY + drawHeight,
      width: drawHeight,
      height: drawWidth,
      rotateDeg: -90,
    };
  }
  if (rot === 180) {
    return {
      x: drawX + drawWidth,
      y: pdfDrawY + drawHeight,
      width: drawWidth,
      height: drawHeight,
      rotateDeg: -180,
    };
  }
  if (rot === 270) {
    return {
      x: drawX + drawWidth,
      y: pdfDrawY,
      width: drawHeight,
      height: drawWidth,
      rotateDeg: 90,
    };
  }
  return {
    x: drawX,
    y: pdfDrawY,
    width: drawWidth,
    height: drawHeight,
    rotateDeg: 0,
  };
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function computeSizeSavings(
  sourceBytes: number,
  exportedBytes: number,
): { deltaPercent: number; label: string } | null {
  if (!Number.isFinite(sourceBytes) || sourceBytes <= 0 || !Number.isFinite(exportedBytes)) {
    return null;
  }
  const pct = Math.round(((sourceBytes - exportedBytes) / sourceBytes) * 100);
  if (pct > 0) {
    return { deltaPercent: pct, label: `${pct}% smaller than source` };
  }
  if (pct === 0) {
    return { deltaPercent: 0, label: "Same size as source" };
  }
  return { deltaPercent: pct, label: `${Math.abs(pct)}% larger than source` };
}
