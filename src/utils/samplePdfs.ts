import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { buildEncryptedSamplePdf } from "./pdfEncryptSample";

export type SampleDeckId =
  | "dark-lecture"
  | "research-handout"
  | "scanned-worksheet"
  | "encrypted-exam";

export const ENCRYPTED_SAMPLE_PASSWORD = "study2026";

/**
 * Generates real, valid multi-page PDF binaries in-browser so users can immediately
 * test reordering, merging, dark-slide color inversion, cropping, password unlocking, N-up imposition, and OCR.
 */
export async function generateSamplePdf(deckId: SampleDeckId): Promise<{
  name: string;
  bytes: Uint8Array;
}> {
  if (deckId === "dark-lecture") {
    return buildDarkLectureDeck();
  }
  if (deckId === "research-handout") {
    return buildResearchHandout();
  }
  if (deckId === "encrypted-exam") {
    return {
      name: "Encrypted_Exam_Solutions.pdf",
      bytes: buildEncryptedSamplePdf(ENCRYPTED_SAMPLE_PASSWORD),
    };
  }
  return buildScannedWorksheet();
}

async function buildDarkLectureDeck(): Promise<{ name: string; bytes: Uint8Array }> {
  const doc = await PDFDocument.create();
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontMono = await doc.embedFont(StandardFonts.Courier);

  const slides = [
    {
      kicker: "CS 410 · WEEK 04 LECTURE",
      title: "Fourier Transforms & Spectral Filtering",
      subtitle: "Discrete signals, fast algorithms, and frequency-domain design",
      bullets: [
        "Continuous vs. Discrete Fourier Transform (DFT) basis functions",
        "Cooley-Tukey divide-and-conquer radix-2 factorization",
        "Windowing artifacts, spectral leakage, and Hann weighting",
        "Practical applications in audio denoising & MRI reconstruction",
      ],
      formula: "X[k] = sum_{n=0}^{N-1} x[n] * exp(-i * 2*pi*k*n / N)",
      accent: rgb(0.38, 0.65, 0.98),
    },
    {
      kicker: "SLIDE 02 · COMPLEXITY",
      title: "Why FFT Drops Runtime from O(N^2) to O(N log N)",
      subtitle: "Exploiting symmetry and periodicity of complex roots of unity",
      bullets: [
        "Direct DFT matrix multiplication requires N^2 complex products",
        "Split input sequence x[n] into even indices and odd indices",
        "Combine sub-transforms using butterfly twiddle factors W_N^k",
        "For N = 65,536 samples: 4.29B ops -> 1.05M ops (~4,000x faster)",
      ],
      formula: "X[k] = E[k] + W_N^k * O[k]   |   X[k + N/2] = E[k] - W_N^k * O[k]",
      accent: rgb(0.2, 0.83, 0.6),
    },
    {
      kicker: "SLIDE 03 · SAMPLING THEOREM",
      title: "Nyquist Rate & Anti-Aliasing Filters",
      subtitle: "Preventing high-frequency folding during analog capture",
      bullets: [
        "Band-limited signal f_max requires sampling frequency f_s > 2 * f_max",
        "Undersampling mirrors frequencies above f_s/2 back into baseband",
        "Apply analog low-pass filter before ADC quantization stage",
        "CD audio standard: 44.1 kHz cleanly captures 20 Hz - 20 kHz",
      ],
      formula: "f_nyquist = f_s / 2   =>   alias(f) = |f - k * f_s|",
      accent: rgb(0.98, 0.75, 0.14),
    },
    {
      kicker: "SLIDE 04 · SPECTRAL LEAKAGE",
      title: "Window Functions & Main-Lobe Tradeoffs",
      subtitle: "Comparing Rectangular, Hann, Hamming, and Blackman windows",
      bullets: [
        "Finite observation length multiplies signal by rectangular pulse",
        "Multiplication in time equals convolution with sinc in frequency",
        "Tapering edges to zero suppresses side-lobe energy by 30-58 dB",
        "Tradeoff: wider main lobe lowers narrowband frequency resolution",
      ],
      formula: "w_hann[n] = 0.5 * (1 - cos(2*pi*n / (N - 1)))",
      accent: rgb(0.75, 0.52, 0.99),
    },
    {
      kicker: "SLIDE 05 · CONVOLUTION",
      title: "Fast Linear Convolution via Zero-Padding",
      subtitle: "Replacing time-domain FIR sweeps with pointwise products",
      bullets: [
        "Circular convolution in DFT domain wraps tail samples around",
        "Zero-pad both x[n] (len L) and h[n] (len M) to N >= L + M - 1",
        "Compute IFFT(FFT(x) * FFT(h)) in O(N log N) operations",
        "Overlap-Add & Overlap-Save stream infinite real-time audio",
      ],
      formula: "y[n] = (x * h)[n]  <==>  Y[k] = X[k] * H[k]",
      accent: rgb(0.98, 0.44, 0.52),
    },
    {
      kicker: "SLIDE 06 · EXAM CHECKLIST",
      title: "Problem Set 04 & Midterm Review Topics",
      subtitle: "Submit PDF solutions on Canvas by Friday 11:59 PM",
      bullets: [
        "Derive the 8-point radix-2 decimation-in-time butterfly diagram",
        "Calculate exact SNR gain for 4x oversampling with noise shaping",
        "Design a 31-tap FIR low-pass filter using Hamming windowing",
        "Office hours: Tue/Thu 2:00-4:00 PM in Gates Hall Room 214",
      ],
      formula: "SNR_dB = 6.02 * B + 1.76 + 10 * log10(OSR)",
      accent: rgb(0.22, 0.74, 0.97),
    },
  ];

  // Landscape 16:9-ish lecture slide (720 x 450 pt) with deep black/charcoal background
  const W = 720;
  const H = 450;

  slides.forEach((s, idx) => {
    const page = doc.addPage([W, H]);

    // Deep dark background (ideal for demonstrating black -> white color inversion!)
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(0.06, 0.08, 0.12) });

    // Subtle top accent bar
    page.drawRectangle({ x: 44, y: H - 46, width: 48, height: 4, color: s.accent });

    page.drawText(s.kicker, {
      x: 44,
      y: H - 72,
      size: 11,
      font: fontBold,
      color: s.accent,
    });

    page.drawText(s.title, {
      x: 44,
      y: H - 108,
      size: 24,
      font: fontBold,
      color: rgb(0.97, 0.98, 1),
    });

    page.drawText(s.subtitle, {
      x: 44,
      y: H - 134,
      size: 13,
      font: fontRegular,
      color: rgb(0.68, 0.74, 0.84),
    });

    // Divider line
    page.drawLine({
      start: { x: 44, y: H - 152 },
      end: { x: W - 44, y: H - 152 },
      thickness: 1,
      color: rgb(0.2, 0.25, 0.34),
    });

    // Bullet points
    s.bullets.forEach((bullet, bIdx) => {
      const y = H - 188 - bIdx * 36;
      page.drawCircle({ x: 52, y: y + 4, size: 3.5, color: s.accent });
      page.drawText(bullet, {
        x: 68,
        y,
        size: 13.5,
        font: fontRegular,
        color: rgb(0.9, 0.93, 0.97),
      });
    });

    // Formula callout panel
    page.drawRectangle({
      x: 44,
      y: 44,
      width: W - 88,
      height: 52,
      color: rgb(0.11, 0.14, 0.21),
      borderColor: rgb(0.24, 0.3, 0.42),
      borderWidth: 1,
    });

    page.drawText(s.formula, {
      x: 62,
      y: 65,
      size: 12.5,
      font: fontMono,
      color: rgb(0.96, 0.97, 1),
    });

    // Slide index footer
    page.drawText(`Slide ${idx + 1} / ${slides.length}`, {
      x: W - 110,
      y: 18,
      size: 10,
      font: fontMono,
      color: rgb(0.55, 0.62, 0.72),
    });
  });

  return {
    name: "CS410_Dark_Lecture_Slides.pdf",
    bytes: await doc.save(),
  };
}

