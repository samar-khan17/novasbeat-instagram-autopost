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
// Mono — stands in for IBM Plex Mono (not installed on the render host);
// used for category/metadata/footer per the editorial spec.
const FM = "'Courier New','DejaVu Sans Mono',monospace";

// ── Editorial design system tokens (per NOVAS-BEAT-DESIGN-SPEC.md) ──
// The one rule: never tint the photograph. Purple appears ONLY in these
// UI elements — pills, category text, accent rules, the breaking bar,
// card borders, the logo mark. Never as a wash over the photo itself.
const ACCENT       = '#8B2FD9';
const ACCENT_LIGHT = '#A76BFF';
const ACCENT_TEXT  = '#CFB4FF';
const PAPER        = '#F4F2EF';
const INK          = '#141216';
const INK_60       = '#4B4653';
const RULE_ON_PHOTO = 'rgba(255,255,255,.22)';
const META_ON_PHOTO = 'rgba(255,255,255,.72)';
const MARGIN = 72; // outer margin, editorial grid

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

// ── 3-tier headline: small top line → BIG emphasized middle → small
// bottom line. line1 becomes the top tier as-is; line2 gets split into
// a short emphasized "mid" phrase (the important name/number/point) and
// whatever's left as a smaller closing line — so a single AI-generated
// {line1, line2} pair (unchanged upstream) drives a proper small/BIG/
// small rhythm instead of two same-size lines.
function splitEmphasis(line2) {
  const words = String(line2 || '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { mid: words.join(' '), bot: '' };
  // Take 2 words instead of 1 when the first word is short (e.g. "A",
  // "THE", "NEW") so the emphasized phrase still reads as substantial.
  const take = (words[0].length <= 3 && words.length > 2) ? 2 : 1;
  return { mid: words.slice(0, take).join(' '), bot: words.slice(take).join(' ') };
}

// Finds the largest `fs` (the MID/emphasis size) at which top (0.44×fs),
// mid (1×fs), and bottom (0.4×fs) all fit `avail` — real per-char
// measurement per tier, then per-line split-fallback as a last resort.
function buildHeadlineTiers(line1, line2, avail, maxFs = 64, minFs = 30) {
  const top = String(line1 || '').trim();
  const { mid, bot } = splitEmphasis(line2);
  const TOP_R = 0.46, BOT_R = 0.42;

  let fs = maxFs;
  for (; fs >= minFs; fs--) {
    if (textWidthPx(top, Math.round(fs * TOP_R)) <= avail &&
        textWidthPx(mid, fs) <= avail &&
        textWidthPx(bot, Math.round(fs * BOT_R)) <= avail) break;
  }
  fs = Math.max(fs, minFs);
  const topFs = Math.round(fs * TOP_R), botFs = Math.round(fs * BOT_R);

  const lines = [];
  fitOrSplitLine(top, topFs, avail).filter(Boolean).forEach(t => lines.push({ text: t, size: topFs, grad: false }));
  fitOrSplitLine(mid, fs, avail).filter(Boolean).forEach(t => lines.push({ text: t, size: fs, grad: true }));
  if (bot) fitOrSplitLine(bot, botFs, avail).filter(Boolean).forEach(t => lines.push({ text: t, size: botFs, grad: false }));

  return { lines: lines.slice(0, 6), midFs: fs };
}

// Renders a tiered-size line array as SVG <text> elements, each line's
// own line-height stacking correctly. Returns the markup plus the total
// block height so callers can cascade the rest of the layout below it.
function renderHeadlineTiers(lines, x, anchor, startY) {
  let y = startY;
  let markup = '';
  for (const l of lines) {
    const lh = Math.round(l.size * 1.08);
    y += lh;
    const baseline = y - Math.round(lh - l.size * 0.82);
    markup += `<text x="${x}" y="${baseline}" font-family="${FP}" font-size="${l.size}" font-weight="800"
      fill="${l.grad ? 'url(#hl2Grad)' : 'white'}" text-anchor="${anchor}"
      letter-spacing="${(-l.size * 0.01).toFixed(1)}">${esc(l.text.toUpperCase())}</text>\n`;
  }
  return { markup, bottomY: y };
}

// ── Box-fit headline: real word-wrap at a given font size, then shrink
// in steps to a floor ratio if it still overflows the box — this is the
// spec's "fitter" (section 3), reimplemented against real per-char
// measurement instead of a browser's scrollHeight, since we have no DOM.
function wrapByWidth(text, fontSize, avail) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = []; let line = '';
  for (const w of words) {
    const cand = line ? `${line} ${w}` : w;
    if (textWidthPx(cand, fontSize) > avail && line) { lines.push(line); line = w; }
    else line = cand;
  }
  if (line) lines.push(line);
  return lines;
}

