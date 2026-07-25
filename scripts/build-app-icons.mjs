/**
 * build-app-icons.mjs
 * --------------------------------------------------------------------------
 * One-shot generator for quad's production app icon, splash, adaptive icon,
 * and favicon. Renders SVG compositions of the brand mark (a 2x2 grid with
 * a diagonal navy/gold checker) + the "quad" wordmark, then rasterizes them
 * to PNG via `sharp`.
 *
 * Brand spec (BRAND_AND_UX.pdf, section 3 "Visual identity"):
 *   - Cream  #FBF8F1  (canvas / splash bg)
 *   - Navy   #0C2340  (mark primary, wordmark)
 *   - Gold   #C99700  (mark accent — "at least one square gold-filled")
 *   - Mark   = 2x2 grid, diagonal checker (matches components/logo.tsx)
 *   - Word   = extra-bold sans, tracked tight (-1pt at display sizes)
 *   - Splash = wordmark centered on cream, no animation, static.
 *
 * Outputs (all overwrite):
 *   assets/icon.png             1024x1024  opaque cream square
 *   assets/adaptive-icon.png    1024x1024  transparent, mark in 66% safe-zone
 *   assets/splash-icon.png      1024x1024  transparent, mark + wordmark
 *   assets/favicon.png            48x48    opaque cream square, mark only
 *
 * Run once:   node scripts/build-app-icons.mjs
 * --------------------------------------------------------------------------
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const outDir = resolve(repoRoot, 'assets');
mkdirSync(outDir, { recursive: true });

// ---- Brand tokens --------------------------------------------------------
const CREAM = '#FBF8F1';
const NAVY = '#0C2340';
const GOLD = '#C99700';

// System sans family stack. sharp/librsvg falls back to whatever the host
// has; on Windows that is typically Segoe UI Variable / Segoe UI. We pin
// the weight to 800 and tighten letter-spacing to match the in-app
// NamePlaque (components/logo.tsx letterSpacing -1.2 at display sizes).
const FONT_STACK =
  "'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif";

/**
 * Draw the 2x2 brand mark as an SVG <g>, positioned via (x,y) with overall
 * size `s`. Cell shape matches components/logo.tsx: gap = 14% of size,
 * corner radius = 22% of cell size, diagonal checker (TL & BR = navy,
 * TR & BL = gold).
 */
function markSvg({ x, y, size, primary = NAVY, accent = GOLD }) {
  const gap = size * 0.14;
  const cell = (size - gap) / 2;
  const r = cell * 0.22;
  const x2 = x + cell + gap;
  const y2 = y + cell + gap;
  return `
    <g>
      <rect x="${x}"  y="${y}"  width="${cell}" height="${cell}" rx="${r}" ry="${r}" fill="${primary}"/>
      <rect x="${x2}" y="${y}"  width="${cell}" height="${cell}" rx="${r}" ry="${r}" fill="${accent}"/>
      <rect x="${x}"  y="${y2}" width="${cell}" height="${cell}" rx="${r}" ry="${r}" fill="${accent}"/>
      <rect x="${x2}" y="${y2}" width="${cell}" height="${cell}" rx="${r}" ry="${r}" fill="${primary}"/>
    </g>
  `;
}

/**
 * Render an SVG string to PNG at the given pixel size.
 */
