import type { CropInsets, PdfPageItem } from "../types/pdf";
import { getEffectiveDimensions } from "./pageOperations";

export const ZERO_CROP: CropInsets = { top: 0, right: 0, bottom: 0, left: 0 };

const MIN_REMAINING_FRACTION = 0.12;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(0.88, v));
}

/**
 * Normalizes crop insets so each inset is in [0, 0.88] and opposing insets
 * always leave at least 12% of the page width and height visible.
 */
export function normalizeCrop(crop?: Partial<CropInsets> | null): CropInsets {
  if (!crop) return { ...ZERO_CROP };
  let top = clamp01(crop.top ?? 0);
  let bottom = clamp01(crop.bottom ?? 0);
  let left = clamp01(crop.left ?? 0);
  let right = clamp01(crop.right ?? 0);

  if (top + bottom > 1 - MIN_REMAINING_FRACTION) {
    const scale = (1 - MIN_REMAINING_FRACTION) / (top + bottom);
    top *= scale;
    bottom *= scale;
  }
  if (left + right > 1 - MIN_REMAINING_FRACTION) {
    const scale = (1 - MIN_REMAINING_FRACTION) / (left + right);
    left *= scale;
    right *= scale;
  }

  return {
    top: Math.round(top * 1000) / 1000,
    right: Math.round(right * 1000) / 1000,
    bottom: Math.round(bottom * 1000) / 1000,
    left: Math.round(left * 1000) / 1000,
  };
}

export function hasActiveCrop(crop?: CropInsets | null): boolean {
  if (!crop) return false;
  return crop.top > 0.001 || crop.right > 0.001 || crop.bottom > 0.001 || crop.left > 0.001;
}

/**
 * Returns final visual width & height (in PDF points) after rotation AND crop.
 */
export function getCroppedDimensions(
  page: Pick<PdfPageItem, "widthPt" | "heightPt" | "rotation" | "crop">,
): { width: number; height: number } {
  const rotated = getEffectiveDimensions(page);
  if (!hasActiveCrop(page.crop)) return rotated;
  const c = normalizeCrop(page.crop);
  return {
    width: Math.max(10, rotated.width * (1 - c.left - c.right)),
    height: Math.max(10, rotated.height * (1 - c.top - c.bottom)),
  };
}

/**
 * Computes source rectangle in pixels for slicing an already-rotated rendered canvas.
 */
export function computeCropRectPx(
  canvasWidth: number,
  canvasHeight: number,
  crop?: CropInsets | null,
): { sx: number; sy: number; sw: number; sh: number } {
  if (!hasActiveCrop(crop)) {
    return { sx: 0, sy: 0, sw: canvasWidth, sh: canvasHeight };
  }
  const c = normalizeCrop(crop);
  const sx = Math.round(canvasWidth * c.left);
  const sy = Math.round(canvasHeight * c.top);
  const sw = Math.max(1, Math.round(canvasWidth * (1 - c.left - c.right)));
  const sh = Math.max(1, Math.round(canvasHeight * (1 - c.top - c.bottom)));
  return {
    sx: Math.min(sx, canvasWidth - 1),
    sy: Math.min(sy, canvasHeight - 1),
    sw: Math.min(sw, canvasWidth - sx),
    sh: Math.min(sh, canvasHeight - sy),
  };
}

/**
 * Maps visual top/right/bottom/left crop insets (applied after clockwise rotation)
 * back into unrotated PDF page coordinates (origin at bottom-left) for lossless setCropBox.
 */
export function computeNativePdfCropBox(
  mediaBox: { x: number; y: number; width: number; height: number },
  totalRotationCW: number,
  crop?: CropInsets | null,
): { x: number; y: number; width: number; height: number } {
  if (!hasActiveCrop(crop)) return { ...mediaBox };
  const c = normalizeCrop(crop);
  const rot = (((totalRotationCW % 360) + 360) % 360) as 0 | 90 | 180 | 270;

  // Map visual (top, right, bottom, left) to unrotated PDF edges (pdfTop, pdfRight, pdfBottom, pdfLeft)
  let pdfTop = c.top;
  let pdfRight = c.right;
  let pdfBottom = c.bottom;
  let pdfLeft = c.left;

  if (rot === 90) {
    // Visual top was unrotated left; visual right was unrotated top
    pdfLeft = c.top;
    pdfTop = c.right;
    pdfRight = c.bottom;
    pdfBottom = c.left;
  } else if (rot === 180) {
    pdfBottom = c.top;
    pdfLeft = c.right;
    pdfTop = c.bottom;
    pdfRight = c.left;
  } else if (rot === 270) {
    pdfRight = c.top;
    pdfBottom = c.right;
    pdfLeft = c.bottom;
    pdfTop = c.left;
  }

  const x = mediaBox.x + mediaBox.width * pdfLeft;
  const y = mediaBox.y + mediaBox.height * pdfBottom;
  const width = Math.max(10, mediaBox.width * (1 - pdfLeft - pdfRight));
  const height = Math.max(10, mediaBox.height * (1 - pdfTop - pdfBottom));
  return { x, y, width, height };
}

export function setCropForPages(
  pages: readonly PdfPageItem[],
  targetIds: ReadonlySet<string>,
  crop: CropInsets | undefined,
): PdfPageItem[] {
  const normalized = crop && hasActiveCrop(crop) ? normalizeCrop(crop) : undefined;
  return pages.map((p) => (targetIds.has(p.id) ? { ...p, crop: normalized } : p));
}