function fitHeadlineBox(text, boxW, boxH, maxFs, minRatio = 0.78, lhRatio = 1.02, maxLines = 4) {
  const minFs = Math.round(maxFs * minRatio);
  for (let fs = maxFs; fs >= minFs; fs -= 2) {
    const lines = wrapByWidth(text, fs, boxW);
    const lh = Math.round(fs * lhRatio);
    if (lines.length <= maxLines && lines.length * lh <= boxH) return { fs, lines, lh };
  }
  // Last resort — spec says drop optional content first (callers do that
  // before reaching here); if we still can't fit, use the floor size and
  // truncate rather than let text spill past the box.
  const fs = minFs, lh = Math.round(fs * lhRatio);
  let lines = wrapByWidth(text, fs, boxW).slice(0, maxLines);
  if (lines.length) lines[lines.length - 1] = lines[lines.length - 1].replace(/[.,;:]+$/, '') + '…';
  return { fs, lines, lh };
}

// ── Sample the photo's own dominant colour, darkened, for the scrim —
// "a desaturated darkening of the photo's own family" per spec, instead
// of a fixed purple/black tint. Falls back to near-black if sampling
// fails (never blocks a render).
async function dominantColor(photoBuf) {
  try {
    const { data } = await sharp(photoBuf).resize(1, 1).raw().toBuffer({ resolveWithObject: true });
    const [r, g, b] = data;
    // Darken toward the photo's own hue family rather than pure black.
    return { r: Math.round(r * 0.16), g: Math.round(g * 0.16), b: Math.round(b * 0.16) };
  } catch {
    return { r: 8, g: 8, b: 10 };
  }
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
// EDITORIAL DESIGN SYSTEM — Standard / Cinematic / Breaking
// (per NOVAS-BEAT-DESIGN-SPEC.md — three of the spec's six compositions,
// the most visually distinct; Informational/Feature/Sports are natural
// follow-ons using the same building blocks below if wanted later.)
// ═══════════════════════════════════════════════════════════════════

// Lockup: NB mark + wordmark + tagline. Always sits on photography in
// all three compositions (even Standard, where it's positioned in the
// photo's top region above the paper panel), so it always uses the
// on-dark styling — never the on-paper ink variant.
function lockupSvg(x, y, logoUri) {
  return `${logoMarkSvg(x, y, 58, logoUri, 16)}
<text x="${x + 74}" y="${y + 27}" font-family="${FP}" font-size="27" font-weight="800" fill="white"
      letter-spacing="2.5">NOVAS BEAT</text>
<text x="${x + 74}" y="${y + 47}" font-family="${FM}" font-size="16" fill="${ACCENT_LIGHT}"
      letter-spacing="1.2">THE WORLD, UNFILTERED</text>`;
}

// Footer: hairline rule + a space-between mono row. Minimal — no
// purple bar. `onPhoto` switches ink vs. white/meta colouring so it
// reads correctly whether it lands on the paper panel or on photography.
function footerSvg(x1, x2, y, leftText, rightText, onPhoto) {
  const ruleColor = onPhoto ? RULE_ON_PHOTO : '#CFCAC2';
  const textColor = onPhoto ? META_ON_PHOTO : INK_60;
  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${ruleColor}" stroke-width="1"/>
<text x="${x1}" y="${y + 30}" font-family="${FM}" font-size="18" fill="${textColor}" letter-spacing="1.4">${esc(leftText)}</text>
<text x="${x2}" y="${y + 30}" font-family="${FM}" font-size="18" fill="${textColor}" letter-spacing="1.4" text-anchor="end">${esc(rightText)}</text>`;
}

function todayLabel() {
  return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
}

// ── A. STANDARD EDITORIAL — photo top 648, paper panel below ────────
function buildStandardSvg({ line1, line2, description, category, source, isBreaking, debug, logoUri }) {
  const headline = [line1, line2].filter(Boolean).join(' ');
  const PHOTO_H = 648;
  const AVAIL_ED = W - MARGIN * 2;

  const cat = esc(String(category || 'News').toUpperCase());
  const catW = Math.max(90, cat.length * 11 + 40);

  // Footer hugs the ACTUAL headline content (headlineBottom + a small
  // fixed gap) instead of sitting at a fixed distance from the bottom —
  // that fixed-position approach left a large dead gap under short
  // headlines. The box height passed to the fitter still reserves the
  // worst-case footer room, so a long headline can never push the
  // footer off-canvas.
  // The box passed to the fitter reserves real room down to a fixed
  // 90px footer minimum (2 lines of mono footer text) — NOT a tight
  // budget matched to the "ideal" 106px size. A long headline with an
  // unbreakable long word (e.g. "reforestation") can still need more
  // than 106px×4-lines worth of room; the floor ratio here (0.42) is
  // real headroom, not a stylistic choice, so the fitter can always
  // reach a size that truly fits before ever falling back to
  // truncation. Footer then hugs whatever height the headline actually
  // used, by construction never overflowing.
  const FOOTER_GAP = 48, FOOTER_RESERVE = 90;
  const HL_TOP = 712, HL_BOX_H = H - FOOTER_RESERVE - FOOTER_GAP - HL_TOP;
  const { fs: HL_FS, lines: hlLines, lh: HL_LH } = fitHeadlineBox(headline, AVAIL_ED, HL_BOX_H, 106, 0.42, 0.98, 8);
  const FT_RULE_Y = HL_TOP + hlLines.length * HL_LH + FOOTER_GAP;

  return Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
<defs>${defsBlock(MARGIN, W)}
  <linearGradient id="topScrim" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="200">
    <stop offset="0%" stop-color="#000000" stop-opacity="0.45"/>
    <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
  </linearGradient>
</defs>
<!-- Photo (composited below) fills the full canvas but only its top
     ${PHOTO_H}px is meant to show — the paper panel below covers the rest.
     Photo itself is never tinted; only this top scrim aids the lockup. -->
<rect x="0" y="0" width="${W}" height="200" fill="url(#topScrim)"/>
<rect x="0" y="${PHOTO_H}" width="${W}" height="${H - PHOTO_H}" fill="${PAPER}"/>

${lockupSvg(MARGIN, 64, logoUri)}

<rect x="${MARGIN}" y="566" width="${catW}" height="40" rx="4" fill="${ACCENT}"/>
<text x="${MARGIN + catW / 2}" y="592" font-family="${FM}" font-size="18" font-weight="700" fill="white"
      text-anchor="middle" letter-spacing="2.5">${cat}</text>

${hlLines.map((l, i) => `<text x="${MARGIN}" y="${HL_TOP + Math.round(HL_FS * 0.85) + i * HL_LH}"
      font-family="${FP}" font-size="${HL_FS}" font-weight="800" fill="${INK}"
      letter-spacing="${(-HL_FS * 0.02).toFixed(1)}">${esc(l)}</text>`).join('\n')}

${footerSvg(MARGIN, W - MARGIN, FT_RULE_Y, `SOURCE — ${(source || 'NOVAS BEAT').toUpperCase()}`, `NOVASBEAT.COM · ${todayLabel()}`, false)}

${debug ? debugOverlay(W, H, MARGIN, HL_TOP, FT_RULE_Y) : ''}
</svg>`);
}

