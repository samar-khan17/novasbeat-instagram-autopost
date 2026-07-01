// ═══════════════════════════════════════════════════════════════════
// NewsPost Auto — NovasBeat Instagram post generator v3
// Template reference: novasbeat-instagram-template_2.html (pixel-exact)
// Output: 1080×1080 JPEG — Instagram square
// Method: Sharp + SVG compositing — no browser required
// ═══════════════════════════════════════════════════════════════════
import axios from 'axios';
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadBufferToSupabase } from './supabaseStorage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Canvas dimensions ─────────────────────────────────────────────
const W      = 1080;
const H      = 1080;
const HERO_H = 560;          // template: .hero { height: 560px }
const PAD_X  = 40;           // template: .content { padding: 24px 40px 0 40px }
const AVAIL  = W - PAD_X * 2;  // 1000px usable text width

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
  const words = String(text || '').trim().split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (lines.length >= maxLines) break;
    const cand = line ? `${line} ${w}` : w;
    if (cand.length > maxChars && line) { lines.push(line); line = w; }
    else line = cand;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines.slice(0, maxLines);
}

// Template default: 54px Poppins 800, scale down for very long lines
function headlineFontSize(line1, line2, maxFs = 54, minFs = 26) {
  const longest = Math.max(String(line1 || '').length, String(line2 || '').length);
  if (!longest) return maxFs;
  // Arial Black uppercase char width ratio ≈ 0.60
  const needed = AVAIL / (longest * 0.60);
  return Math.max(minFs, Math.min(maxFs, Math.floor(needed)));
}

// ── Icon paths: 24×24 viewBox, filled white — EXACT from template ─
// Template: .icon-box svg { width:22px; height:22px; fill:var(--white); }
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

