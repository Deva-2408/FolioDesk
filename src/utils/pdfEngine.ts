import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import type {
  BlankPageStyle,
  ExportOptions,
  InvertMode,
  PdfPageItem,
  SourceDocument,
} from "../types/pdf";
import { applyColorTransformInPlace } from "./colorTransform";
import {
  computeCropRectPx,
  computeNativePdfCropBox,
  getCroppedDimensions,
  hasActiveCrop,
} from "./cropMath";
import { computeImpositionPlan } from "./layoutMath";
import { getEffectiveDimensions } from "./pageOperations";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export class PdfPasswordRequiredError extends Error {
  readonly reason: "need-password" | "incorrect-password";

  constructor(reason: "need-password" | "incorrect-password", message?: string) {
    super(
      message ??
        (reason === "incorrect-password"
          ? "Incorrect password. Please try again."
          : "This PDF is password-protected."),
    );
    this.name = "PdfPasswordRequiredError";
    this.reason = reason;
  }
}

interface CachedPdfEntry {
  proxy: pdfjsLib.PDFDocumentProxy;
  loadingTask: pdfjsLib.PDFDocumentLoadingTask;
}

const proxyCache = new Map<string, CachedPdfEntry>();

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function bytesContainEncryptMarker(bytes: Uint8Array): boolean {
  // Fast scan of trailer region (last 4KB) + whole small file for "/Encrypt"
  const tailStart = Math.max(0, bytes.length - 8192);
  const tailText = new TextDecoder("latin1").decode(bytes.subarray(tailStart));
  if (tailText.includes("/Encrypt")) return true;
  if (bytes.length < 65536) {
    const fullText = new TextDecoder("latin1").decode(bytes);
    return fullText.includes("/Encrypt");
  }
  return false;
}

function isPdfPasswordError(err: unknown): "need-password" | "incorrect-password" | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { name?: string; code?: number; message?: string };
  if (e.name === "PasswordException") {
    // pdfjs PasswordResponses: NEED_PASSWORD = 1, INCORRECT_PASSWORD = 2
    return e.code === 2 ? "incorrect-password" : "need-password";
  }
  if (typeof e.message === "string" && /password/i.test(e.message)) {
    return /incorrect/i.test(e.message) ? "incorrect-password" : "need-password";
  }
  return null;
}

async function getPdfProxy(source: SourceDocument): Promise<pdfjsLib.PDFDocumentProxy> {
  const existing = proxyCache.get(source.id);
  if (existing) return existing.proxy;
  // Pass a copy of the buffer so pdfjs worker transfer never detaches source.bytes
  const copy = new Uint8Array(source.bytes.byteLength);
  copy.set(source.bytes);
  const loadingTask = pdfjsLib.getDocument({
    data: copy,
    password: source.password,
  });
  try {
    const proxy = await loadingTask.promise;
    proxyCache.set(source.id, { proxy, loadingTask });
    return proxy;
  } catch (err) {
    const pwReason = isPdfPasswordError(err);
    if (pwReason) {
      throw new PdfPasswordRequiredError(pwReason);
    }
    throw err;
  }
}

export function releaseSourceProxy(sourceId: string): void {
  const entry = proxyCache.get(sourceId);
  if (entry) {
    entry.proxy.cleanup().catch(() => {});
    entry.loadingTask.destroy().catch(() => {});
    proxyCache.delete(sourceId);
  }
}

export function releaseAllProxies(): void {
  for (const entry of proxyCache.values()) {
    entry.proxy.cleanup().catch(() => {});
    entry.loadingTask.destroy().catch(() => {});
  }
  proxyCache.clear();
}

