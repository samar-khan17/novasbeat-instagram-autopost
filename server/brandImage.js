// ═══════════════════════════════════════════════════════════════════
// NewsPost Auto — NovasBeat social post generator v4
// Design system shared across Instagram (1080×1080) and Facebook
// (1200×630) — same brand tokens, typography, safe-fitting logic.
// Method: Sharp + SVG compositing — no browser required
// ═══════════════════════════════════════════════════════════════════
import axios from 'axios';
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadBufferToSupabase } from './supabaseStorage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Canvas dimensions — Instagram (square, primary format) ────────
const W      = 1080;
const H      = 1080;
const HERO_H = 560;
const PAD_X  = 40;
const AVAIL  = W - PAD_X * 2;  // 1000px usable text width

// ── Canvas dimensions — Facebook (landscape, link/photo post) ─────
const FB_W      = 1200;
const FB_H      = 630;
const FB_HERO_W = 620;         // hero photo occupies left ~52%
const FB_PAD    = 44;
const FB_AVAIL  = FB_W - FB_HERO_W - FB_PAD * 2; // text column width

// ── Shared minimums (safe-area validation) ─────────────────────────
const MIN_FOOTER_H = 90;  // footer must always keep at least this much room

// ── Font families (best system equivalents for Poppins / Inter) ───
const FP = "'Arial Black','Segoe UI Black',Impact,sans-serif";
const FI = "'Arial','Segoe UI',Helvetica,sans-serif";

// ── Helpers ───────────────────────────────────────────────────────
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function makeSummary(body, maxLen = 180) {
  if (!body) return '';
  const clean = String(body).replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  const sents = clean.match(/[^.!?]+[.!?]+/g) || [];
  let out = '';
  for (const s of sents) {
    if ((out + s).length > maxLen) break;
    out += s + ' ';
  }
  return (out.trim() || clean.slice(0, maxLen)) + '…';
}

function wrapText(text, maxChars, maxLines = 2) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (lines.length >= maxLines) break;
    const cand = line ? `${line} ${w}` : w;
    if (cand.length > maxChars && line) { lines.push(line); line = w; }
    else line = cand;
  }
  if (line && lines.length < maxLines) lines.push(line);
  const wordsUsed = lines.join(' ').split(/\s+/).filter(Boolean).length;
  if (wordsUsed < words.length && lines.length) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/[.,;:]+$/, '') + '…';
  }
  return lines.slice(0, maxLines);
}

// ── Real per-character width table for headline fitting ──────────────
// Flat char-count × 0.60 ratios badly underestimate wide-letter-heavy
// headlines (M/W/O/Q/G/D/H/U/N/B/R/K), whose rendered width then exceeds
// the available width and gets silently clipped by the SVG's own canvas
// bounds. This table (em-units, Arial Black bold uppercase reference)
// fixes that — used by BOTH the Instagram and Facebook renderers.
const NARROW_CHARS = new Set('IJLil1.,:;\'|! '.split(''));
const WIDE_CHARS    = new Set('MWOQGDHUNBRK%@'.split(''));
function charWidthEm(ch) {
  if (NARROW_CHARS.has(ch)) return 0.42;
  if (WIDE_CHARS.has(ch))   return 0.82;
  return 0.66; // medium — most letters/digits
}
function textWidthPx(text, fontSize) {
  let em = 0;
  for (const ch of String(text || '').toUpperCase()) em += charWidthEm(ch);
  return em * fontSize;
}

// Iteratively find the largest font size (maxFs→minFs) at which BOTH
// headline lines actually fit `avail` width using real per-char
// measurement — guarantees no silent SVG-boundary clipping.
function headlineFontSize(line1, line2, avail, maxFs = 54, minFs = 26) {
  const l1 = String(line1 || ''), l2 = String(line2 || '');
  if (!l1 && !l2) return maxFs;
  for (let fs = maxFs; fs >= minFs; fs--) {
    if (textWidthPx(l1, fs) <= avail && textWidthPx(l2, fs) <= avail) return fs;
  }
  return minFs;
}

