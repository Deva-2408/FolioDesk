import type { BlankPageStyle, InvertMode, PdfPageItem } from "../types/pdf";

export type MoveDirection = "up" | "down" | "top" | "bottom";

export function movePage(
  pages: readonly PdfPageItem[],
  index: number,
  direction: MoveDirection,
): PdfPageItem[] {
  if (index < 0 || index >= pages.length || pages.length <= 1) {
    return [...pages];
  }

  let targetIndex = index;
  if (direction === "up") targetIndex = Math.max(0, index - 1);
  else if (direction === "down") targetIndex = Math.min(pages.length - 1, index + 1);
  else if (direction === "top") targetIndex = 0;
  else if (direction === "bottom") targetIndex = pages.length - 1;

  if (targetIndex === index) return [...pages];
  return reorderPages(pages, index, targetIndex);
}

export function reorderPages(
  pages: readonly PdfPageItem[],
  fromIndex: number,
  toIndex: number,
): PdfPageItem[] {
  if (
    fromIndex < 0 ||
    fromIndex >= pages.length ||
    toIndex < 0 ||
    toIndex >= pages.length ||
    fromIndex === toIndex
  ) {
    return [...pages];
  }
  const next = [...pages];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function reversePages(pages: readonly PdfPageItem[]): PdfPageItem[] {
  return [...pages].reverse();
}

export function rotatePages(
  pages: readonly PdfPageItem[],
  targetIds: ReadonlySet<string>,
  deltaDegrees: 90 | -90 | 180,
): PdfPageItem[] {
  return pages.map((page) => {
    if (!targetIds.has(page.id)) return page;
    const raw = (((page.rotation + deltaDegrees) % 360) + 360) % 360;
    const normalized = raw as 0 | 90 | 180 | 270;
    return { ...page, rotation: normalized };
  });
}

export function setInvertModeForPages(
  pages: readonly PdfPageItem[],
  targetIds: ReadonlySet<string>,
  mode: InvertMode,
): PdfPageItem[] {
  return pages.map((page) =>
    targetIds.has(page.id) ? { ...page, invertMode: mode } : page,
  );
}

export function togglePageInvert(
  pages: readonly PdfPageItem[],
  pageId: string,
  preferredMode: Exclude<InvertMode, "none"> = "standard",
): PdfPageItem[] {
  return pages.map((page) => {
    if (page.id !== pageId) return page;
    const nextMode: InvertMode = page.invertMode === "none" ? preferredMode : "none";
    return { ...page, invertMode: nextMode };
  });
}

export function duplicatePage(
  pages: readonly PdfPageItem[],
  pageId: string,
  newId: string,
): PdfPageItem[] {
  const idx = pages.findIndex((p) => p.id === pageId);
  if (idx === -1) return [...pages];
  const copy: PdfPageItem = {
    ...pages[idx],
    id: newId,
  };
  const next = [...pages];
  next.splice(idx + 1, 0, copy);
  return next;
}

export function deletePages(
  pages: readonly PdfPageItem[],
  targetIds: ReadonlySet<string>,
): PdfPageItem[] {
  return pages.filter((p) => !targetIds.has(p.id));
}

export function insertBlankPageAt(
  pages: readonly PdfPageItem[],
  index: number,
  id: string,
  style: BlankPageStyle,
  widthPt = 612,
  heightPt = 792,
): PdfPageItem[] {
  const clamped = Math.max(0, Math.min(pages.length, index));
  const label =
    style === "ruled" ? "Ruled Note Page" : style === "grid" ? "Grid Note Page" : "Blank Page";
  const blank: PdfPageItem = {
    id,
    kind: "blank",
    sourceId: "generated-note",
    sourceName: label,
    sourcePageIndex: -1,
    blankStyle: style,
    widthPt,
    heightPt,
    rotation: 0,
    invertMode: "none",
  };
  const next = [...pages];
  next.splice(clamped, 0, blank);
  return next;
}

/**
 * Parses a human-friendly 1-based page range string such as "1, 3-5, 8"
 * into sorted, unique 0-based page indices bounded by [0, totalPages - 1].
 */
export function parsePageRange(input: string, totalPages: number): {
  indices: number[];
  error: string | null;
} {
  const trimmed = input.trim();
  if (!trimmed) {
    return { indices: [], error: "Enter page numbers or ranges (e.g. 1, 3-5)." };
  }
  if (totalPages <= 0) {
    return { indices: [], error: "No pages loaded." };
  }

  const parts = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  const result = new Set<number>();

  for (const part of parts) {
    const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start < 1 || end < 1 || start > totalPages || end > totalPages) {
        return {
          indices: [],
          error: `Range "${part}" is outside 1–${totalPages}.`,
        };
      }
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      for (let p = lo; p <= hi; p++) {
        result.add(p - 1);
      }
      continue;
    }

    const singleMatch = /^(\d+)$/.exec(part);
    if (singleMatch) {
      const p = Number(singleMatch[1]);
      if (p < 1 || p > totalPages) {
        return {
          indices: [],
          error: `Page ${p} is outside 1–${totalPages}.`,
        };
      }
      result.add(p - 1);
      continue;
    }

    return {
      indices: [],
      error: `Invalid token "${part}". Use numbers and ranges like "1, 3-5".`,
    };
  }

  return {
    indices: Array.from(result).sort((a, b) => a - b),
    error: null,
  };
}

export function getEffectiveDimensions(page: Pick<PdfPageItem, "widthPt" | "heightPt" | "rotation">): {
  width: number;
  height: number;
} {
  if (page.rotation === 90 || page.rotation === 270) {
    return { width: page.heightPt, height: page.widthPt };
  }
  return { width: page.widthPt, height: page.heightPt };
}