export async function loadPdfFromBytes(
  name: string,
  rawBytes: Uint8Array,
  password?: string,
): Promise<{ source: SourceDocument; pages: PdfPageItem[] }> {
  const bytes = new Uint8Array(rawBytes.byteLength);
  bytes.set(rawBytes);

  const encryptedDetected = Boolean(password) || bytesContainEncryptMarker(bytes);
  const sourceId = makeId("doc");
  const source: SourceDocument = {
    id: sourceId,
    name,
    byteLength: bytes.byteLength,
    pageCount: 0,
    addedAt: Date.now(),
    bytes,
    wasEncrypted: encryptedDetected,
    password,
  };

  const proxy = await getPdfProxy(source);
  source.pageCount = proxy.numPages;

  const pages: PdfPageItem[] = [];
  for (let i = 1; i <= proxy.numPages; i++) {
    const page = await proxy.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    pages.push({
      id: makeId("pg"),
      kind: "pdf",
      sourceId,
      sourceName: name,
      sourcePageIndex: i - 1,
      widthPt: viewport.width,
      heightPt: viewport.height,
      rotation: 0,
      invertMode: "none",
    });
  }

  return { source, pages };
}

export async function loadPdfFromFile(
  file: File,
  password?: string,
): Promise<{ source: SourceDocument; pages: PdfPageItem[]; rawBytes: Uint8Array }> {
  const buf = await file.arrayBuffer();
  const rawBytes = new Uint8Array(buf);
  const loaded = await loadPdfFromBytes(file.name, rawBytes, password);
  return { ...loaded, rawBytes };
}

function renderBlankPageToCanvas(
  canvas: HTMLCanvasElement,
  widthPx: number,
  heightPx: number,
  style: BlankPageStyle,
): void {
  canvas.width = Math.max(1, Math.round(widthPx));
  canvas.height = Math.max(1, Math.round(heightPx));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (style === "ruled") {
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = Math.max(1, canvas.width / 600);
    const step = canvas.height / 28;
    const marginX = canvas.width * 0.08;
    for (let y = step * 2.5; y < canvas.height - step; y += step) {
      ctx.beginPath();
      ctx.moveTo(marginX, y);
      ctx.lineTo(canvas.width - marginX, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "#fca5a5";
    ctx.beginPath();
    ctx.moveTo(canvas.width * 0.13, 0);
    ctx.lineTo(canvas.width * 0.13, canvas.height);
    ctx.stroke();
  } else if (style === "grid") {
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = Math.max(1, canvas.width / 700);
    const step = canvas.width / 24;
    for (let x = step; x < canvas.width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = step; y < canvas.height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }
}

export async function renderPageToCanvas(
  pageItem: PdfPageItem,
  sourcesById: ReadonlyMap<string, SourceDocument>,
  options: {
    targetWidthPx?: number;
    scale?: number;
    applyInvert?: boolean;
    overrideInvertMode?: InvertMode;
    applyCrop?: boolean;
  } = {},
): Promise<HTMLCanvasElement> {
  const shouldCrop = options.applyCrop !== false && hasActiveCrop(pageItem.crop);
  const fullDims = getEffectiveDimensions(pageItem);
  const finalDims = shouldCrop ? getCroppedDimensions(pageItem) : fullDims;

  // Choose render scale so cropped region still has crisp resolution
  const scale =
    options.scale ??
    (options.targetWidthPx ? options.targetWidthPx / Math.max(1, finalDims.width) : 0.6);

  const canvas = document.createElement("canvas");

  if (pageItem.kind === "blank") {
    renderBlankPageToCanvas(
      canvas,
      fullDims.width * scale,
      fullDims.height * scale,
      pageItem.blankStyle ?? "blank",
    );
  } else {
    const source = sourcesById.get(pageItem.sourceId);
    if (!source) {
      renderBlankPageToCanvas(
        canvas,
        fullDims.width * scale,
        fullDims.height * scale,
        "blank",
      );
    } else {
      const proxy = await getPdfProxy(source);
      const pdfPage = await proxy.getPage(pageItem.sourcePageIndex + 1);
      const viewport = pdfPage.getViewport({
        scale,
        rotation: (pdfPage.rotate + pageItem.rotation) % 360,
      });

      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await pdfPage.render({
          canvas,
          canvasContext: ctx,
          viewport,
        }).promise;
      }
    }
  }

  let outputCanvas = canvas;
  if (shouldCrop && pageItem.crop) {
    const rect = computeCropRectPx(canvas.width, canvas.height, pageItem.crop);
    const cropped = document.createElement("canvas");
    cropped.width = rect.sw;
    cropped.height = rect.sh;
    const cctx = cropped.getContext("2d", { willReadFrequently: true });
    if (cctx) {
      cctx.drawImage(canvas, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, rect.sw, rect.sh);
    }
    outputCanvas = cropped;
  }

  const mode = options.overrideInvertMode ?? (options.applyInvert ? pageItem.invertMode : "none");
  if (mode !== "none") {
    const ctx = outputCanvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      const imageData = ctx.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
      applyColorTransformInPlace(imageData.data, mode);
      ctx.putImageData(imageData, 0, 0);
    }
  }

  return outputCanvas;
}

export async function renderPageToDataUrl(
  pageItem: PdfPageItem,
  sourcesById: ReadonlyMap<string, SourceDocument>,
  options: {
    targetWidthPx?: number;
    scale?: number;
    applyInvert?: boolean;
    overrideInvertMode?: InvertMode;
    applyCrop?: boolean;
  } = {},
): Promise<string> {
  const canvas = await renderPageToCanvas(pageItem, sourcesById, options);
  return canvas.toDataURL("image/png");
}

export async function extractEmbeddedPageText(
  pageItem: PdfPageItem,
  sourcesById: ReadonlyMap<string, SourceDocument>,
): Promise<string> {
  if (pageItem.kind === "blank") return "";
  const source = sourcesById.get(pageItem.sourceId);
  if (!source) return "";

  const proxy = await getPdfProxy(source);
  const pdfPage = await proxy.getPage(pageItem.sourcePageIndex + 1);
  const content = await pdfPage.getTextContent();

  const lines: string[] = [];
  let currentLine = "";
  let lastY: number | null = null;

  for (const item of content.items) {
    if (!("str" in item)) continue;
    const str = item.str;
    const y = Array.isArray(item.transform) ? Math.round(item.transform[5]) : null;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
      if (currentLine.trim()) lines.push(currentLine.trim());
      currentLine = str;
    } else {
      currentLine +=
        currentLine && str && !currentLine.endsWith(" ") && !str.startsWith(" ")
          ? ` ${str}`
          : str;
    }
    if (y !== null) lastY = y;
  }
  if (currentLine.trim()) lines.push(currentLine.trim());

  return lines.join("\n").trim();
}

