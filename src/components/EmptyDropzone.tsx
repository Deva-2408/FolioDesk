import { useRef, useState } from "react";
import { Upload, FileStack, Contrast, LayoutGrid, ScanText, ArrowRight } from "lucide-react";
import type { SampleDeckId } from "../utils/samplePdfs";

interface EmptyDropzoneProps {
  onFilesSelected: (files: FileList | File[]) => void;
  onLoadSample: (deckId: SampleDeckId) => void;
  isLoading: boolean;
}

const SAMPLE_DECKS: {
  id: SampleDeckId;
  title: string;
  meta: string;
  description: string;
}[] = [
  {
    id: "dark-lecture",
    title: "Dark-Mode Lecture Slides",
    meta: "6 slides · Dark background",
    description: "Try reordering, cropping margins, inverting black backgrounds to white, and N-up handouts.",
  },
  {
    id: "research-handout",
    title: "Signal Processing Formula Sheet",
    meta: "3 pages · Portrait A4",
    description: "Clean academic reference notes ready to merge, summarize, or generate AI flashcards.",
  },
  {
    id: "scanned-worksheet",
    title: "Scanned Lab Worksheet",
    meta: "2 pages · Image-only scan",
    description: "No embedded text layer—built for high-accuracy Vision OCR on tables and kinetic equations.",
  },
  {
    id: "encrypted-exam",
    title: "Locked Exam Solutions",
    meta: "2 pages · Password: study2026",
    description: "Genuinely encrypted PDF—test password unlock, editing, and one-click password removal.",
  },
];

export function EmptyDropzone({
  onFilesSelected,
  onLoadSample,
  isLoading,
}: EmptyDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(e.dataTransfer.files);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 lg:py-8">
      <div className="mb-5">
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
          Edit, unlock, crop, invert, impose, OCR, and study any PDF.
        </h1>
        <p className="mt-2 text-sm text-slate-600 max-w-2xl leading-relaxed">
          Open password-protected PDFs and remove passwords permanently, reorder/add/delete or crop
          pages, merge multiple decks, invert dark slides for printing, arrange 2 to 9+ pages per
          sheet, and run high-accuracy OCR &amp; AI study tools.
        </p>
      </div>

      {/* Primary Upload Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed bg-white px-6 py-8 text-center transition-colors ${
          isDragging ? "border-blue-500 bg-blue-50/40" : "border-slate-300 hover:border-slate-400"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          aria-label="Upload one or more PDF files"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onFilesSelected(e.target.files);
              e.target.value = "";
            }
          }}
        />
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          <Upload className="h-5 w-5" />
        </div>
        <h2 className="mt-3 text-base font-semibold text-slate-900">
          Drop one or more PDF files here (including password-protected PDFs)
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Select multiple files at once to merge them immediately. Protected files prompt cleanly for their password.
        </p>
        <div className="mt-4 flex items-center justify-center">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Upload className="h-4 w-4" />
            <span>{isLoading ? "Loading PDF..." : "Choose PDF Files"}</span>
          </button>
        </div>
      </div>

      {/* Capabilities Overview Strip */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 border-y border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FileStack className="h-4 w-4 text-blue-600 shrink-0" />
            <span>Reorder, Crop &amp; Unlock</span>
          </div>
          <p className="mt-1 text-xs text-slate-600 leading-relaxed">
            Open encrypted PDFs, remove passwords, drag-sort, add/delete pages, merge files, and crop margins visually.
          </p>
        </div>
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Contrast className="h-4 w-4 text-blue-600 shrink-0" />
            <span>Dark-to-White Invert</span>
          </div>
          <p className="mt-1 text-xs text-slate-600 leading-relaxed">
            Turn black-background slides into crisp white printable pages with standard, hue-preserving, or ink-saver modes.
          </p>
        </div>
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <LayoutGrid className="h-4 w-4 text-blue-600 shrink-0" />
            <span>N-Up Sheet Layout</span>
          </div>
          <p className="mt-1 text-xs text-slate-600 leading-relaxed">
            Place 2, 3, 4, 5, 6, 8, 9, or custom grids horizontally or vertically across the whole PDF with note lines.
          </p>
        </div>
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ScanText className="h-4 w-4 text-blue-600 shrink-0" />
            <span>OCR &amp; AI Studio</span>
          </div>
          <p className="mt-1 text-xs text-slate-600 leading-relaxed">
            Extract text from scans, chat with your PDF, summarize key points, and generate flashcards &amp; quizzes.
          </p>
        </div>
      </div>

      {/* Deterministic Sample Decks for Instant Testing */}
      <div className="mt-5">
        <div className="flex items-baseline justify-between gap-4 mb-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Or start immediately with a sample document
          </h2>
          <span className="text-xs text-slate-500">Generated locally as real PDFs</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {SAMPLE_DECKS.map((deck) => (
            <button
              key={deck.id}
              type="button"
              disabled={isLoading}
              onClick={() => onLoadSample(deck.id)}
              className="group text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-400 hover:bg-blue-50/20 transition-colors disabled:opacity-50 flex flex-col justify-between"
            >
              <div>
                <p className="text-[11px] font-medium text-slate-500 tabular-nums">{deck.meta}</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
                  {deck.title}
                </h3>
                <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                  {deck.description}
                </p>
              </div>
              <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600">
                <span>Open sample</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
