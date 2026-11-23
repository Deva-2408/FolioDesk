import { useState } from "react";
import {
  Send,
  FileText,
  Layers,
  HelpCircle,
  ListChecks,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  Download,
  RotateCcw,
} from "lucide-react";
import type {
  AiStudioState,
  AiToolMode,
  ChatMessage,
  Flashcard,
  PdfPageItem,
  QuizQuestion,
  SourceDocument,
} from "../types/pdf";
import {
  extractEmbeddedPageText,
  renderPageToDataUrl,
  triggerFileDownload,
} from "../utils/pdfEngine";

interface AiAssistantViewProps {
  pages: PdfPageItem[];
  sourcesById: ReadonlyMap<string, SourceDocument>;
  documentTitle: string;
  aiState: AiStudioState;
  onPatchAiState: (patch: Partial<AiStudioState>) => void;
  compact?: boolean;
}

const QUICK_PROMPTS = [
  "Explain the main concepts in plain language",
  "List every formula and what each variable means",
  "What are the most likely exam or review questions?",
];

export function AiAssistantView({
  pages,
  sourcesById,
  documentTitle,
  aiState,
  onPatchAiState,
  compact = false,
}: AiAssistantViewProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const {
    activeTool: tool,
    questionDraft: questionInput,
    messages,
    summaryText,
    actionItemsText,
    flashcards,
    flippedCards,
    quizQuestions,
    selectedAnswers,
  } = aiState;

  const flippedSet = new Set(flippedCards);

  async function gatherDocumentContext(): Promise<{
    documentText: string;
    pageImageBase64?: string;
  }> {
    const sections: string[] = [];
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      let text = (p.ocrText ?? "").trim();
      if (!text && p.kind === "pdf") {
        text = await extractEmbeddedPageText(p, sourcesById);
      }
      if (text) {
        sections.push(`[Page ${i + 1}]\n${text}`);
      }
    }

    const combined = sections.join("\n\n");
    if (combined.length > 0) {
      return { documentText: combined };
    }

    if (pages.length > 0) {
      const pageImageBase64 = await renderPageToDataUrl(pages[0], sourcesById, {
        scale: 1.75,
        applyInvert: true,
        applyCrop: true,
      });
      return { documentText: "", pageImageBase64 };
    }

    return { documentText: "" };
  }

  async function invokeAi(
    mode: AiToolMode,
    extra: { question?: string; history?: Array<{ role: string; text: string }> } = {},
  ) {
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const ctx = await gatherDocumentContext();
      const resp = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          documentTitle,
          pageCount: pages.length,
          documentText: ctx.documentText,
          pageImageBase64: ctx.pageImageBase64 ?? "",
          question: extra.question ?? "",
          history: extra.history ?? [],
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        text?: string;
        cards?: Flashcard[];
        questions?: QuizQuestion[];
        error?: string;
      };
      if (!resp.ok) {
        throw new Error(data.error || `AI request failed (${resp.status}).`);
      }
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI request failed.";
      setErrorMessage(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }

  const handleSendQuestion = async (rawQuestion: string) => {
    const q = rawQuestion.trim();
    if (!q || isLoading) return;
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", text: q };
    const nextHistory = [...messages, userMsg];
    onPatchAiState({ questionDraft: "", messages: nextHistory });

    const data = await invokeAi("chat", {
      question: q,
      history: messages.map((m) => ({ role: m.role, text: m.text })),
    });
    if (data?.text) {
      onPatchAiState({
        messages: [
          ...nextHistory,
          { id: `a-${Date.now()}`, role: "assistant", text: data.text ?? "" },
        ],
      });
    }
  };

  const handleRunTool = async (mode: Exclude<AiToolMode, "chat">) => {
    onPatchAiState({ activeTool: mode });
    const data = await invokeAi(mode);
    if (!data) return;
    if (mode === "summarize") {
      onPatchAiState({ summaryText: data.text ?? "" });
    } else if (mode === "action-items") {
      onPatchAiState({ actionItemsText: data.text ?? "" });
    } else if (mode === "flashcards") {
      onPatchAiState({ flashcards: data.cards ?? [], flippedCards: [] });
    } else if (mode === "quiz") {
      onPatchAiState({ quizQuestions: data.questions ?? [], selectedAnswers: {} });
    }
  };

  const handleCopyText = async (key: string, text: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const quizScore = quizQuestions.reduce((acc, q, idx) => {
    return acc + (selectedAnswers[idx] === q.correctIndex ? 1 : 0);
  }, 0);
  const quizAnsweredCount = Object.keys(selectedAnswers).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top AI Mode Selector Bar */}
      <div
        className={`bg-white border-b border-slate-200 ${
          compact ? "p-3 space-y-2" : "px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-3"
        }`}
      >
        <div
          className="flex flex-wrap items-center gap-1 p-0.5 bg-slate-100 rounded-lg"
          role="tablist"
          aria-label="AI Studio tools"
        >
          {(
            [
              { id: "chat", label: "Ask PDF", icon: Send },
              { id: "summarize", label: "Summarize", icon: FileText },
              { id: "flashcards", label: "Flashcards", icon: Layers },
              { id: "quiz", label: compact ? "Quiz" : "Practice Quiz", icon: HelpCircle },
              { id: "action-items", label: compact ? "Actions" : "Action Items", icon: ListChecks },
            ] as { id: AiToolMode; label: string; icon: typeof Send }[]
          ).map(({ id, label, icon: Icon }) => {
            const active = tool === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  onPatchAiState({ activeTool: id });
                  setErrorMessage(null);
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  active ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <div className="text-[11px] text-slate-500 font-mono tabular-nums">
          Context: <strong className="text-slate-900">{pages.length}</strong>{" "}
          {pages.length === 1 ? "page" : "pages"} ready
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div
          role="alert"
          className="bg-red-50 border-b border-red-200 px-4 py-2.5 flex items-start gap-2 text-xs text-red-800"
        >
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">{errorMessage}</div>
        </div>
      )}

      {/* Main Content Area */}
      <div className={`flex-1 overflow-y-auto ${compact ? "p-3.5 bg-white" : "desk-surface p-5 lg:p-6"}`}>
        <div className={compact ? "space-y-4" : "max-w-4xl mx-auto"}>
          {/* 1. Ask PDF Chat */}
          {tool === "chat" && (
            <div
              className={`rounded-xl bg-white border border-slate-200 flex flex-col overflow-hidden ${
                compact ? "min-h-[420px]" : "min-h-[540px] max-h-[calc(100vh-11rem)]"
              }`}
            >
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Ask Your PDF</h2>
                  <p className="text-xs text-slate-500">
                    Answers stay synced with your live edited pages and citations.
                  </p>
                </div>
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onPatchAiState({ messages: [] })}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Clear chat</span>
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                {messages.length === 0 ? (
                  <div className="py-6 text-center space-y-3.5">
                    <p className="text-sm font-medium text-slate-800">
                      Ask a question about <span className="font-semibold">{documentTitle}</span>
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 max-w-2xl mx-auto">
                      {QUICK_PROMPTS.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          disabled={isLoading}
                          onClick={() => handleSendQuestion(prompt)}
                          className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-400 hover:bg-blue-50/40 hover:text-blue-800 transition-colors"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
                          m.role === "user"
                            ? "bg-slate-900 text-white"
                            : "bg-slate-50 border border-slate-200 text-slate-800"
                        }`}
                      >
                        {m.text}
                      </div>
                    </div>
                  ))
                )}

                {isLoading && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    <span>Analyzing document pages...</span>
                  </div>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendQuestion(questionInput);
                }}
                className="p-3 border-t border-slate-200 bg-slate-50/60 flex gap-2"
              >
                <label htmlFor="ai-question-input" className="sr-only">
                  Ask a question about this PDF
                </label>
                <input
                  id="ai-question-input"
                  type="text"
                  value={questionInput}
                  onChange={(e) => onPatchAiState({ questionDraft: e.target.value })}
                  disabled={isLoading}
                  placeholder="Ask anything about your PDF..."
                  className="flex-1 min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isLoading || !questionInput.trim()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors shrink-0"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Ask</span>
                </button>
              </form>
            </div>
          )}

          {/* 2. Summarize View */}
          {tool === "summarize" && (
            <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Document Summary</h2>
                  <p className="text-xs text-slate-500">
                    Key takeaways and formulas across all {pages.length} live pages.
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {summaryText && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleCopyText("summary", summaryText)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                      >
                        {copiedKey === "summary" ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span>{copiedKey === "summary" ? "Copied" : "Copy"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          triggerFileDownload(summaryText, "pdf-summary.md", "text/markdown")
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>.md</span>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleRunTool("summarize")}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileText className="h-3.5 w-3.5" />
                    )}
                    <span>{summaryText ? "Regenerate" : "Generate Summary"}</span>
                  </button>
                </div>
              </div>

              {summaryText ? (
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                  {summaryText}
                </div>
              ) : (
                <div className="py-10 text-center text-xs text-slate-500 border-t border-slate-100">
                  Click &ldquo;Generate Summary&rdquo; to synthesize key concepts and formulas from your PDF.
                </div>
              )}
            </div>
          )}

          {/* 3. Interactive Study Flashcards */}
          {tool === "flashcards" && (
            <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Study Flashcards</h2>
                  <p className="text-xs text-slate-500">
                    Click any card to flip between question and answer.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => handleRunTool("flashcards")}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Layers className="h-3.5 w-3.5" />
                  )}
                  <span>{flashcards.length > 0 ? "Regenerate" : "Generate Flashcards"}</span>
                </button>
              </div>

              {flashcards.length > 0 ? (
                <div className={compact ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 md:grid-cols-2 gap-4"}>
                  {flashcards.map((card, idx) => {
                    const flipped = flippedSet.has(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const next = new Set(flippedSet);
                          if (next.has(idx)) next.delete(idx);
                          else next.add(idx);
                          onPatchAiState({ flippedCards: Array.from(next) });
                        }}
                        className={`text-left rounded-xl border p-4 min-h-[120px] flex flex-col justify-between transition-colors ${
                          flipped
                            ? "border-blue-500 bg-blue-50/40"
                            : "border-slate-200 bg-slate-50/50 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 mb-2">
                          <span>{flipped ? "Answer" : `Card ${idx + 1}`}</span>
                          {card.pageRef && <span>{card.pageRef}</span>}
                        </div>
                        <p className="text-sm font-medium text-slate-900 leading-relaxed">
                          {flipped ? card.back : card.front}
                        </p>
                        <span className="mt-2.5 text-[11px] text-blue-600 font-medium">
                          {flipped ? "Click to show prompt" : "Click to reveal answer"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="py-10 text-center text-xs text-slate-500 border-t border-slate-100">
                  Click &ldquo;Generate Flashcards&rdquo; to turn your slides or notes into interactive study cards.
                </div>
              )}
            </div>
          )}

          {/* 4. Interactive Practice Quiz */}
          {tool === "quiz" && (
            <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Practice Quiz</h2>
                  <p className="text-xs text-slate-500">
                    Self-test comprehension with explanations grounded in your PDF.
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  {quizQuestions.length > 0 && quizAnsweredCount > 0 && (
                    <span className="text-xs font-mono font-semibold tabular-nums text-slate-800">
                      Score: {quizScore} / {quizQuestions.length}
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleRunTool("quiz")}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <HelpCircle className="h-3.5 w-3.5" />
                    )}
                    <span>{quizQuestions.length > 0 ? "New Quiz" : "Generate Quiz"}</span>
                  </button>
                </div>
              </div>

              {quizQuestions.length > 0 ? (
                <div className="space-y-4">
                  {quizQuestions.map((q, qIdx) => {
                    const chosen = selectedAnswers[qIdx];
                    const answered = chosen !== undefined;
                    return (
                      <div
                        key={qIdx}
                        className="rounded-xl border border-slate-200 p-3.5 space-y-2.5"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-xs sm:text-sm font-semibold text-slate-900">
                            {qIdx + 1}. {q.question}
                          </p>
                          {q.pageRef && (
                            <span className="text-[11px] font-mono text-slate-500 shrink-0">
                              {q.pageRef}
                            </span>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {q.options.map((opt, optIdx) => {
                            const isPicked = chosen === optIdx;
                            const isCorrect = q.correctIndex === optIdx;
                            let cls =
                              "border-slate-200 bg-white text-slate-800 hover:border-slate-400";
                            if (answered) {
                              if (isCorrect)
                                cls = "border-emerald-500 bg-emerald-50 text-emerald-950 font-medium";
                              else if (isPicked)
                                cls = "border-red-400 bg-red-50 text-red-900";
                            }
                            return (
                              <button
                                key={optIdx}
                                type="button"
                                onClick={() =>
                                  onPatchAiState({
                                    selectedAnswers: { ...selectedAnswers, [qIdx]: optIdx },
                                  })
                                }
                                className={`w-full text-left px-3 py-2 text-xs rounded-lg border transition-colors ${cls}`}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                        {answered && (
                          <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                            <strong className="text-slate-900">Explanation:</strong> {q.explanation}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-10 text-center text-xs text-slate-500 border-t border-slate-100">
                  Click &ldquo;Generate Quiz&rdquo; to create 5 practice questions directly from your PDF.
                </div>
              )}
            </div>
          )}

          {/* 5. Action Items & Deadlines */}
          {tool === "action-items" && (
            <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Action Items &amp; Deadlines
                  </h2>
                  <p className="text-xs text-slate-500">
                    Pull deliverables, assignments, and due dates from your PDF.
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {actionItemsText && (
                    <button
                      type="button"
                      onClick={() => handleCopyText("actions", actionItemsText)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                    >
                      {copiedKey === "actions" ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span>{copiedKey === "actions" ? "Copied" : "Copy"}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleRunTool("action-items")}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ListChecks className="h-3.5 w-3.5" />
                    )}
                    <span>{actionItemsText ? "Re-extract" : "Extract Action Items"}</span>
                  </button>
                </div>
              </div>

              {actionItemsText ? (
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                  {actionItemsText}
                </div>
              ) : (
                <div className="py-10 text-center text-xs text-slate-500 border-t border-slate-100">
                  Click &ldquo;Extract Action Items&rdquo; to list tasks, deliverables, and key dates from your PDF.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