function sanitizePdfText(text: string): string {
  return text.replace(/[^\x20-\x7E\xA0-\xFF\n]/g, " ");
}

async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
  if (!blob) throw new Error("Failed to encode rendered page as PNG.");
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Overlays invisible selectable text from a decrypted pdfjs page onto an output pdf-lib page
 * so unlocked/decrypted PDFs remain searchable and text-selectable.
 */
async function overlayDecryptedTextLayer(
  pdfPage: pdfjsLib.PDFPageProxy,
  outPage: ReturnType<PDFDocument["addPage"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
): Promise<void> {
  try {
    const content = await pdfPage.getTextContent();
    const { width, height } = outPage.getSize();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const clean = sanitizePdfText(item.str);
      if (!clean.trim()) continue;
      const tr = item.transform;
      const x = Array.isArray(tr) ? Math.max(4, Math.min(width - 10, tr[4])) : 20;
      const y = Array.isArray(tr) ? Math.max(4, Math.min(height - 10, tr[5])) : 20;
      const fontSize = Array.isArray(tr)
        ? Math.max(6, Math.min(36, Math.hypot(tr[0], tr[1]) || 10))
        : 10;
      outPage.drawText(clean, {
        x,
        y,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
        opacity: 0.001,
      });
    }
  } catch {
    // Non-fatal: visual render is already embedded
  }
}

/**
 * Permanently removes password protection from a decrypted SourceDocument by rebuilding
 * a clean unencrypted PDF (high-DPI visuals + invisible decrypted selectable text layer).
 */