// ── B. CINEMATIC — full-bleed photo, bottom-aligned right-inset headline ─
function buildCinematicSvg({ line1, line2, description, category, source, isBreaking, debug, logoUri, scrimColor }) {
  const headline = [line1, line2].filter(Boolean).join(' ');
  const cat = esc(String(category || 'News').toUpperCase());
  const RIGHT_INSET = 120;
  const boxTop = 606, boxBot = H - 190;
  const AVAIL_ED = W - MARGIN - RIGHT_INSET;
  const { fs: HL_FS, lines: hlLines, lh: HL_LH } = fitHeadlineBox(headline, AVAIL_ED, boxBot - boxTop, 106, 0.72, 0.98, 4);
  // Bottom-aligned: stack lines upward from the box's bottom edge.
  const blockH = hlLines.length * HL_LH;
  const startY = boxBot - blockH;

  const sc = scrimColor || { r: 8, g: 8, b: 10 };
  const scrimHex = `rgb(${sc.r},${sc.g},${sc.b})`;

  return Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
<defs>${defsBlock(MARGIN, W)}
  <linearGradient id="bottomScrim" gradientUnits="userSpaceOnUse" x1="0" y1="${H - 620}" x2="0" y2="${H}">
    <stop offset="0%" stop-color="${scrimHex}" stop-opacity="0"/>
    <stop offset="38%" stop-color="${scrimHex}" stop-opacity="0.55"/>
    <stop offset="65%" stop-color="${scrimHex}" stop-opacity="0.82"/>
    <stop offset="100%" stop-color="${scrimHex}" stop-opacity="0.93"/>
  </linearGradient>
  <linearGradient id="topScrim" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="220">
    <stop offset="0%" stop-color="#000000" stop-opacity="0.5"/>
    <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
  </linearGradient>
</defs>
<rect x="0" y="0" width="${W}" height="220" fill="url(#topScrim)"/>
<rect x="0" y="${H - 620}" width="${W}" height="620" fill="url(#bottomScrim)"/>

${lockupSvg(MARGIN, 64, logoUri)}

<!-- Category sits relative to the headline's ACTUAL start (startY), not
     a fixed box-top offset — guarantees it always lands inside the
     scrim's well-darkened zone regardless of how many lines the
     headline wrapped to, instead of sometimes landing on bare photo. -->
<text x="${W - RIGHT_INSET}" y="${startY - 34}" font-family="${FM}" font-size="20" font-weight="700" fill="${ACCENT_TEXT}"
      text-anchor="end" letter-spacing="3">${cat}</text>
<line x1="${W - RIGHT_INSET - 120}" y1="${startY - 44}" x2="${W - RIGHT_INSET}" y2="${startY - 44}" stroke="${ACCENT_TEXT}" stroke-width="1"/>

${hlLines.map((l, i) => `<text x="${W - RIGHT_INSET}" y="${startY + Math.round(HL_FS * 0.85) + i * HL_LH}"
      font-family="${FP}" font-size="${HL_FS}" font-weight="800" fill="white" text-anchor="end"
      letter-spacing="${(-HL_FS * 0.02).toFixed(1)}">${esc(l)}</text>`).join('\n')}

${footerSvg(MARGIN, W - MARGIN, H - 72 - 26, `SOURCE — ${(source || 'NOVAS BEAT').toUpperCase()}`, `NOVASBEAT.COM · ${todayLabel()}`, true)}

${debug ? debugOverlay(W, H, MARGIN, boxTop, boxBot) : ''}
</svg>`);
}

// ── D. BREAKING — purple top bar, huge bottom-aligned headline ──────
function buildBreakingSvg({ line1, line2, description, category, source, debug, logoUri, scrimColor }) {
  const headline = [line1, line2].filter(Boolean).join(' ');
  const BAR_H = 76;
  const boxTop = 520, boxBot = H - 190;
  const AVAIL_ED = W - MARGIN * 2;
  const { fs: HL_FS, lines: hlLines, lh: HL_LH } = fitHeadlineBox(headline, AVAIL_ED, boxBot - boxTop, 118, 0.72, 0.94, 4);
  const blockH = hlLines.length * HL_LH;
  const startY = boxBot - blockH;

  const sc = scrimColor || { r: 8, g: 8, b: 10 };
  const scrimHex = `rgb(${sc.r},${sc.g},${sc.b})`;
  const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  return Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
<defs>${defsBlock(MARGIN, W)}
  <linearGradient id="bottomScrim" gradientUnits="userSpaceOnUse" x1="0" y1="${H - 620}" x2="0" y2="${H}">
    <stop offset="0%" stop-color="${scrimHex}" stop-opacity="0"/>
    <stop offset="38%" stop-color="${scrimHex}" stop-opacity="0.58"/>
    <stop offset="65%" stop-color="${scrimHex}" stop-opacity="0.84"/>
    <stop offset="100%" stop-color="${scrimHex}" stop-opacity="0.94"/>
  </linearGradient>
</defs>
<rect x="0" y="${H - 620}" width="${W}" height="620" fill="url(#bottomScrim)"/>

<rect x="0" y="0" width="${W}" height="${BAR_H}" fill="${ACCENT}"/>
<text x="${MARGIN}" y="${BAR_H / 2 + 8}" font-family="${FM}" font-size="24" font-weight="700" fill="white"
      letter-spacing="4">BREAKING</text>
<text x="${W - MARGIN}" y="${BAR_H / 2 + 8}" font-family="${FM}" font-size="18" fill="white"
      text-anchor="end" letter-spacing="1.5">${time} CET</text>

${lockupSvg(MARGIN, 140, logoUri)}

${hlLines.map((l, i) => `<text x="${MARGIN}" y="${startY + Math.round(HL_FS * 0.85) + i * HL_LH}"
      font-family="${FP}" font-size="${HL_FS}" font-weight="900" fill="white"
      letter-spacing="${(-HL_FS * 0.025).toFixed(1)}">${esc(l)}</text>`).join('\n')}

${footerSvg(MARGIN, W - MARGIN, H - 72 - 26, 'LIVE — NOVASBEAT.COM', `NOVASBEAT.COM · ${todayLabel()}`, true)}

${debug ? debugOverlay(W, H, MARGIN, boxTop, boxBot) : ''}
</svg>`);
}

