import type { InvertMode } from "../types/pdf";

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }

  return [h, s, l];
}

function hueToRgb(p: number, q: number, t: number): number {
  let tn = t;
  if (tn < 0) tn += 1;
  if (tn > 1) tn -= 1;
  if (tn < 1 / 6) return p + (q - p) * 6 * tn;
  if (tn < 1 / 2) return q;
  if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    Math.round(hueToRgb(p, q, h) * 255),
    Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  ];
}

/**
 * Applies pixel-level color inversion directly on an RGBA buffer (in-place).
 * - 'standard': Full RGB inversion (black -> white, white -> black)
 * - 'smart-light': Inverts lightness while preserving hue (ideal for dark code/lecture slides)
 * - 'ink-saver': Inverted high-contrast grayscale with white paper snap (ideal for printing)
 */
export function applyColorTransformInPlace(
  rgba: Uint8ClampedArray,
  mode: InvertMode,
): Uint8ClampedArray {
  if (mode === "none") return rgba;

  if (mode === "standard") {
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 255 - rgba[i];
      rgba[i + 1] = 255 - rgba[i + 1];
      rgba[i + 2] = 255 - rgba[i + 2];
    }
    return rgba;
  }

  if (mode === "smart-light") {
    for (let i = 0; i < rgba.length; i += 4) {
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
      const [h, s, l] = rgbToHsl(r, g, b);
      let invL = 1 - l;
      // Snap dark low-chroma slide backgrounds (e.g. #000, #0f172a, #18181b) cleanly to pure white
      if (invL > 0.85 && chroma < 0.14) {
        rgba[i] = 255;
        rgba[i + 1] = 255;
        rgba[i + 2] = 255;
        continue;
      }
      const [nr, ng, nb] = hslToRgb(h, invL > 0.96 ? 0 : s, invL);
      rgba[i] = nr;
      rgba[i + 1] = ng;
      rgba[i + 2] = nb;
    }
    return rgba;
  }

  // 'ink-saver': luminance-inverted high-contrast print mode
  for (let i = 0; i < rgba.length; i += 4) {
    const lum = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
    let inv = 255 - lum;
    // Push light-gray backgrounds to crisp white so printers use zero background toner
    if (inv >= 205) {
      inv = 255;
    } else if (inv <= 55) {
      inv = 15;
    } else {
      // Stretch mid-tones for crisp readable text & diagrams
      inv = Math.round(((inv - 55) / 150) * 240 + 15);
    }
    const clamped = Math.max(0, Math.min(255, inv));
    rgba[i] = clamped;
    rgba[i + 1] = clamped;
    rgba[i + 2] = clamped;
  }

  return rgba;
}

/**
 * Returns CSS filter preview approximation for instant thumbnails while full canvas export
 * uses exact pixel-level applyColorTransformInPlace.
 */
export function getPreviewCssFilter(mode: InvertMode): string {
  switch (mode) {
    case "standard":
      return "invert(1)";
    case "smart-light":
      return "invert(1) hue-rotate(180deg) brightness(1.06) contrast(1.04)";
    case "ink-saver":
      return "invert(1) grayscale(1) contrast(1.35) brightness(1.12)";
    default:
      return "none";
  }
}