export async function createUnlockedPdfBytes(
  source: SourceDocument,
  onProgress?: (current: number, total: number) => void,
): Promise<Uint8Array> {
  const proxy = await getPdfProxy(source);
  const outDoc = await PDFDocument.create();
  const helvetica = await outDoc.embedFont(StandardFonts.Helvetica);

  for (let i = 1; i <= proxy.numPages; i++) {
    onProgress?.(i, proxy.numPages);
    const pdfPage = await proxy.getPage(i);
    const baseVp = pdfPage.getViewport({ scale: 1 });
    const renderVp = pdfPage.getViewport({ scale: 2.25 });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(renderVp.width));
    canvas.height = Math.max(1, Math.round(renderVp.height));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pdfPage.render({ canvas, canvasContext: ctx, viewport: renderVp }).promise;
    }

    const pngBytes = await canvasToPngBytes(canvas);
    const pngImg = await outDoc.embedPng(pngBytes);
    const outPage = outDoc.addPage([baseVp.width, baseVp.height]);
    outPage.drawImage(pngImg, {
      x: 0,
      y: 0,
      width: baseVp.width,
      height: baseVp.height,
    });

    await overlayDecryptedTextLayer(pdfPage, outPage, helvetica);
  }

  return outDoc.save();
}

function drawBlankLinesPdf(
  page: ReturnType<PDFDocument["addPage"]>,
  x: number,
  yBottom: number,
  width: number,
  height: number,
  style: BlankPageStyle,
): void {
  page.drawRectangle({
    x,
    y: yBottom,
    width,
    height,
    color: rgb(1, 1, 1),
  });

  if (style === "ruled") {
    const step = height / 28;
    const marginX = width * 0.08;
    for (let dy = step * 2; dy < height - step * 1.5; dy += step) {
      page.drawLine({
        start: { x: x + marginX, y: yBottom + dy },
        end: { x: x + width - marginX, y: yBottom + dy },
        thickness: 0.6,
        color: rgb(0.8, 0.84, 0.88),
      });
    }
    page.drawLine({
      start: { x: x + width * 0.13, y: yBottom },
      end: { x: x + width * 0.13, y: yBottom + height },
      thickness: 0.7,
      color: rgb(0.96, 0.68, 0.68),
    });
  } else if (style === "grid") {
    const step = width / 24;
    for (let dx = step; dx < width; dx += step) {
      page.drawLine({
        start: { x: x + dx, y: yBottom },
        end: { x: x + dx, y: yBottom + height },
        thickness: 0.45,
        color: rgb(0.88, 0.91, 0.94),
      });
    }
    for (let dy = step; dy < height; dy += step) {
      page.drawLine({
        start: { x, y: yBottom + dy },
        end: { x: x + width, y: yBottom + dy },
        thickness: 0.45,
        color: rgb(0.88, 0.91, 0.94),
      });
    }
  }
}