async function buildResearchHandout(): Promise<{ name: string; bytes: Uint8Array }> {
  const doc = await PDFDocument.create();
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontMono = await doc.embedFont(StandardFonts.Courier);

  const W = 612;
  const H = 792;

  const sections = [
    {
      header: "QUICK REFERENCE SHEET · PART 1",
      title: "Linear Algebra & Signal Processing Identities",
      items: [
        "1. Parseval's Theorem: Energy in time equals energy in frequency.",
        "   sum |x[n]|^2 = (1/N) * sum |X[k]|^2",
        "",
        "2. Time Shift Property: Delaying by n_0 multiplies phase linearly.",
        "   x[n - n_0]  <==>  X[k] * exp(-i * 2*pi*k*n_0 / N)",
        "",
        "3. Hermitian Symmetry for Real Signals:",
        "   X[N - k] = conj(X[k])  ->  Magnitude is even, Phase is odd",
        "",
        "4. Eigenvalues of Circulant Matrices:",
        "   Every N x N circulant matrix is diagonalized by the DFT matrix F.",
      ],
    },
    {
      header: "QUICK REFERENCE SHEET · PART 2",
      title: "Filter Design Specifications & Cutoff Tables",
      items: [
        "Window Type       | Main-Lobe Width | Peak Side-Lobe | Stopband Atten.",
        "---------------------------------------------------------------------",
        "Rectangular       | 4*pi / N        | -13 dB         | -21 dB",
        "Bartlett          | 8*pi / N        | -25 dB         | -25 dB",
        "Hann              | 8*pi / N        | -31 dB         | -44 dB",
        "Hamming           | 8*pi / N        | -41 dB         | -53 dB",
        "Blackman          | 12*pi / N       | -57 dB         | -74 dB",
        "",
        "Design Rule of Thumb:",
        "Choose Hamming for general speech/audio; Blackman for wide dynamic range.",
      ],
    },
    {
      header: "QUICK REFERENCE SHEET · PART 3",
      title: "Worked Practice Problem — 4-Point DFT",
      items: [
        "Given discrete sequence x[n] = [1, 2, 0, -1], compute X[k]:",
        "",
        "X[0] = 1 + 2 + 0 + (-1) = 2",
        "X[1] = 1 - 2i - 0 + (-1)i = 1 - 3i",
        "X[2] = 1 - 2 + 0 - (-1) = 0",
        "X[3] = 1 + 2i - 0 - (-1)i = 1 + 3i",
        "",
        "Verification via Parseval's Identity:",
        "Time Energy = 1^2 + 2^2 + 0^2 + (-1)^2 = 6",
        "Freq Energy = (1/4) * (4 + 10 + 0 + 10) = 24 / 4 = 6  [Verified]",
      ],
    },
  ];

  sections.forEach((sec, idx) => {
    const page = doc.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) });
    page.drawRectangle({ x: 48, y: H - 64, width: W - 96, height: 2, color: rgb(0.15, 0.39, 0.92) });

    page.drawText(sec.header, {
      x: 48,
      y: H - 52,
      size: 10,
      font: fontBold,
      color: rgb(0.15, 0.39, 0.92),
    });

    page.drawText(sec.title, {
      x: 48,
      y: H - 104,
      size: 20,
      font: fontBold,
      color: rgb(0.06, 0.09, 0.16),
    });

    sec.items.forEach((line, i) => {
      page.drawText(line, {
        x: 48,
        y: H - 152 - i * 26,
        size: 11.5,
        font: line.includes("|") || line.startsWith("   ") || line.startsWith("X[") ? fontMono : fontRegular,
        color: rgb(0.15, 0.2, 0.28),
      });
    });

    page.drawText(`Handout Page ${idx + 1} of ${sections.length}`, {
      x: 48,
      y: 36,
      size: 9.5,
      font: fontMono,
      color: rgb(0.45, 0.5, 0.58),
    });
  });

  return {
    name: "Signal_Processing_Formula_Sheet.pdf",
    bytes: await doc.save(),
  };
}