async function renderSvg(svg, outPath, { size, background = null }) {
  const pipeline = sharp(Buffer.from(svg), { density: 384 }).resize(size, size, {
    fit: 'contain',
    background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (background) {
    pipeline.flatten({ background });
  }
  const buf = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(outPath, buf);
  console.log(`  wrote ${outPath.replace(repoRoot, '.')}  (${buf.length.toLocaleString()} bytes)`);
}

// ---- 1) icon.png — 1024x1024 opaque cream square ------------------------
// iOS/Android apply their own corner masks, so the source should be a
// flat, opaque square. Per the brand spec, "Use the mark on app icon,
// splash, and as a 26pt-tall NamePlaque inside every screen header."
// The mark alone is most legible at home-screen sizes; the wordmark is
// reserved for the splash and in-app headers.
async function buildIcon() {
  const S = 1024;
  // Inset the mark ~ 18% on each side for comfortable corner-mask padding.
  const inset = S * 0.18;
  const markSize = S - inset * 2;
  const x = inset;
  const y = inset;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" fill="${CREAM}"/>
  ${markSvg({ x, y, size: markSize })}
</svg>`;
  await renderSvg(svg, resolve(outDir, 'icon.png'), {
    size: S,
    background: { r: 0xfb, g: 0xf8, b: 0xf1, alpha: 1 },
  });
}

// ---- 2) adaptive-icon.png — 1024x1024 foreground, transparent bg --------
// Android adaptive icon: foreground layer must keep its content within a
// centered circle of diameter 66% of the canvas (the safe zone). We use
// the brand mark only — the wordmark would be too small to read inside
// the masked region. Background color is set in app.json to cream.
async function buildAdaptiveIcon() {
  const S = 1024;
  const safeDiameter = S * 0.66; // 676
  // The mark is a square. To fit inside the safe circle we cap its size
  // at safeDiameter / sqrt(2) so the corners stay inside the circle.
  const markSize = Math.floor(safeDiameter / Math.SQRT2); // ~ 478
  const x = (S - markSize) / 2;
  const y = (S - markSize) / 2;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  ${markSvg({ x, y, size: markSize })}
</svg>`;
  await renderSvg(svg, resolve(outDir, 'adaptive-icon.png'), { size: S });
}

// ---- 3) splash-icon.png — mark above wordmark, centered, transparent ---
// expo-splash-screen uses resizeMode "contain": the image is scaled to
// fit within the screen while preserving its aspect. We use a square
// 1024x1024 transparent canvas so it centers on any device. Composition
// is the brand mark stacked above the "quad" wordmark — vertical layout
// avoids needing to measure the wordmark's actual em-width, and reads
// well at the typical 200px-wide splash render that expo emits.
async function buildSplashIcon() {
  const S = 1024;
  const markSize = 380;
  const wordSize = 240;
  const gap = 56;
  const totalH = markSize + gap + wordSize;
  const groupY = (S - totalH) / 2;
  const markX = (S - markSize) / 2;
  const wordY = groupY + markSize + gap + wordSize * 0.5;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  ${markSvg({ x: markX, y: groupY, size: markSize })}
  <text x="${S / 2}" y="${wordY}"
        font-family="${FONT_STACK}"
        font-weight="800"
        font-size="${wordSize}"
        letter-spacing="-14"
        fill="${NAVY}"
        dominant-baseline="central"
        text-anchor="middle">quad</text>
</svg>`;
  await renderSvg(svg, resolve(outDir, 'splash-icon.png'), { size: S });
}

// ---- 4) favicon.png — 48x48 opaque cream square -------------------------
// The wordmark is unreadable at 48px; show the mark only on a cream tile.
async function buildFavicon() {
  const S = 48;
  // Render the SVG at 1024 then resize for crisp anti-aliasing.
  const big = 1024;
  const markSize = big * 0.72;
  const x = (big - markSize) / 2;
  const y = (big - markSize) / 2;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${big}" height="${big}" viewBox="0 0 ${big} ${big}">
  <rect width="${big}" height="${big}" fill="${CREAM}"/>
  ${markSvg({ x, y, size: markSize })}
</svg>`;
  await renderSvg(svg, resolve(outDir, 'favicon.png'), {
    size: S,
    background: { r: 0xfb, g: 0xf8, b: 0xf1, alpha: 1 },
  });
}

console.log('quad — building production app icons + splash...');
await buildIcon();
await buildAdaptiveIcon();
await buildSplashIcon();
await buildFavicon();
console.log('done.');
