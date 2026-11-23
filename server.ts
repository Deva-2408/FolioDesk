import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === "production";

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function mapGeminiErrorStatus(message: string): number {
  if (message.includes("429") || message.includes("RESOURCE_EXHAUSTED")) return 429;
  if (
    message.includes("403") ||
    message.includes("PERMISSION_DENIED") ||
    message.includes("API_KEY_INVALID")
  ) {
    return 403;
  }
  return 502;
}

async function startServer() {
  const app = express();

  app.use(express.json({ limit: "35mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  // High-accuracy Vision OCR endpoint powered by Gemini
  app.post("/api/ocr", async (req, res) => {
    try {
      const {
        imageBase64,
        mimeType = "image/png",
        format = "markdown",
        languageHint = "",
      } = req.body ?? {};

      if (!imageBase64 || typeof imageBase64 !== "string") {
        res.status(400).json({ error: "Missing imageBase64 payload for OCR." });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            "Gemini API key is not configured on the server. Please add GEMINI_API_KEY in Settings > Secrets to use Vision OCR, or switch to Fast Embedded Text for digital PDFs.",
        });
        return;
      }

      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

      const formatInstruction =
        format === "plain"
          ? "Output clean, accurate plain text preserving paragraphs, line breaks, and column reading order. Do not add markdown fences or commentary."
          : "Output clean, structured Markdown preserving headings, bullet lists, tables (using standard Markdown table syntax), code blocks, and mathematical formulas (using LaTeX $...$ or $$...$$). Preserve multi-column reading order faithfully. Do not wrap the whole output in a markdown code block or add introductory commentary.";

      const langNote = languageHint ? ` Primary document language hint: ${languageHint}.` : "";

      const prompt = [
        "Perform high-accuracy OCR transcription on this document page image.",
        "Transcribe every word, number, symbol, header, footer, label, equation, and table cell faithfully without paraphrasing or inventing content.",
        "If any short region is genuinely illegible, mark it as [illegible].",
        formatInstruction,
        langNote,
      ]
        .filter(Boolean)
        .join(" ");

      let lastError: unknown = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: "gemini-4-hydrogen",
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: cleanBase64,
                  },
                },
                { text: prompt },
              ],
            },
            config: {
              thinkingConfig: {
                thinkingLevel: ThinkingLevel.LOW,
              },
            },
          });

          const text = (response.text ?? "").trim();
          res.json({
            text,
            wordCount: text ? text.split(/\s+/).filter(Boolean).length : 0,
            characterCount: text.length,
          });
          return;
        } catch (err) {
          lastError = err;
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 600));
          }
        }
      }

      const message =
        lastError instanceof Error ? lastError.message : "Vision OCR request failed.";
      res.status(mapGeminiErrorStatus(message)).json({ error: message });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected OCR server error.";
      res.status(500).json({ error: message });
    }
  });

  // AI Document Studio endpoint: summarize, flashcards, quiz, action-items, and document Q&A chat
  app.post("/api/ai", async (req, res) => {
    try {
      const {
        mode,
        documentText = "",
        documentTitle = "Loaded PDF",
        pageCount = 0,
        question = "",
        history = [],
        pageImageBase64 = "",
      } = req.body ?? {};

      const validModes = ["summarize", "flashcards", "quiz", "action-items", "chat"];
      if (!validModes.includes(mode)) {
        res.status(400).json({ error: "Invalid AI mode requested." });
        return;
      }

      const trimmedText = typeof documentText === "string" ? documentText.trim() : "";
      const hasImage = typeof pageImageBase64 === "string" && pageImageBase64.length > 50;

      if (!trimmedText && !hasImage) {
        res.status(400).json({
          error:
            "No readable text or page image found in the document. Run OCR on scanned pages first or upload a readable PDF.",
        });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            "Gemini API key is not configured on the server. Please add GEMINI_API_KEY in Settings > Secrets to use AI Studio capabilities.",
        });
        return;
      }

      // Trim extremely large PDFs conservatively to stay fast and responsive
      const boundedContext = trimmedText.slice(0, 90000);
      const docHeader = `Document: "${documentTitle}" (${pageCount} pages).\n\n${
        boundedContext
          ? `Extracted Document Content:\n${boundedContext}`
          : "(Scanned document without embedded text — analyze the attached page image.)"
      }`;

      const buildParts = (instruction: string) => {
        const parts: Array<
          { text: string } | { inlineData: { mimeType: string; data: string } }
        > = [];
        if (hasImage) {
          parts.push({
            inlineData: {
              mimeType: "image/png",
              data: pageImageBase64.replace(/^data:image\/\w+;base64,/, ""),
            },
          });
        }
        parts.push({ text: `${docHeader}\n\n${instruction}` });
        return { parts };
      };

      if (mode === "flashcards") {
        const response = await ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: buildParts(
            "Generate 6 to 10 high-yield study flashcards covering the most important definitions, formulas, concepts, and facts in this PDF. Cite the source page number when known.",
          ),
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                cards: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      front: { type: Type.STRING, description: "Question, term, or prompt." },
                      back: { type: Type.STRING, description: "Concise, accurate answer or formula." },
                      pageRef: { type: Type.STRING, description: "e.g. Page 2" },
                    },
                    required: ["front", "back"],
                  },
                },
              },
              required: ["cards"],
            },
          },
        });

        const parsed = JSON.parse((response.text ?? '{"cards":[]}').trim()) as {
          cards?: Array<{ front: string; back: string; pageRef?: string }>;
        };
        res.json({ mode, cards: parsed.cards ?? [] });
        return;
      }

      if (mode === "quiz") {
        const response = await ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: buildParts(
            "Create 5 challenging multiple-choice practice questions grounded strictly in this PDF. Provide exactly 4 options per question, the 0-based index of the correct option, and a brief explanation citing the page number.",
          ),
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                questions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      question: { type: Type.STRING },
                      options: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      correctIndex: { type: Type.INTEGER },
                      explanation: { type: Type.STRING },
                      pageRef: { type: Type.STRING },
                    },
                    required: ["question", "options", "correctIndex", "explanation"],
                  },
                },
              },
              required: ["questions"],
            },
          },
        });

        const parsed = JSON.parse((response.text ?? '{"questions":[]}').trim()) as {
          questions?: Array<{
            question: string;
            options: string[];
            correctIndex: number;
            explanation: string;
            pageRef?: string;
          }>;
        };
        res.json({ mode, questions: parsed.questions ?? [] });
        return;
      }

      let instruction = "";
      if (mode === "summarize") {
        instruction =
          "Provide a crisp, structured summary of this PDF for a student or working professional. Include: 1) Core Overview (2-3 sentences), 2) Key Takeaways & Concepts (bullet points with page references like [Page 2]), and 3) Key Formulas, Figures, or Terms if present.";
      } else if (mode === "action-items") {
        instruction =
          "Extract all actionable tasks, deadlines, requirements, deliverables, and key decisions from this PDF. Group them cleanly with page citations. If the document is academic lecture material, extract study tasks, assignments, exam topics, and office hours/deadlines.";
      } else {
        const safeHistory = Array.isArray(history)
          ? history
              .slice(-8)
              .map((m: { role?: string; text?: string }) =>
                `${m.role === "user" ? "User" : "Assistant"}: ${String(m.text ?? "")}`,
              )
              .join("\n")
          : "";
        if (!String(question ?? "").trim()) {
          res.status(400).json({ error: "Please enter a question about your PDF." });
          return;
        }
        instruction = [
          "Answer the user's question strictly using the provided PDF content. Cite page numbers like [Page 3] whenever referencing facts. If something is not in the document, state that clearly rather than inventing facts.",
          safeHistory ? `Conversation so far:\n${safeHistory}` : "",
          `User Question: ${String(question).trim()}`,
        ]
          .filter(Boolean)
          .join("\n\n");
      }

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: buildParts(instruction),
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      res.json({
        mode,
        text: (response.text ?? "").trim(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI request failed.";
      res.status(mapGeminiErrorStatus(message)).json({ error: message });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (_req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`FolioDesk server running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start FolioDesk server:", err);
  process.exit(1);
});