// ═══════════════════════════════════════════════════════════════════
// FACEBOOK (1200×630) — same brand tokens, landscape split composition
// ═══════════════════════════════════════════════════════════════════
function buildFbSvg({ line1, line2, description, category, isBreaking = false, debug = false, logoUri = null }) {
  const textX = FB_HERO_W + FB_PAD;
  const { lines: hlTiers } = buildHeadlineTiers(line1, line2, FB_AVAIL, 46, 24);
  const hlBlockH = hlTiers.reduce((sum, l) => sum + Math.round(l.size * 1.08), 0);

  const descLines = wrapText(String(description || ''), 42, 3);
  const DESC_FS = 16, DESC_LH = Math.round(DESC_FS * 1.5);

  const cat  = esc(String(category || 'News').toUpperCase());
  const catW = Math.max(80, cat.length * 8 + 36);

  const FT_Y = FB_H - 56;
  const BRAND_H = 34 + 20; // brand row + gap, fixed at top
  const contentH = hlBlockH + 18 + DESC_LH * Math.max(1, descLines.length);
  // Vertically center the headline+description block in the space between
  // the brand row and the footer, instead of anchoring it to the top and
  // leaving a large dead gap above the footer.
  const TOP = 40;
  const blockTop = TOP + BRAND_H + Math.max(0, Math.round((FT_Y - 24 - (TOP + BRAND_H) - contentH) / 2));
  const HL_TOP = blockTop;
  const HL_BOT = HL_TOP + hlBlockH;
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

${renderHeadlineTiers(hlTiers, textX, 'start', HL_TOP).markup}

${descLines.map((dl, i) => `<text x="${textX}" y="${DESC_Y1 + i * DESC_LH}"
      font-family="${FI}" font-size="${DESC_FS}" fill="#D8D6E3">${esc(dl)}</text>`).join('\n')}

<rect x="${textX}" y="${FT_Y}" width="${FB_W - textX - FB_PAD}" height="1" fill="rgba(255,255,255,0.15)"/>
<text x="${textX}" y="${FT_Y + 30}" font-family="${FP}" font-size="15" font-weight="700" fill="white">novasbeat.com</text>
<text x="${textX}" y="${FT_Y + 48}" font-family="${FI}" font-size="11.5" fill="rgba(255,255,255,0.7)"
>AI-powered · Verified across hundreds of sources</text>

${debug ? debugOverlay(FB_W, FB_H, FB_PAD, TOP, FT_Y) : ''}
</svg>`);
}

// ── Edge blur — genuine gaussian blur, not just darkening ──────────
// A radial alpha mask (transparent center, opaque edges) is rasterized
// from SVG, used to reveal a blurred copy of the photo ONLY at the
// edges via 'dest-in', then that ring is composited over the sharp
// original. Center stays fully sharp; only the outer ring is blurred —
// this is real blur, not a vignette standing in for it.
async function buildEdgeMask(w, h) {
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
<defs><radialGradient id="m" cx="50%" cy="50%" r="72%">
  <stop offset="52%" stop-color="white" stop-opacity="0"/>
  <stop offset="100%" stop-color="white" stop-opacity="1"/>
</radialGradient></defs>
<rect width="${w}" height="${h}" fill="url(#m)"/>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function applyEdgeBlur(photoBuf, w, h, sigma = 16) {
  try {
    const [blurred, mask] = await Promise.all([
      sharp(photoBuf).blur(sigma).toBuffer(),
      buildEdgeMask(w, h),
    ]);
    const ring = await sharp(blurred).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
    return await sharp(photoBuf).composite([{ input: ring, top: 0, left: 0 }]).jpeg({ quality: 90 }).toBuffer();
  } catch (e) {
    console.warn('[brandImage] Edge blur FAILED:', e.message, '→ using unblurred photo');
    return photoBuf;
  }
}

// ── Shared photo download + hero fit ───────────────────────────────
async function downloadHero(imageUrl, w, h, fallbackColor) {
  if (imageUrl) {
    try {
      const dl = await axios.get(imageUrl, {
        responseType: 'arraybuffer', timeout: 25000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsPostAuto/1.0)' },
      });
      const cropped = await sharp(Buffer.from(dl.data)).resize(w, h, { fit: 'cover', position: 'attention' })
        .jpeg({ quality: 90 }).toBuffer();
      return await applyEdgeBlur(cropped, w, h);
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

// Deterministic variant pick — same article always renders the same way
// (no flicker on retries), but different articles land on different
// compositions so the Instagram grid doesn't repeat one layout either.
// isBreaking always wins (dedicated treatment); opts.variant overrides
// explicitly for testing/preview.
function pickVariant(headlineText, isBreaking, explicit) {
  if (explicit) return explicit;
  if (isBreaking) return 'breaking';
  // Standard Editorial only — no rotation to Cinematic. Explicitly
  // requested: one consistent post style, not a mix.
  return 'standard';
}

// ── Public API — Instagram (1080×1080, primary format) ─────────────
// headline: string OR { line1, line2 }. opts.isBreaking selects the
// dedicated Breaking News treatment. opts.variant forces a specific
// composition ('standard'|'cinematic'|'breaking'). opts.source names
// the wire/outlet for the footer credit. opts.debug overlays safe-area
// guides (never use in production output).
export async function buildBrandedImage(imageUrl, headline, category, opts = {}) {
  const { body = '', summary, isBreaking = false, debug = false, variant, source } = opts;
  const { line1, line2 } = resolveHeadlineLines(headline);
  const description = summary || makeSummary(body, 160);

  // Full-bleed photo — natural colors preserved across the WHOLE canvas.
  // This is the actual fix for "every post looks the same purple thing":
  // the photo's own colors now drive the post's visual identity; only
  // alpha-only or photo-sampled-tint layers ever touch it, never a fixed
  // purple/blue wash.
  const [photo, logoUri] = await Promise.all([
    downloadHero(imageUrl, W, H, { r: 68, g: 58, b: 122 }),
    getLogoDataUri(),
  ]);

  const which = pickVariant([line1, line2].join(' '), isBreaking, variant);
  const args = { line1, line2, description, category, source, isBreaking, debug, logoUri };
  let svgBuf;
  if (which === 'standard') {
    svgBuf = buildStandardSvg(args);
  } else {
    // Cinematic + Breaking both use a bottom scrim tinted from the
    // photo's own dominant colour rather than a fixed purple/black.
    args.scrimColor = await dominantColor(photo);
    svgBuf = which === 'breaking' ? buildBreakingSvg(args) : buildCinematicSvg(args);
  }

  const bg = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 11, g: 11, b: 15 } } })
    .png().toBuffer();

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