export async function exportEditedPdf(
  allPages: readonly PdfPageItem[],
  sourcesById: ReadonlyMap<string, SourceDocument>,
  options: ExportOptions,
  onProgress?: (current: number, total: number, label: string) => void,
): Promise<{ bytes: Uint8Array; sheetCount: number; filename: string }> {
  const pagesToExport =
    options.selectedOnly && options.selectedIds.size > 0
      ? allPages.filter((p) => options.selectedIds.has(p.id))
      : [...allPages];

  if (pagesToExport.length === 0) {
    throw new Error("There are no pages selected to export.");
  }

  const outDoc = await PDFDocument.create();
  const helvetica = await outDoc.embedFont(StandardFonts.Helvetica);

  // Cache loaded UNENCRYPTED source pdf-lib documents for lossless vector embedding
  const sourcePdfLibCache = new Map<string, PDFDocument>();
  const getSourcePdfLib = async (sourceId: string): Promise<PDFDocument> => {
    const cached = sourcePdfLibCache.get(sourceId);
    if (cached) return cached;
    const src = sourcesById.get(sourceId);
    if (!src) throw new Error(`Missing source PDF (${sourceId})`);
    const loaded = await PDFDocument.load(src.bytes, { ignoreEncryption: true });
    sourcePdfLibCache.set(sourceId, loaded);
    return loaded;
  };

  const { layout } = options;
  const useImposition =
    layout.customGrid ||
    layout.pagesPerSheet > 1 ||
    layout.noteLines ||
    layout.orientation !== "auto";

  let outputSheetCount = 0;

  if (!useImposition) {
    const total = pagesToExport.length;
    for (let i = 0; i < total; i++) {
      const item = pagesToExport[i];
      onProgress?.(i + 1, total, `Building page ${i + 1} of ${total}...`);
      const eff = getCroppedDimensions(item);
      const src = sourcesById.get(item.sourceId);
      const mustRasterize =
        item.invertMode !== "none" || Boolean(src?.wasEncrypted);

      let outPage: ReturnType<PDFDocument["addPage"]>;

      if (item.kind === "blank") {
        outPage = outDoc.addPage([eff.width, eff.height]);
        drawBlankLinesPdf(outPage, 0, 0, eff.width, eff.height, item.blankStyle ?? "blank");
      } else if (mustRasterize) {
        // High-DPI decrypted/inverted/cropped render
        const canvas = await renderPageToCanvas(item, sourcesById, {
          scale: Math.max(options.renderDpiScale, src?.wasEncrypted ? 2.25 : options.renderDpiScale),
          applyInvert: true,
          applyCrop: true,
        });
        const pngBytes = await canvasToPngBytes(canvas);
        const pngImage = await outDoc.embedPng(pngBytes);
        outPage = outDoc.addPage([eff.width, eff.height]);
        outPage.drawImage(pngImage, {
          x: 0,
          y: 0,
          width: eff.width,
          height: eff.height,
        });
        // Preserve searchable text when decrypting an uncropped, unrotated encrypted page
        if (src?.wasEncrypted && !hasActiveCrop(item.crop) && item.rotation === 0) {
          const proxy = await getPdfProxy(src);
          const pdfPage = await proxy.getPage(item.sourcePageIndex + 1);
          await overlayDecryptedTextLayer(pdfPage, outPage, helvetica);
        }
      } else {
        // Lossless vector copy from unencrypted source PDF
        const srcDoc = await getSourcePdfLib(item.sourceId);
        const [copied] = await outDoc.copyPages(srcDoc, [item.sourcePageIndex]);
        const existingRot = copied.getRotation().angle;
        const totalRot = (existingRot + item.rotation) % 360;
        if (item.rotation !== 0) {
          copied.setRotation(degrees(totalRot));
        }
        if (hasActiveCrop(item.crop)) {
          const mediaBox = copied.getCropBox() ?? copied.getMediaBox();
          const box = computeNativePdfCropBox(mediaBox, totalRot, item.crop);
          copied.setCropBox(box.x, box.y, box.width, box.height);
          copied.setMediaBox(box.x, box.y, box.width, box.height);
        }
        outPage = outDoc.addPage(copied);
      }

      if (options.embedOcrTextLayer && item.ocrText) {
        const cleanLines = sanitizePdfText(item.ocrText).split("\n").filter(Boolean);
        const { width, height } = outPage.getSize();
        const lineStep = Math.max(9, Math.min(14, (height - 40) / Math.max(1, cleanLines.length)));
        cleanLines.forEach((line, idx) => {
          const y = height - 24 - idx * lineStep;
          if (y > 12) {
            outPage.drawText(line.slice(0, 140), {
              x: 20,
              y,
              size: 8,
              font: helvetica,
              color: rgb(0, 0, 0),
              opacity: 0.001,
              maxWidth: Math.max(100, width - 40),
            });
          }
        });
      }

      outputSheetCount++;
    }
  } else {
    const plan = computeImpositionPlan(pagesToExport, layout);
    const totalSheets = plan.sheets.length;

    for (let s = 0; s < totalSheets; s++) {
      const sheetPlan = plan.sheets[s];
      onProgress?.(s + 1, totalSheets, `Composing sheet ${s + 1} of ${totalSheets}...`);
      const outPage = outDoc.addPage([sheetPlan.sheetWidth, sheetPlan.sheetHeight]);
      outPage.drawRectangle({
        x: 0,
        y: 0,
        width: sheetPlan.sheetWidth,
        height: sheetPlan.sheetHeight,
        color: rgb(1, 1, 1),
      });

      for (const placement of sheetPlan.placements) {
        const item = pagesToExport[placement.pageIndex];
        const src = sourcesById.get(item.sourceId);
        const pdfDrawY = sheetPlan.sheetHeight - placement.drawY - placement.drawHeight;
        const mustRasterize =
          item.invertMode !== "none" ||
          item.rotation !== 0 ||
          hasActiveCrop(item.crop) ||
          Boolean(src?.wasEncrypted);

        if (item.kind === "blank") {
          drawBlankLinesPdf(
            outPage,
            placement.drawX,
            pdfDrawY,
            placement.drawWidth,
            placement.drawHeight,
            item.blankStyle ?? "blank",
          );
        } else if (mustRasterize) {
          const canvas = await renderPageToCanvas(item, sourcesById, {
            scale: options.renderDpiScale,
            applyInvert: true,
            applyCrop: true,
          });
          const pngBytes = await canvasToPngBytes(canvas);
          const pngImage = await outDoc.embedPng(pngBytes);
          outPage.drawImage(pngImage, {
            x: placement.drawX,
            y: pdfDrawY,
            width: placement.drawWidth,
            height: placement.drawHeight,
          });
        } else {
          const srcDoc = await getSourcePdfLib(item.sourceId);
          const srcPage = srcDoc.getPage(item.sourcePageIndex);
          const embedded = await outDoc.embedPage(srcPage);
          outPage.drawPage(embedded, {
            x: placement.drawX,
            y: pdfDrawY,
            width: placement.drawWidth,
            height: placement.drawHeight,
          });
        }

        if (layout.drawBorders) {
          outPage.drawRectangle({
            x: placement.drawX,
            y: pdfDrawY,
            width: placement.drawWidth,
            height: placement.drawHeight,
            borderColor: rgb(0.78, 0.82, 0.87),
            borderWidth: 0.75,
          });
        }

        if (placement.noteArea) {
          const na = placement.noteArea;
          const naBottomY = sheetPlan.sheetHeight - na.y - na.height;
          const lineCount = Math.max(3, Math.floor(na.height / 16));
          const step = na.height / (lineCount + 1);
          for (let l = 1; l <= lineCount; l++) {
            const ly = naBottomY + na.height - l * step;
            outPage.drawLine({
              start: { x: na.x, y: ly },
              end: { x: na.x + na.width, y: ly },
              thickness: 0.6,
              color: rgb(0.76, 0.8, 0.85),
            });
          }
        }
      }

      outputSheetCount++;
    }
  }

  const finalPages = outDoc.getPages();
  const totalOut = finalPages.length;
  const watermark = sanitizePdfText(layout.watermarkText.trim());

  for (let i = 0; i < totalOut; i++) {
    const p = finalPages[i];
    const { width, height } = p.getSize();

    if (layout.pageNumbers !== "none") {
      const label = `${i + 1} / ${totalOut}`;
      const fontSize = 9;
      const textWidth = helvetica.widthOfTextAtSize(label, fontSize);
      const x =
        layout.pageNumbers === "bottom-center"
          ? (width - textWidth) / 2
          : width - textWidth - 24;
      p.drawText(label, {
        x,
        y: 12,
        size: fontSize,
        font: helvetica,
        color: rgb(0.38, 0.44, 0.52),
      });
    }

    if (watermark) {
      const fontSize = Math.max(22, Math.min(48, Math.round(width / 12)));
      const textWidth = helvetica.widthOfTextAtSize(watermark, fontSize);
      p.drawText(watermark, {
        x: Math.max(20, (width - textWidth * 0.7) / 2),
        y: height * 0.42,
        size: fontSize,
        font: helvetica,
        color: rgb(0.45, 0.5, 0.58),
        opacity: 0.16,
        rotate: degrees(32),
      });
    }
  }

  const bytes = await outDoc.save();
  const safeName = options.filename.trim().endsWith(".pdf")
    ? options.filename.trim()
    : `${options.filename.trim() || "foliodesk-export"}.pdf`;

  return { bytes, sheetCount: outputSheetCount, filename: safeName };
}

export function triggerFileDownload(
  bytes: Uint8Array | string,
  filename: string,
  mimeType: string,
): void {
  const blobPart: BlobPart =
    typeof bytes === "string"
      ? bytes
      : new Uint8Array(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
        );
  const blob = new Blob([blobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
