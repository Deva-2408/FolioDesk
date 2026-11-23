import type { NUpLayoutConfig, PaperSizeKey, PdfPageItem } from "../types/pdf";
import { getCroppedDimensions } from "./cropMath";

export const PAPER_DIMENSIONS_PT: Record<PaperSizeKey, { width: number; height: number }> = {
  A4: { width: 595.28, height: 841.89 },
  LETTER: { width: 612, height: 792 },
};

export interface ImposedCellPlacement {
  pageIndex: number; // index into input pages array
  slotIndex: number; // 0..perSheet-1
  col: number;
  row: number; // 0 = top row visually
  // Full cell rectangle in top-left visual coordinates (points)
  cellX: number;
  cellY: number;
  cellWidth: number;
  cellHeight: number;
  // Content draw rectangle (aspect-ratio fitted inside slide portion of cell)
  drawX: number;
  drawY: number;
  drawWidth: number;
  drawHeight: number;
  // Optional student note lines area (inside cell)
  noteArea?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ImposedSheetPlan {
  sheetIndex: number;
  sheetWidth: number;
  sheetHeight: number;
  cols: number;
  rows: number;
  placements: ImposedCellPlacement[];
}

export interface ImpositionResult {
  cols: number;
  rows: number;
  perSheet: number;
  sheetWidth: number;
  sheetHeight: number;
  sheets: ImposedSheetPlan[];
}

export const DEFAULT_LAYOUT_CONFIG: NUpLayoutConfig = {
  pagesPerSheet: 1,
  customGrid: false,
  customCols: 2,
  customRows: 2,
  direction: "horizontal",
  paperSize: "A4",
  orientation: "auto",
  marginPt: 24,
  gapPt: 14,
  drawBorders: true,
  noteLines: false,
  pageNumbers: "none",
  watermarkText: "",
};

/**
 * Resolves grid columns & rows for a given N-up count and direction.
 * - Horizontal favors wider rows (e.g., 2 -> 2x1, 3 -> 3x1, 4 -> 2x2, 5 -> 5x1 or 3x2, 6 -> 3x2)
 * - Vertical favors taller stacks (e.g., 2 -> 1x2, 3 -> 1x3, 4 -> 2x2, 5 -> 1x5, 6 -> 2x3)
 */
export function resolveGridDimensions(config: NUpLayoutConfig): {
  cols: number;
  rows: number;
  perSheet: number;
} {
  if (config.customGrid) {
    const cols = Math.max(1, Math.min(6, Math.round(config.customCols)));
    const rows = Math.max(1, Math.min(8, Math.round(config.customRows)));
    return { cols, rows, perSheet: cols * rows };
  }

  const n = Math.max(1, Math.min(16, Math.round(config.pagesPerSheet)));
  const isHoriz = config.direction === "horizontal";

  switch (n) {
    case 1:
      return { cols: 1, rows: 1, perSheet: 1 };
    case 2:
      return isHoriz ? { cols: 2, rows: 1, perSheet: 2 } : { cols: 1, rows: 2, perSheet: 2 };
    case 3:
      return isHoriz ? { cols: 3, rows: 1, perSheet: 3 } : { cols: 1, rows: 3, perSheet: 3 };
    case 4:
      return { cols: 2, rows: 2, perSheet: 4 };
    case 5:
      return isHoriz ? { cols: 3, rows: 2, perSheet: 5 } : { cols: 1, rows: 5, perSheet: 5 };
    case 6:
      return isHoriz ? { cols: 3, rows: 2, perSheet: 6 } : { cols: 2, rows: 3, perSheet: 6 };
    case 8:
      return isHoriz ? { cols: 4, rows: 2, perSheet: 8 } : { cols: 2, rows: 4, perSheet: 8 };
    case 9:
      return { cols: 3, rows: 3, perSheet: 9 };
    default: {
      const root = Math.ceil(Math.sqrt(n));
      const other = Math.ceil(n / root);
      return isHoriz
        ? { cols: root, rows: other, perSheet: n }
        : { cols: other, rows: root, perSheet: n };
    }
  }
}

export function resolveSheetSize(
  config: NUpLayoutConfig,
  cols: number,
  rows: number,
  samplePageAspect = 1.29,
): { sheetWidth: number; sheetHeight: number } {
  const base = PAPER_DIMENSIONS_PT[config.paperSize];
  const portrait = { sheetWidth: base.width, sheetHeight: base.height };
  const landscape = { sheetWidth: base.height, sheetHeight: base.width };

  if (config.orientation === "portrait") return portrait;
  if (config.orientation === "landscape") return landscape;

  // Auto orientation: pick orientation that maximizes slide area utilization
  if (config.noteLines && cols === 1) {
    // Classic handout: vertical stack on portrait sheet with note lines to the right
    return portrait;
  }

  const calcUtilization = (w: number, h: number) => {
    const cellW = Math.max(10, (w - config.marginPt * 2 - config.gapPt * (cols - 1)) / cols);
    const cellH = Math.max(10, (h - config.marginPt * 2 - config.gapPt * (rows - 1)) / rows);
    const fitW = Math.min(cellW, cellH * samplePageAspect);
    const fitH = fitW / samplePageAspect;
    return fitW * fitH;
  };

  return calcUtilization(landscape.sheetWidth, landscape.sheetHeight) >
    calcUtilization(portrait.sheetWidth, portrait.sheetHeight)
    ? landscape
    : portrait;
}

export function computeImpositionPlan(
  pages: readonly Pick<PdfPageItem, "widthPt" | "heightPt" | "rotation" | "crop">[],
  config: NUpLayoutConfig,
): ImpositionResult {
  const { cols, rows, perSheet } = resolveGridDimensions(config);

  const firstDims =
    pages.length > 0 ? getCroppedDimensions(pages[0]) : { width: 792, height: 612 };
  const sampleAspect = firstDims.width / Math.max(1, firstDims.height);

  const { sheetWidth, sheetHeight } = resolveSheetSize(config, cols, rows, sampleAspect);

  const margin = Math.max(0, Math.min(72, config.marginPt));
  const gap = Math.max(0, Math.min(48, config.gapPt));
  const footerReserve = config.pageNumbers !== "none" ? 18 : 0;

  const usableW = Math.max(40, sheetWidth - margin * 2 - gap * (cols - 1));
  const usableH = Math.max(40, sheetHeight - margin * 2 - footerReserve - gap * (rows - 1));

  const cellWidth = usableW / cols;
  const cellHeight = usableH / rows;

  const sheets: ImposedSheetPlan[] = [];
  const totalSheets = pages.length === 0 ? 0 : Math.ceil(pages.length / perSheet);

  for (let s = 0; s < totalSheets; s++) {
    const placements: ImposedCellPlacement[] = [];
    const startIdx = s * perSheet;

    for (let slot = 0; slot < perSheet; slot++) {
      const pageIndex = startIdx + slot;
      if (pageIndex >= pages.length) break;

      // Horizontal: fill left-to-right across rows; Vertical: fill top-to-bottom down columns
      const col =
        config.direction === "horizontal" ? slot % cols : Math.floor(slot / rows);
      const row =
        config.direction === "horizontal" ? Math.floor(slot / cols) : slot % rows;

      const cellX = margin + col * (cellWidth + gap);
      const cellY = margin + row * (cellHeight + gap);

      // Reserve space for note lines if enabled (only meaningful when N >= 2 or single slide handout)
      let slideBoxX = cellX;
      let slideBoxY = cellY;
      let slideBoxW = cellWidth;
      let slideBoxH = cellHeight;
      let noteArea: ImposedCellPlacement["noteArea"] | undefined;

      if (config.noteLines) {
        if (cols === 1) {
          // Place note lines to the right (42% of width)
          const noteGap = 12;
          slideBoxW = cellWidth * 0.56;
          noteArea = {
            x: cellX + slideBoxW + noteGap,
            y: cellY,
            width: Math.max(20, cellWidth - slideBoxW - noteGap),
            height: cellHeight,
          };
        } else {
          // Place note lines below each slide (28% of cell height)
          const noteGap = 8;
          slideBoxH = cellHeight * 0.7;
          noteArea = {
            x: cellX,
            y: cellY + slideBoxH + noteGap,
            width: cellWidth,
            height: Math.max(16, cellHeight - slideBoxH - noteGap),
          };
        }
      }

      const dims = getCroppedDimensions(pages[pageIndex]);
      const pageAspect = dims.width / Math.max(1, dims.height);
      const boxAspect = slideBoxW / Math.max(1, slideBoxH);

      let drawWidth = slideBoxW;
      let drawHeight = slideBoxH;
      if (pageAspect > boxAspect) {
        drawWidth = slideBoxW;
        drawHeight = slideBoxW / pageAspect;
      } else {
        drawHeight = slideBoxH;
        drawWidth = slideBoxH * pageAspect;
      }

      const drawX = slideBoxX + (slideBoxW - drawWidth) / 2;
      const drawY = slideBoxY + (slideBoxH - drawHeight) / 2;

      placements.push({
        pageIndex,
        slotIndex: slot,
        col,
        row,
        cellX,
        cellY,
        cellWidth,
        cellHeight,
        drawX,
        drawY,
        drawWidth,
        drawHeight,
        noteArea,
      });
    }

    sheets.push({
      sheetIndex: s,
      sheetWidth,
      sheetHeight,
      cols,
      rows,
      placements,
    });
  }

  return {
    cols,
    rows,
    perSheet,
    sheetWidth,
    sheetHeight,
    sheets,
  };
}
