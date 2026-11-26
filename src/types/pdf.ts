export type InvertMode = "none" | "standard" | "smart-light" | "ink-saver";

export type BlankPageStyle = "blank" | "ruled" | "grid";

export type WorkspaceTab = "organize" | "crop" | "layout" | "invert" | "ocr" | "ai";

export type LayoutDirection = "horizontal" | "vertical";

export type PaperSizeKey = "A4" | "LETTER";

export type SheetOrientation = "auto" | "portrait" | "landscape";

export type PageNumberPosition = "none" | "bottom-center" | "bottom-right";

export type PreviewDisplayMode = "document" | "grid" | "list" | "sheets";

export type EditScope = "all" | "current" | "selected";

export type AiToolMode = "chat" | "summarize" | "flashcards" | "quiz" | "action-items";

/**
 * Normalized crop insets (0..0.45) relative to the visually oriented (post-rotation) page.
 */
export interface CropInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface SourceDocument {
  id: string;
  name: string;
  byteLength: number;
  pageCount: number;
  addedAt: number;
  bytes: Uint8Array;
  wasEncrypted?: boolean;
  password?: string;
}

export interface PdfPageItem {
  id: string;
  kind: "pdf" | "blank";
  sourceId: string;
  sourceName: string;
  sourcePageIndex: number; // 0-based index in source PDF, or -1 for blank pages
  blankStyle?: BlankPageStyle;
  widthPt: number;
  heightPt: number;
  rotation: 0 | 90 | 180 | 270;
  invertMode: InvertMode;
  crop?: CropInsets;
  ocrText?: string;
  ocrMethod?: "vision" | "embedded";
  ocrUpdatedAt?: number;
}

export interface NUpLayoutConfig {
  pagesPerSheet: number; // 1, 2, 3, 4, 5, 6, 8, 9, or custom cols*rows
  customGrid: boolean;
  customCols: number;
  customRows: number;
  direction: LayoutDirection;
  paperSize: PaperSizeKey;
  orientation: SheetOrientation;
  marginPt: number;
  gapPt: number;
  drawBorders: boolean;
  noteLines: boolean;
  pageNumbers: PageNumberPosition;
  watermarkText: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export interface Flashcard {
  front: string;
  back: string;
  pageRef?: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  pageRef?: string;
}

export interface AiStudioState {
  activeTool: AiToolMode;
  questionDraft: string;
  messages: ChatMessage[];
  summaryText: string;
  actionItemsText: string;
  flashcards: Flashcard[];
  flippedCards: number[];
  quizQuestions: QuizQuestion[];
  selectedAnswers: Record<number, number>;
}

export interface OcrSettingsState {
  mode: "vision" | "embedded";
  outputFormat: "markdown" | "plain";
  languageHint: string;
  embedOcrTextLayer: boolean;
}

export interface CropSettingsState {
  scope: EditScope;
}

export interface InvertSettingsState {
  scope: EditScope;
  preferredMode: Exclude<InvertMode, "none">;
}

/**
 * Atomic undo/redo snapshot capturing ALL document-level edits across every tab,
 * plus an extensible `customEdits` bag so future tabs/tools automatically sync and retain edits.
 */
export interface PdfDocumentSnapshot {
  pages: PdfPageItem[];
  layout: NUpLayoutConfig;
  customEdits: Record<string, unknown>;
}

export interface PdfWorkspaceState {
  sources: SourceDocument[];
  pages: PdfPageItem[];
  layout: NUpLayoutConfig;
  customEdits: Record<string, unknown>;
  cropSettings: CropSettingsState;
  invertSettings: InvertSettingsState;
  ocrSettings: OcrSettingsState;
  aiStudio: AiStudioState;
  activeTab: WorkspaceTab;
  activePageIndex: number;
  selectedIds: string[];
  previewMode: PreviewDisplayMode;
  past: PdfDocumentSnapshot[];
  future: PdfDocumentSnapshot[];
}

export interface ActiveEditSummaryItem {
  id: string;
  tab: WorkspaceTab;
  label: string;
}

export type ExportCompressionPreset = "compact" | "balanced" | "high";

export interface ExportOptions {
  filename: string;
  layout: NUpLayoutConfig;
  selectedOnly: boolean;
  selectedIds: Set<string>;
  embedOcrTextLayer: boolean;
  renderDpiScale: number;
  compressionPreset?: ExportCompressionPreset;
  jpegQuality?: number;
  maxLongEdgePx?: number;
  compressHeavyPages?: boolean;
}