// If a headline line still doesn't fit `avail` even at minFs (e.g. one
// very long word-heavy line), split it into two so nothing ever renders
// past the canvas edge. Returns an array of 1-2 lines.
function fitOrSplitLine(line, fontSize, avail) {
  const text = String(line || '');
  if (!text || textWidthPx(text, fontSize) <= avail) return [text];
  const words = text.split(/\s+/);
  if (words.length < 2) return [text]; // single unsplittable word — let it be, rare
  let best = 1;
  for (let i = 1; i < words.length; i++) {
    const head = words.slice(0, i).join(' ');
    if (textWidthPx(head, fontSize) <= avail) best = i; else break;
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

function buildHeadlineLines(line1, line2, avail, maxFs = 54, minFs = 26) {
  const fs = headlineFontSize(line1, line2, avail, maxFs, minFs);
  const lines = [
    ...fitOrSplitLine(line1, fs, avail).map(t => ({ text: t, grad: false })),
    ...fitOrSplitLine(line2, fs, avail).map(t => ({ text: t, grad: true })),
  ].filter(l => l.text).slice(0, 4);
  return { fs, lines };
}

// ── Icon paths: 24×24 viewBox, filled white ────────────────────────
const ICON_PATHS = {
  law:    'M12 2L4 7v2h16V7l-8-5zM4 21h16v-2H4v2zm2-9h2v6H6v-6zm4 0h2v6h-2v-6zm4 0h2v6h-2v-6zm4 0h2v6h-2v-6z',
  shield: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z',
  people: 'M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  chart:  'M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z',
  globe:  'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
  fire:   'M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z',
  clock:  'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z',
  star:   'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
};
const ARROW_PATH = 'M4 11v2h12l-5.5 5.5 1.42 1.42L19.84 12l-7.92-7.92L10.5 5.5 16 11H4z';

function getIconPath(type) {
  return ICON_PATHS[String(type || 'star').toLowerCase()] || ICON_PATHS.star;
}

// ── Real logo, fetched once and cached in memory ────────────────────
// The site's logo changed (stylized "NB" monogram, replacing the old
// plain "N"). Rather than hand-drawing letterforms in SVG — which goes
// stale the next time the logo changes — embed the actual live icon as
// a base64 <image>. Fetched lazily on first render, cached for the life
// of the process; falls back to a plain purple square (no letterform)
// if the fetch ever fails, so a render never crashes on this.
let _logoDataUriPromise = null;
async function getLogoDataUri() {
  if (!_logoDataUriPromise) {
    _logoDataUriPromise = (async () => {
      try {
        const dl = await axios.get('https://novasbeat.com/images/novasbeat-icon-512.png', {
          responseType: 'arraybuffer', timeout: 15000,
        });
        const png = await sharp(Buffer.from(dl.data)).resize(160, 160).png().toBuffer();
        return `data:image/png;base64,${png.toString('base64')}`;
      } catch (e) {
        console.warn('[brandImage] Logo fetch FAILED:', e.message, '→ using plain purple mark');
        return null;
      }
    })();
  }
  return _logoDataUriPromise;
}

// Brand mark: rounded-square clipped logo image if available, else a
// plain purple square (never blocks rendering on a failed fetch).
function logoMarkSvg(x, y, size, logoUri, radius) {
  const clipId = `logoClip${x}_${y}`;
  if (logoUri) {
    return `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}"/></clipPath>
  <image href="${logoUri}" x="${x}" y="${y}" width="${size}" height="${size}" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice"/>`;
  }
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" fill="url(#purpGrad)"/>`;
}

// ── Shared gradient/def block (identical brand tokens on both formats) ─
function defsBlock(padX, w) {
  return `
  <linearGradient id="purpGrad" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#8A5CF6"/>
    <stop offset="100%" stop-color="#A855F7"/>
  </linearGradient>
  <linearGradient id="hl2Grad" x1="${padX}" y1="0" x2="${w - padX}" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0%"   stop-color="#8A5CF6"/>
    <stop offset="100%" stop-color="#60A5FA"/>
  </linearGradient>
  <linearGradient id="ftGrad" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%"   stop-color="#6d3fd1"/>
    <stop offset="45%"  stop-color="#8A5CF6"/>
    <stop offset="100%" stop-color="#A855F7"/>
  </linearGradient>`;
}

// ── Debug overlay (canvas boundary + safe area) — dev only, never
// included unless opts.debug === true. Renders on top of everything. ──
function debugOverlay(w, h, padX, safeTop, safeBot) {
  return `
  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="#FF00FF" stroke-width="2"/>
  <rect x="${padX}" y="${safeTop}" width="${w - padX * 2}" height="${safeBot - safeTop}"
        fill="none" stroke="#00FF00" stroke-width="2" stroke-dasharray="8,6"/>
  <text x="8" y="18" font-family="monospace" font-size="12" fill="#FF00FF">DEBUG: canvas ${w}×${h}</text>
  <text x="${padX}" y="${safeTop - 6}" font-family="monospace" font-size="12" fill="#00FF00">safe area</text>`;
}

// ═══════════════════════════════════════════════════════════════════
// INSTAGRAM (1080×1080) — standard + breaking layouts
// ═══════════════════════════════════════════════════════════════════
function buildSvg({ line1, line2, description, category, keyPoints, isBreaking = false, debug = false, logoUri = null }) {
  const { fs: HL_FS, lines: hlLines } = buildHeadlineLines(line1, line2, AVAIL, isBreaking ? 60 : 54, isBreaking ? 32 : 26);
  const HL_LH = Math.round(HL_FS * 1.05);

  const descLines = wrapText(String(description || ''), 68, 2);
  const DESC_FS  = 19;
  const DESC_LH  = Math.round(DESC_FS * 1.5);

  const KP = Array.isArray(keyPoints) && keyPoints.length >= 3 ? keyPoints.slice(0, 3) : [
    { title: 'Breaking Update', desc: 'Major development unfolding',    icon: 'fire'   },
    { title: 'Global Impact',   desc: 'Worldwide attention & reaction', icon: 'globe'  },
    { title: 'Analysis',        desc: 'In-depth coverage & context',   icon: 'people' },
  ];

  // Text cluster anchors at the same Y the old hard hero/content split
  // used to sit at — but the photo now runs full-bleed behind it (no
  // solid-color block), so this is purely a layout constant now, not a
  // literal boundary between "photo zone" and "UI zone".
  const TXT_ANCHOR = HERO_H;
  let HL_TOP = TXT_ANCHOR + 24;
  const HL_BASE = Math.round(HL_FS * 0.82);
  let HL_BOT = HL_TOP + HL_LH * hlLines.length;

  // ── Automatic layout validation ─────────────────────────────────
  // Breaking-news posts skip the icon cards (phase-13 dedicated
  // treatment — headline dominant, less clutter) but keep ONE short
  // supporting line, not zero — an empty content area just dumps all
  // the leftover space into a giant blank footer, which looks broken
  // in the other direction. Standard posts try description+cards, but
  // if the resulting footer would be squeezed below MIN_FOOTER_H, drop
  // cards first, then trim description to 1 line — footer never
  // collapses or overflows either way.
  let showCards = !isBreaking;
  let descLinesUsed = isBreaking ? wrapText(String(description || ''), 72, 1) : descLines;

  function cascade(withCards, descCount) {
    const DESC_TOP = HL_BOT + 22;
    const DESC_BOT = descCount ? DESC_TOP + DESC_LH * descCount : HL_BOT;
    const ICO_TOP = DESC_BOT + (withCards ? 26 : 0);
    const ICO_H   = withCards ? 76 : 0;
    const ICO_BOT = ICO_TOP + ICO_H;
    const META_Y   = ICO_BOT + (withCards ? 22 : 30);
    const META_TOP = META_Y + 18;
    const BTN_H  = 41;
    const META_BOT = META_TOP + BTN_H;
    const FT_Y  = META_BOT + 20;
    return { DESC_TOP, DESC_BOT, ICO_TOP, ICO_H, ICO_BOT, META_Y, META_TOP, BTN_H, META_BOT, FT_Y };
  }

  let C = cascade(showCards, descLinesUsed.length);
  if (H - C.FT_Y < MIN_FOOTER_H && showCards) {
    showCards = false;
    C = cascade(showCards, descLinesUsed.length);
  }
  if (H - C.FT_Y < MIN_FOOTER_H && descLinesUsed.length > 1) {
    descLinesUsed = descLinesUsed.slice(0, 1);
    C = cascade(showCards, descLinesUsed.length);
  }
  // If content is short (typically the breaking layout with no cards),
  // the footer would otherwise stretch into a large empty purple block.
  // Cap it and push the reclaimed space back up as breathing room above
  // the headline instead — reads as an intentional, centered composition.
  const MAX_FOOTER_H = 130;
  const excess = (H - C.FT_Y) - MAX_FOOTER_H;
  if (excess > 0) {
    HL_TOP += excess;
    HL_BOT += excess;
    C = cascade(showCards, descLinesUsed.length);
  }
  const { DESC_TOP, DESC_BOT, ICO_TOP, ICO_H, ICO_BOT, META_Y, META_TOP, BTN_H, META_BOT, FT_Y } = C;
  const DESC_Y1 = DESC_TOP + Math.round(DESC_FS * 0.82);
  const FT_H = H - FT_Y;
  const FT_CY = FT_Y + FT_H / 2;

  const BTN_W  = 396;
  const BTN_X  = W - PAD_X - BTN_W;
  const BTN_Y  = META_TOP;
  const BTN_CY = BTN_Y + BTN_H / 2;

  const cat  = esc(String(category || 'News').toUpperCase());
  const catW = Math.max(90, cat.length * 10 + 44);
  const catH = 36;

  const ICO_GAP = 18;
  const ICO_W   = Math.floor((AVAIL - ICO_GAP * 2) / 3);
  const ICO_XS  = [PAD_X, PAD_X + ICO_W + ICO_GAP, PAD_X + (ICO_W + ICO_GAP) * 2];
  const ICON_BOX = 44;
  const ICON_SC  = (22 / 24).toFixed(4);
  const ICON_OFF = (ICON_BOX - 22) / 2;
  const labY = ICO_TOP + 16 + Math.round(14 * 0.82);
  const subY = labY + 14 + 3 + Math.round(13 * 0.82);

  const cardsSvg = !showCards ? '' : ICO_XS.map((cx, i) => {
    const kp   = KP[i];
    const boxX = cx + 18;
    const boxY = ICO_TOP + 16;
    const txtX = boxX + ICON_BOX + 14;
    return `
  <rect x="${cx}" y="${ICO_TOP}" width="${ICO_W}" height="${ICO_H}" rx="14"
        fill="rgba(138,92,246,0.08)" stroke="rgba(138,92,246,0.25)" stroke-width="1"/>
  <rect x="${boxX}" y="${boxY}" width="${ICON_BOX}" height="${ICON_BOX}" rx="10" fill="url(#purpGrad)"/>
  <g transform="translate(${boxX + ICON_OFF},${boxY + ICON_OFF}) scale(${ICON_SC})">
    <path d="${getIconPath(kp.icon)}" fill="white"/>
  </g>
  <text x="${txtX}" y="${labY}" font-family="${FP}" font-size="14" font-weight="700"
        fill="white" letter-spacing="0.3">${esc(String(kp.title || '').toUpperCase().slice(0, 20))}</text>
  <text x="${txtX}" y="${subY}" font-family="${FI}" font-size="13" fill="#B4B0C5"
  >${esc(String(kp.desc || '').slice(0, 38))}</text>`;
  }).join('');

  // Text-zone gradient height is DYNAMIC — sized to whatever content is
  // actually there (computed above via cascade), not a fixed hero split.
  // Starts fading in well above the headline so the transition is gradual,
  // not a hard line, and only darkens the lower portion of the photo —
  // the top ~50% stays completely natural, uncovered.
  const GRAD_TOP = Math.max(HERO_H - 40, HL_TOP - 90);

  return Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
<defs>${defsBlock(PAD_X, W)}
  <!-- Legibility gradient — dynamically sized to the text zone only.
       This is NOT a color tint: stops are pure black at varying alpha,
       so hue/saturation of the photo underneath is fully preserved. -->
  <linearGradient id="textGrad" gradientUnits="userSpaceOnUse"
                  x1="0" y1="${GRAD_TOP}" x2="0" y2="${FT_Y}">
    <stop offset="0%"   stop-color="#000000" stop-opacity="0"/>
    <stop offset="45%"  stop-color="#000000" stop-opacity="0.55"/>
    <stop offset="100%" stop-color="#000000" stop-opacity="0.86"/>
  </linearGradient>
  <!-- Subtle top scrim — just enough for the wordmark to read against a
       bright sky or busy detail, not a recolor of the image. -->
  <linearGradient id="topScrim" gradientUnits="userSpaceOnUse"
                  x1="0" y1="0" x2="0" y2="170">
    <stop offset="0%"   stop-color="#000000" stop-opacity="0.4"/>
    <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
  </linearGradient>
  <!-- Edge vignette — subtle darkening only at the outer edges/corners,
       center stays fully clear and sharp. Pure black, no hue shift. -->
  <radialGradient id="edgeVignette" cx="50%" cy="42%" r="75%" gradientUnits="objectBoundingBox">
    <stop offset="62%"  stop-color="#000000" stop-opacity="0"/>
    <stop offset="100%" stop-color="#000000" stop-opacity="0.38"/>
  </radialGradient>
</defs>

<!-- Photo (composited below this SVG layer) runs the FULL 1080×1080
     canvas — natural colors, no purple/blue tint, no hard hero/content
     split. Only these three grayscale-alpha layers touch it. -->
<rect x="0" y="0" width="${W}" height="${H}" fill="url(#edgeVignette)"/>
<rect x="0" y="0" width="${W}" height="170" fill="url(#topScrim)"/>
<rect x="0" y="${GRAD_TOP}" width="${W}" height="${FT_Y - GRAD_TOP}" fill="url(#textGrad)"/>
<rect x="0" y="${FT_Y}" width="${W}" height="${H - FT_Y}" fill="#0B0B0F"/>

${logoMarkSvg(36, 36, 52, logoUri, 14)}
<text x="102" y="60" font-family="${FP}" font-size="21" font-weight="700" fill="white">Novas Beat</text>
<text x="102" y="79" font-family="${FI}" font-size="12" font-style="italic" fill="#38E0D2">The world, unfiltered.</text>

<rect x="36" y="102" width="${catW}" height="${catH}" rx="9" fill="url(#purpGrad)"/>
<text x="${36 + catW / 2}" y="125" font-family="${FP}" font-size="16" font-weight="700" fill="white"
      text-anchor="middle" letter-spacing="0.6">${cat}</text>

${isBreaking ? `<rect x="${W - 36 - 175}" y="36" width="175" height="34" rx="17" fill="url(#purpGrad)"/>
<circle cx="${W - 36 - 175 + 18}" cy="53" r="4" fill="white"/>
<text x="${W - 36 - 175 + 30}" y="57" font-family="${FP}" font-size="14" font-weight="700" fill="white"
      letter-spacing="0.5">BREAKING NEWS</text>` : ''}

${hlLines.map((l, i) => `<text x="${PAD_X}" y="${HL_TOP + HL_BASE + i * HL_LH}"
      font-family="${FP}" font-size="${HL_FS}" font-weight="800" fill="${l.grad ? 'url(#hl2Grad)' : 'white'}"
      letter-spacing="${(-HL_FS * 0.01).toFixed(1)}"
>${esc(l.text.toUpperCase())}</text>`).join('\n')}

${descLinesUsed.length ? `<rect x="${PAD_X}" y="${DESC_TOP}" width="3"
      height="${DESC_LH * descLinesUsed.length + 4}" rx="1.5" fill="#8A5CF6"/>
${descLinesUsed.map((dl, i) =>
  `<text x="${PAD_X + 18}" y="${DESC_Y1 + i * DESC_LH}"
      font-family="${FI}" font-size="${DESC_FS}" fill="#D8D6E3">${esc(dl)}</text>`
).join('\n')}` : ''}

${cardsSvg}

<line x1="${PAD_X}" y1="${META_Y}" x2="${W - PAD_X}" y2="${META_Y}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
<text x="${PAD_X}" y="${BTN_CY + 5}" font-family="${FI}" font-size="14" fill="#C9C6D8"
>Source: <tspan font-weight="600" fill="white">Novas Beat News Desk</tspan></text>

<rect x="${BTN_X}" y="${BTN_Y}" width="${BTN_W}" height="${BTN_H}" rx="${BTN_H / 2}" fill="url(#purpGrad)"/>
<text x="${BTN_X + BTN_W / 2 - 14}" y="${BTN_CY + 5}" font-family="${FP}" font-size="14.5" font-weight="600" fill="white"
      text-anchor="middle">For more news, visit novasbeat.com</text>
<g transform="translate(${BTN_X + BTN_W - 30},${BTN_CY - 8}) scale(${(16 / 24).toFixed(4)})">
  <path d="${ARROW_PATH}" fill="white"/>
</g>

<rect x="0" y="${FT_Y}" width="${W}" height="${FT_H}" fill="url(#ftGrad)"/>
${logoMarkSvg(PAD_X, FT_CY - 21, 42, logoUri, 12)}
<text x="${PAD_X + 54}" y="${FT_CY - 2}" font-family="${FP}" font-size="17" font-weight="700" fill="white">novasbeat.com</text>
<text x="${PAD_X + 54}" y="${FT_CY + 17}" font-family="${FI}" font-size="12.5" fill="rgba(255,255,255,0.8)"
>AI-powered · Verified across hundreds of sources</text>

${debug ? debugOverlay(W, H, PAD_X, HL_TOP - 24, FT_Y) : ''}
</svg>`);
}

// ═══════════════════════════════════════════════════════════════════
// FACEBOOK (1200×630) — same brand tokens, landscape split composition
// ═══════════════════════════════════════════════════════════════════
function buildFbSvg({ line1, line2, description, category, isBreaking = false, debug = false, logoUri = null }) {
  const textX = FB_HERO_W + FB_PAD;
  const { fs: HL_FS, lines: hlLines } = buildHeadlineLines(line1, line2, FB_AVAIL, 40, 22);
  const HL_LH = Math.round(HL_FS * 1.08);

  const descLines = wrapText(String(description || ''), 42, 3);
  const DESC_FS = 16, DESC_LH = Math.round(DESC_FS * 1.5);

  const cat  = esc(String(category || 'News').toUpperCase());
  const catW = Math.max(80, cat.length * 8 + 36);

  const FT_Y = FB_H - 56;
  const BRAND_H = 34 + 20; // brand row + gap, fixed at top
  const contentH = HL_LH * hlLines.length + 18 + DESC_LH * Math.max(1, descLines.length);
  // Vertically center the headline+description block in the space between
  // the brand row and the footer, instead of anchoring it to the top and
  // leaving a large dead gap above the footer.
  const TOP = 40;
  const blockTop = TOP + BRAND_H + Math.max(0, Math.round((FT_Y - 24 - (TOP + BRAND_H) - contentH) / 2));
  const HL_TOP = blockTop;
  const HL_BASE = Math.round(HL_FS * 0.82);
  const HL_BOT = HL_TOP + HL_LH * hlLines.length;
  const DESC_TOP = HL_BOT + 18;
  const DESC_Y1 = DESC_TOP + Math.round(DESC_FS * 0.82);

  return Buffer.from(`<svg width="${FB_W}" height="${FB_H}" xmlns="http://www.w3.org/2000/svg">
<defs>${defsBlock(FB_PAD, FB_W)}
  <!-- Soft seam blend so the photo→panel edge isn't a hard vertical
       line — pure black alpha fade, doesn't touch the photo's hue. -->
  <linearGradient id="seamBlend" gradientUnits="userSpaceOnUse" x1="${FB_HERO_W - 70}" y1="0" x2="${FB_HERO_W}" y2="0">
    <stop offset="0%"   stop-color="#000000" stop-opacity="0"/>
    <stop offset="100%" stop-color="#000000" stop-opacity="0.28"/>
  </linearGradient>
</defs>

<!-- Only the text column gets a background fill — the hero photo (left
     ${FB_HERO_W}px, composited below this SVG layer) stays fully visible
     and unrecolored. -->
<rect x="${FB_HERO_W - 70}" y="0" width="70" height="${FB_H}" fill="url(#seamBlend)"/>
<rect x="${FB_HERO_W}" y="0" width="${FB_W - FB_HERO_W}" height="${FB_H}" fill="#0B0B0F"/>
${logoMarkSvg(textX, TOP, 26, logoUri, 7)}
<text x="${textX + 36}" y="${TOP + 19}" font-family="${FP}" font-size="15" font-weight="700" fill="white">Novas Beat</text>

<rect x="${textX}" y="${TOP + 34}" width="${catW}" height="26" rx="7" fill="url(#purpGrad)"/>
<text x="${textX + catW / 2}" y="${TOP + 51}" font-family="${FP}" font-size="12" font-weight="700" fill="white"
      text-anchor="middle" letter-spacing="0.5">${cat}</text>
${isBreaking ? `<rect x="${textX + catW + 10}" y="${TOP + 34}" width="120" height="26" rx="13" fill="url(#purpGrad)"/>
<circle cx="${textX + catW + 26}" cy="${TOP + 47}" r="3" fill="white"/>
<text x="${textX + catW + 36}" y="${TOP + 51}" font-family="${FP}" font-size="11" font-weight="700" fill="white">BREAKING</text>` : ''}

${hlLines.map((l, i) => `<text x="${textX}" y="${HL_TOP + HL_BASE + i * HL_LH}"
      font-family="${FP}" font-size="${HL_FS}" font-weight="800" fill="${l.grad ? 'url(#hl2Grad)' : 'white'}"
      letter-spacing="${(-HL_FS * 0.01).toFixed(1)}"
>${esc(l.text.toUpperCase())}</text>`).join('\n')}

${descLines.map((dl, i) => `<text x="${textX}" y="${DESC_Y1 + i * DESC_LH}"
      font-family="${FI}" font-size="${DESC_FS}" fill="#D8D6E3">${esc(dl)}</text>`).join('\n')}

<rect x="${textX}" y="${FT_Y}" width="${FB_W - textX - FB_PAD}" height="1" fill="rgba(255,255,255,0.15)"/>
<text x="${textX}" y="${FT_Y + 30}" font-family="${FP}" font-size="15" font-weight="700" fill="white">novasbeat.com</text>
<text x="${textX}" y="${FT_Y + 48}" font-family="${FI}" font-size="11.5" fill="rgba(255,255,255,0.7)"
>AI-powered · Verified across hundreds of sources</text>

${debug ? debugOverlay(FB_W, FB_H, FB_PAD, TOP, FT_Y) : ''}
</svg>`);
}

// ── Shared photo download + hero fit ───────────────────────────────
async function downloadHero(imageUrl, w, h, fallbackColor) {
  if (imageUrl) {
    try {
      const dl = await axios.get(imageUrl, {
        responseType: 'arraybuffer', timeout: 25000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsPostAuto/1.0)' },
      });
      return await sharp(Buffer.from(dl.data)).resize(w, h, { fit: 'cover', position: 'attention' })
        .jpeg({ quality: 90 }).toBuffer();
    } catch (e) {
      console.warn('[brandImage] Photo download FAILED:', e.message, '→ using gradient hero');
    }
  }
  return sharp({ create: { width: w, height: h, channels: 3, background: fallbackColor } })
    .jpeg({ quality: 80 }).toBuffer();
}

function resolveHeadlineLines(headline) {
  if (headline && typeof headline === 'object' && headline.line1) {
    return { line1: String(headline.line1).trim(), line2: String(headline.line2 || '').trim() };
  }
  const words = String(headline || '').trim().split(/\s+/);
  const mid = Math.ceil(words.length / 2);
  return { line1: words.slice(0, mid).join(' '), line2: words.slice(mid).join(' ') };
}

// ── Public API — Instagram (1080×1080, primary format) ─────────────
// headline: string OR { line1, line2 }. opts.isBreaking selects the
// dedicated Breaking News treatment. opts.debug overlays safe-area
// guides (never use in production output).
export async function buildBrandedImage(imageUrl, headline, category, opts = {}) {
  const { body = '', summary, keyPoints, isBreaking = false, debug = false } = opts;
  const { line1, line2 } = resolveHeadlineLines(headline);
  const description = summary || makeSummary(body, 160);

  // Full-bleed photo — natural colors preserved across the WHOLE canvas,
  // not just a 560px top strip. This is the actual fix for "every post
  // looks the same purple thing": the photo's own colors now drive the
  // post's visual identity; only alpha-only vignette/gradient layers
  // touch it (see buildSvg), never a hue/color tint.
  const [photo, logoUri] = await Promise.all([
    downloadHero(imageUrl, W, H, { r: 68, g: 58, b: 122 }),
    getLogoDataUri(),
  ]);
  const bg = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 11, g: 11, b: 15 } } })
    .png().toBuffer();
  const svgBuf = buildSvg({ line1, line2, description, category, keyPoints, isBreaking, debug, logoUri });

  const out = await sharp(bg)
    .composite([{ input: photo, top: 0, left: 0 }, { input: svgBuf, top: 0, left: 0 }])
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer();

  return uploadBufferToSupabase(out, `branded-${Date.now()}.jpg`, 'image/jpeg');
}

// ── Public API — Facebook (1200×630, link/photo post format) ───────
// Same brand tokens/typography/safe-fitting as Instagram, landscape
// composition instead of a resized square (no stretching).
export async function buildBrandedImageForFacebook(imageUrl, headline, category, opts = {}) {
  const { body = '', summary, isBreaking = false, debug = false } = opts;
  const { line1, line2 } = resolveHeadlineLines(headline);
  const description = summary || makeSummary(body, 140);

  const [photo, logoUri] = await Promise.all([
    downloadHero(imageUrl, FB_HERO_W, FB_H, { r: 68, g: 58, b: 122 }),
    getLogoDataUri(),
  ]);
  const bg = await sharp({ create: { width: FB_W, height: FB_H, channels: 3, background: { r: 11, g: 11, b: 15 } } })
    .png().toBuffer();
  const svgBuf = buildFbSvg({ line1, line2, description, category, isBreaking, debug, logoUri });

  const out = await sharp(bg)
    .composite([{ input: photo, top: 0, left: 0 }, { input: svgBuf, top: 0, left: 0 }])
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer();

  return uploadBufferToSupabase(out, `branded-fb-${Date.now()}.jpg`, 'image/jpeg');
}

export default { buildBrandedImage, buildBrandedImageForFacebook, makeSummary };