// ── Build SVG overlay ─────────────────────────────────────────────
function buildSvg({ line1, line2, description, category, keyPoints }) {

  // ── Headline font size (template: 54px, scale down for long text) ─
  const HL_FS = headlineFontSize(line1, line2);
  const HL_LH = Math.round(HL_FS * 1.05);   // template: line-height:1.05

  // ── Description text (wrapped to 2 lines, 19px Inter) ─────────────
  const descLines = wrapText(String(description || ''), 68, 2);
  const DESC_FS  = 19;
  const DESC_LH  = Math.round(DESC_FS * 1.5);   // template: line-height:1.5 → 29px

  // ── Key points (3 icon cards) ──────────────────────────────────────
  const KP = Array.isArray(keyPoints) && keyPoints.length >= 3 ? keyPoints.slice(0, 3) : [
    { title: 'Breaking Update', desc: 'Major development unfolding',    icon: 'fire'   },
    { title: 'Global Impact',   desc: 'Worldwide attention & reaction', icon: 'globe'  },
    { title: 'Analysis',        desc: 'In-depth coverage & context',   icon: 'people' },
  ];

  // ── Y positions cascade exactly from HERO_H = 560 ─────────────────

  // CONTENT area starts at hero bottom
  const CONT_Y = HERO_H;   // 560

  // HEADLINE — padding-top: 24px (.content)
  const HL_TOP  = CONT_Y + 24;                        // 584
  const HL_Y1   = HL_TOP + Math.round(HL_FS * 0.82); // baseline line 1
  const HL_Y2   = HL_Y1 + HL_LH;                     // baseline line 2
  const HL_BOT  = HL_TOP + HL_LH * 2;                // bottom of 2-line block

  // DESCRIPTION — margin-top: 22px
  const DESC_TOP = HL_BOT + 22;
  const DESC_Y1  = DESC_TOP + Math.round(DESC_FS * 0.82);
  const DESC_BOT = DESC_TOP + DESC_LH * Math.max(1, descLines.length);

  // ICON ROW — margin-top: 26px
  // Card height: padding-top(16) + icon-box(44) + padding-bottom(16) = 76px
  const ICO_TOP = DESC_BOT + 26;
  const ICO_H   = 76;
  const ICO_GAP = 18;   // template: .icon-row { gap: 18px }
  const ICO_W   = Math.floor((AVAIL - ICO_GAP * 2) / 3);  // 3 cards, 2 gaps
  const ICO_XS  = [PAD_X, PAD_X + ICO_W + ICO_GAP, PAD_X + (ICO_W + ICO_GAP) * 2];
  const ICO_BOT = ICO_TOP + ICO_H;

  // META BAR — margin-top: 22px, padding-top: 18px
  const META_Y   = ICO_BOT + 22;  // border-top line
  const META_TOP = META_Y + 18;   // content starts here

  // Read-more button: padding 13px 26px, font 14.5px → height 41px
  const BTN_H  = 41;
  const BTN_W  = 396;   // wide enough for "For more news, visit novasbeat.com" + arrow
  const BTN_X  = W - PAD_X - BTN_W;
  const BTN_Y  = META_TOP;
  const BTN_CY = BTN_Y + BTN_H / 2;
  const META_BOT = META_TOP + BTN_H;

  // FOOTER — margin-top: 20px, takes remaining space
  const FT_Y  = META_BOT + 20;
  const FT_H  = H - FT_Y;
  const FT_CY = FT_Y + FT_H / 2;

  // ── Category tag ──────────────────────────────────────────────────
  // template: padding:10px 22px, radius:9px, Poppins 700 16px
  const cat  = esc(String(category || 'News').toUpperCase());
  // Approx Poppins 700 16px char width ~10px, padding 22px each side
  const catW = Math.max(90, cat.length * 10 + 44);
  const catH = 36;   // 10 + 16 + 10

  // ── Icon cards ────────────────────────────────────────────────────
  // template: icon-card padding:16px 18px, gap:14px; icon-box 44×44 r10
  const ICON_BOX = 44;
  const ICON_SC  = (22 / 24).toFixed(4);   // 22×22 icon in 24×24 viewBox
  const ICON_OFF = (ICON_BOX - 22) / 2;    // 11px — centers icon in box

  // Icon text positions (same Y for all cards — all share ICO_TOP)
  const labY = ICO_TOP + 16 + Math.round(14 * 0.82);   // Poppins 700 14px baseline
  const subY = labY + 14 + 3 + Math.round(13 * 0.82);  // Inter 400 13px, margin-top:3px

  const cardsSvg = ICO_XS.map((cx, i) => {
    const kp   = KP[i];
    const boxX = cx + 18;           // card padding-left: 18px
    const boxY = ICO_TOP + 16;      // card padding-top: 16px
    const txtX = boxX + ICON_BOX + 14;  // gap: 14px between icon box and text

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

  // ── SVG output ────────────────────────────────────────────────────
  return Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <!-- Purple 135° gradient — brand buttons, marks, icon boxes -->
  <linearGradient id="purpGrad" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#8A5CF6"/>
    <stop offset="100%" stop-color="#A855F7"/>
  </linearGradient>

  <!-- Headline line-2 gradient: purple → blue (left to right) -->
  <linearGradient id="hl2Grad" x1="${PAD_X}" y1="0" x2="${W - PAD_X}" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0%"   stop-color="#8A5CF6"/>
    <stop offset="100%" stop-color="#60A5FA"/>
  </linearGradient>

  <!-- Footer gradient: 90° -->
  <linearGradient id="ftGrad" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%"   stop-color="#6d3fd1"/>
    <stop offset="45%"  stop-color="#8A5CF6"/>
    <stop offset="100%" stop-color="#A855F7"/>
  </linearGradient>

  <!-- Hero gradient overlay — matches template exactly:
       linear-gradient(180deg, rgba(36,29,68,0.1) 0%, rgba(20,16,38,0.55) 55%, #0B0B0F 100%) -->
  <linearGradient id="heroOverlay" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%"   stop-color="#241d44" stop-opacity="0.10"/>
    <stop offset="55%"  stop-color="#141026" stop-opacity="0.55"/>
    <stop offset="100%" stop-color="#0B0B0F" stop-opacity="1"/>
  </linearGradient>

  <!-- Hero vignette: radial-gradient(ellipse at 50% 30%, transparent 40%, rgba(11,11,15,0.5) 100%) -->
  <radialGradient id="heroVignette" cx="50%" cy="30%" r="70%" gradientUnits="objectBoundingBox">
    <stop offset="40%"  stop-color="#0B0B0F" stop-opacity="0"/>
    <stop offset="100%" stop-color="#0B0B0F" stop-opacity="0.5"/>
  </radialGradient>

  <!-- Hero glow: purple left, blue right -->
  <radialGradient id="heroGlowL" cx="20%" cy="0%" r="55%" gradientUnits="objectBoundingBox">
    <stop offset="0%"   stop-color="#8A5CF6" stop-opacity="0.55"/>
    <stop offset="100%" stop-color="#8A5CF6" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="heroGlowR" cx="85%" cy="10%" r="50%" gradientUnits="objectBoundingBox">
    <stop offset="0%"   stop-color="#60A5FA" stop-opacity="0.45"/>
    <stop offset="100%" stop-color="#60A5FA" stop-opacity="0"/>
  </radialGradient>

  <!-- Hero grid — 40×40, 4% opacity lines -->
  <pattern id="heroGrid" width="40" height="40" patternUnits="userSpaceOnUse">
    <line x1="0" y1="0" x2="40" y2="0" stroke="white" stroke-width="0.5" stroke-opacity="0.04"/>
    <line x1="0" y1="0" x2="0" y2="40" stroke="white" stroke-width="0.5" stroke-opacity="0.04"/>
  </pattern>
</defs>

<!-- ══ CONTENT BACKGROUND (below hero) ══════════════════════════ -->
<rect x="0" y="${CONT_Y}" width="${W}" height="${H - CONT_Y}" fill="#0B0B0F"/>

<!-- ══ HERO OVERLAYS — painted over the article photo (below SVG) -->
<!-- glow accents first, then grid, vignette, finally gradient overlay -->
<rect x="0" y="0" width="${W}" height="${HERO_H}" fill="url(#heroGlowL)"/>
<rect x="0" y="0" width="${W}" height="${HERO_H}" fill="url(#heroGlowR)"/>
<rect x="0" y="0" width="${W}" height="${HERO_H}" fill="url(#heroGrid)" opacity="0.5"/>
<rect x="0" y="0" width="${W}" height="${HERO_H}" fill="url(#heroVignette)"/>
<rect x="0" y="0" width="${W}" height="${HERO_H}" fill="url(#heroOverlay)"/>

<!-- ══ TOP BAR (absolute: top:36 left:36 right:36) ══════════════ -->

<!-- Brand mark: 52×52, radius:14, purple gradient, glow shadow -->
<!-- box-shadow:0 0 24px rgba(138,92,246,0.6) approximated by layering -->
<rect x="30" y="30" width="64" height="64" rx="18" fill="rgba(138,92,246,0.3)"/>
<rect x="36" y="36" width="52" height="52" rx="14" fill="url(#purpGrad)"/>
<text x="62" y="71"
      font-family="${FP}" font-size="24" font-weight="800" fill="white" text-anchor="middle">N</text>

<!-- Brand text: name (Poppins 700 21px) + tagline (Inter italic 12px teal) -->
<text x="102" y="60"
      font-family="${FP}" font-size="21" font-weight="700" fill="white">Novas Beat</text>
<text x="102" y="79"
      font-family="${FI}" font-size="12" font-style="italic" fill="#38E0D2">The world, unfiltered.</text>

<!-- Category tag: below brand col, gap:14px → top at 36+52+14=102 -->
<!-- padding:10px 22px, radius:9px, Poppins 700 16px -->
<rect x="36" y="102" width="${catW}" height="${catH}" rx="9" fill="url(#purpGrad)"/>
<text x="${36 + catW / 2}" y="125"
      font-family="${FP}" font-size="16" font-weight="700" fill="white"
      text-anchor="middle" letter-spacing="0.6">${cat}</text>

<!-- Breaking News badge: right side, padding:10px 20px radius:999px Poppins 700 14px -->
<!-- Width: "● Breaking News" ≈ 175px -->
<rect x="${W - 36 - 175}" y="36" width="175" height="34" rx="17" fill="url(#purpGrad)"/>
<circle cx="${W - 36 - 175 + 18}" cy="53" r="4" fill="white"/>
<text x="${W - 36 - 175 + 30}" y="57"
      font-family="${FP}" font-size="14" font-weight="700" fill="white" letter-spacing="0.5">BREAKING NEWS</text>

<!-- ══ HEADLINE (padding-top:24 from CONT_Y=560, Poppins 800 ${HL_FS}px) ══ -->
<!-- Line 1: white -->
<text x="${PAD_X}" y="${HL_Y1}"
      font-family="${FP}" font-size="${HL_FS}" font-weight="800" fill="white"
      letter-spacing="${(-HL_FS * 0.01).toFixed(1)}"
>${esc(String(line1 || '').toUpperCase())}</text>
<!-- Line 2: gradient purple→blue (.accent) -->
<text x="${PAD_X}" y="${HL_Y2}"
      font-family="${FP}" font-size="${HL_FS}" font-weight="800" fill="url(#hl2Grad)"
      letter-spacing="${(-HL_FS * 0.01).toFixed(1)}"
>${esc(String(line2 || '').toUpperCase())}</text>

<!-- ══ DESCRIPTION (margin-top:22px, padding-left:18px, border-left:3px #8A5CF6) ══ -->
<rect x="${PAD_X}" y="${DESC_TOP}" width="3"
      height="${DESC_LH * Math.max(1, descLines.length) + 4}" rx="1.5" fill="#8A5CF6"/>
${descLines.map((dl, i) =>
  `<text x="${PAD_X + 18}" y="${DESC_Y1 + i * DESC_LH}"
      font-family="${FI}" font-size="${DESC_FS}" fill="#D8D6E3">${esc(dl)}</text>`
).join('\n')}

<!-- ══ ICON CARDS (margin-top:26px, gap:18px, 3 cards) ══════════ -->
${cardsSvg}

<!-- ══ META BAR (margin-top:22px, padding-top:18px, border-top) ══ -->
<line x1="${PAD_X}" y1="${META_Y}" x2="${W - PAD_X}" y2="${META_Y}"
      stroke="rgba(255,255,255,0.1)" stroke-width="1"/>

<!-- meta-left: source text (Inter 14px #C9C6D8) -->
<text x="${PAD_X}" y="${BTN_CY + 5}"
      font-family="${FI}" font-size="14" fill="#C9C6D8"
>Source: <tspan font-weight="600" fill="white">Novas Beat News Desk</tspan></text>

<!-- read-more pill button: padding 13px 26px, Poppins 600 14.5px -->
<rect x="${BTN_X}" y="${BTN_Y}" width="${BTN_W}" height="${BTN_H}" rx="${BTN_H / 2}" fill="url(#purpGrad)"/>
<text x="${BTN_X + BTN_W / 2 - 14}" y="${BTN_CY + 5}"
      font-family="${FP}" font-size="14.5" font-weight="600" fill="white"
      text-anchor="middle">For more news, visit novasbeat.com</text>
<g transform="translate(${BTN_X + BTN_W - 30},${BTN_CY - 8}) scale(${(16 / 24).toFixed(4)})">
  <path d="${ARROW_PATH}" fill="white"/>
</g>

<!-- ══ FOOTER (margin-top:20px, gradient 90°, padding:22px 40px) ══ -->
<rect x="0" y="${FT_Y}" width="${W}" height="${FT_H}" fill="url(#ftGrad)"/>

<!-- footer-logo-mark: 42×42, radius:12, rgba(255,255,255,0.16) border -->
<rect x="${PAD_X}" y="${FT_CY - 21}" width="42" height="42" rx="12"
      fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
<text x="${PAD_X + 21}" y="${FT_CY + 7}"
      font-family="${FP}" font-size="19" font-weight="800" fill="white" text-anchor="middle">N</text>

<!-- footer text: site Poppins 700 17px + label Inter 400 12.5px -->
<text x="${PAD_X + 54}" y="${FT_CY - 2}"
      font-family="${FP}" font-size="17" font-weight="700" fill="white">novasbeat.com</text>
<text x="${PAD_X + 54}" y="${FT_CY + 17}"
      font-family="${FI}" font-size="12.5" fill="rgba(255,255,255,0.8)"
>AI-powered · Verified across hundreds of sources</text>

</svg>`);
}

// ── Public API ─────────────────────────────────────────────────────
// headline: string OR { line1, line2 } (from grok.generateShortHeadline)
export async function buildBrandedImage(imageUrl, headline, category, opts = {}) {
  const { body = '', summary, keyPoints } = opts;

  // Resolve headline into two display lines
  let line1, line2;
  if (headline && typeof headline === 'object' && headline.line1) {
    line1 = String(headline.line1).trim();
    line2 = String(headline.line2 || '').trim();
  } else {
    const words = String(headline || '').trim().split(/\s+/);
    const mid   = Math.ceil(words.length / 2);
    line1 = words.slice(0, mid).join(' ');
    line2 = words.slice(mid).join(' ');
  }

  const description = summary || makeSummary(body, 160);

  // 1. Download article photo — hero slot, 1080×560 cover crop
  let photo = null;
  if (imageUrl) {
    console.log('[brandImage] Downloading photo:', imageUrl);
    try {
      const dl = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 25000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsPostAuto/1.0)' },
      });
      photo = await sharp(Buffer.from(dl.data))
        .resize(W, HERO_H, { fit: 'cover', position: 'attention' })
        .jpeg({ quality: 90 })
        .toBuffer();
      console.log('[brandImage] Photo OK —', photo.length, 'bytes');
    } catch (e) {
      console.warn('[brandImage] Photo download FAILED:', e.message, '→ using gradient hero');
    }
  } else {
    console.log('[brandImage] No imageUrl — using gradient hero');
  }

  // 2. Dark 1080×1080 base canvas
  const bg = await sharp({
    create: { width: W, height: H, channels: 3, background: { r: 11, g: 11, b: 15 } },
  }).png().toBuffer();

  // 3. SVG overlay (everything except the article photo)
  const svgBuf = buildSvg({ line1, line2, description, category, keyPoints });

  // 4. Composite: base → article photo → SVG overlay
  const layers = [];

  if (photo) {
    // Photo fills the hero area (top 560px); SVG overlays go on top
    layers.push({ input: photo, top: 0, left: 0 });
  } else {
    // Fallback: gradient hero in the brand purple-dark range
    const heroBg = await sharp({
      create: { width: W, height: HERO_H, channels: 3, background: { r: 68, g: 58, b: 122 } },
    }).jpeg({ quality: 80 }).toBuffer();
    layers.push({ input: heroBg, top: 0, left: 0 });
  }

  layers.push({ input: svgBuf, top: 0, left: 0 });

  // 5. Final output — 1080×1080 JPEG (no extra resize needed; base already correct size)
  const out = await sharp(bg)
    .composite(layers)
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer();

  return uploadBufferToSupabase(out, `branded-${Date.now()}.jpg`, 'image/jpeg');
}

export default { buildBrandedImage, makeSummary };