/**
 * Builds an image-only (scanned-style) PDF with NO embedded text layer,
 * specifically for testing high-accuracy Vision OCR.
 */
async function buildScannedWorksheet(): Promise<{ name: string; bytes: Uint8Array }> {
  const doc = await PDFDocument.create();
  const W = 612;
  const H = 792;

  const pagesData = [
    {
      heading: "BIOCHEMISTRY LAB REPORT — EXPERIMENT 07",
      meta: "Date: November 14, 2026   |   Lab Bench: B-12   |   Instructor: Dr. R. Patel",
      body: [
        "Objective: Determine the Michaelis-Menten kinetic constants (Km and Vmax)",
        "for alkaline phosphatase using p-nitrophenyl phosphate (pNPP) at pH 9.5.",
        "",
        "Observed Spectrophotometry Readings (405 nm):",
        "  [S] (mM)    Initial Velocity v0 (uM/min)    1/[S]       1/v0",
        "  0.25        18.4                            4.00        0.0543",
        "  0.50        29.8                            2.00        0.0336",
        "  1.00        44.2                            1.00        0.0226",
        "  2.50        61.5                            0.40        0.0163",
        "  5.00        70.9                            0.20        0.0141",
        "",
        "Derived Lineweaver-Burk Regression:",
        "  Vmax = 83.3 uM/min   |   Km = 0.89 mM   |   R^2 = 0.9984",
      ],
    },
    {
      heading: "POST-LAB DISCUSSION & ERROR ANALYSIS",
      meta: "Page 2 of 2   |   Scanned Archive Copy",
      body: [
        "1. Substrate Depletion Check:",
        "   Less than 4.2% of initial substrate was consumed during the 90-second",
        "   linear assay window, confirming valid initial-velocity assumptions.",
        "",
        "2. Competitive Inhibition Follow-Up:",
        "   Adding 2.0 mM inorganic phosphate increased apparent Km to 2.14 mM",
        "   while Vmax remained statistically unchanged at 82.7 uM/min.",
        "",
        "Conclusion:",
        "   Inorganic phosphate acts as a classical competitive inhibitor with",
        "   estimated inhibition constant Ki = 1.42 mM.",
      ],
    },
  ];

  for (const pData of pagesData) {
    // Render to offscreen canvas as a realistic scanned page image (no selectable PDF text!)
    const canvas = document.createElement("canvas");
    canvas.width = 1224;
    canvas.height = 1584;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    // Warm paper scan tint
    ctx.fillStyle = "#faf8f2";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle scanner border frame
    ctx.strokeStyle = "#d6d3c8";
    ctx.lineWidth = 4;
    ctx.strokeRect(56, 56, canvas.width - 112, canvas.height - 112);

    ctx.fillStyle = "#1c1917";
    ctx.font = "bold 34px Georgia, serif";
    ctx.fillText(pData.heading, 96, 150);

    ctx.fillStyle = "#57534e";
    ctx.font = "22px monospace";
    ctx.fillText(pData.meta, 96, 200);

    ctx.strokeStyle = "#44403c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(96, 224);
    ctx.lineTo(canvas.width - 96, 224);
    ctx.stroke();

    ctx.fillStyle = "#1c1917";
    pData.body.forEach((line, idx) => {
      const isTable = line.startsWith("  ");
      ctx.font = isTable ? "24px monospace" : "26px Georgia, serif";
      ctx.fillText(line, 96, 290 + idx * 54);
    });

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
    if (!blob) continue;
    const pngBytes = new Uint8Array(await blob.arrayBuffer());
    const img = await doc.embedPng(pngBytes);
    const page = doc.addPage([W, H]);
    page.drawImage(img, { x: 0, y: 0, width: W, height: H });
  }

  return {
    name: "Scanned_Lab_Worksheet.pdf",
    bytes: await doc.save(),
  };
}
