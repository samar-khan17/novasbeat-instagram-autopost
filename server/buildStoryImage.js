// Builds a 1080×1920 Instagram Story image that looks like a shared post:
// - blurred-dark background from the article photo
// - the branded 4:5 feed post as a centered card (with white header bar)
// - a white caption snippet card below
import axios from 'axios';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { uploadBufferToSupabase } from './supabaseStorage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.join(__dirname, 'assets', 'logo.png');

// Story canvas
const SW = 1080, SH = 1920;

// Post card sizing
const CARD_W  = 860;
const CARD_X  = Math.round((SW - CARD_W) / 2);   // 110 — equal side margins
const HDR_H   = 88;
const IMG_H   = Math.round(CARD_W * (1350 / 1080)); // 1075 — preserves 4:5 ratio
const CARD_H  = HDR_H + IMG_H;                     // 1163

// Caption card
const CAP_H   = 108;
const GAP     = 18;

// Vertical centering: put the whole block in the middle of 1920px
const BLOCK_H = CARD_H + GAP + CAP_H;             // 1289
const CARD_Y  = Math.round((SH - BLOCK_H) / 2);   // 315
const IMG_Y   = CARD_Y + HDR_H;                   // 403
const CAP_Y   = CARD_Y + CARD_H + GAP;            // 1496
const R       = 22;

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function topRound(x, y, w, h, r) {
  return `M ${x+r},${y} H ${x+w-r} Q ${x+w},${y} ${x+w},${y+r} V ${y+h} H ${x} V ${y+r} Q ${x},${y} ${x+r},${y} Z`;
}

function fullRound(x, y, w, h, r) {
  return `M ${x+r},${y} H ${x+w-r} Q ${x+w},${y} ${x+w},${y+r} V ${y+h-r} Q ${x+w},${y+h} ${x+w-r},${y+h} H ${x+r} Q ${x},${y+h} ${x},${y+h-r} V ${y+r} Q ${x},${y} ${x+r},${y} Z`;
}

function buildSvg(caption) {
  const raw   = String(caption || '').trim().slice(0, 200);
  const l1    = esc(raw.slice(0, 72));
  const l2raw = raw.length > 72 ? raw.slice(72, 138) + (raw.length > 138 ? '…' : '') : '';
  const l2    = esc(l2raw);

  return Buffer.from(`<svg width="${SW}" height="${SH}" xmlns="http://www.w3.org/2000/svg">
  <path d="${topRound(CARD_X, CARD_Y, CARD_W, HDR_H, R)}" fill="#ffffff"/>
  <text x="${CARD_X + 84}" y="${CARD_Y + 56}"
        font-family="'Arial Black','Segoe UI',Arial,sans-serif"
        font-size="30" font-weight="700" fill="#111111">novasbeatnews</text>
  <path d="${fullRound(CARD_X, CAP_Y, CARD_W, CAP_H, R)}" fill="#ffffff"/>
  <text x="${CARD_X + 22}" y="${CAP_Y + 38}"
        font-family="'Arial Black','Segoe UI',Arial,sans-serif"
        font-size="24" font-weight="700" fill="#111111">novasbeatnews</text>
  <text x="${CARD_X + 22}" y="${CAP_Y + 66}"
        font-family="Arial,Helvetica,sans-serif"
        font-size="22" fill="#222222">"${l1}</text>
  ${l2 ? `<text x="${CARD_X + 22}" y="${CAP_Y + 92}"
        font-family="Arial,Helvetica,sans-serif"
        font-size="22" fill="#555555">${l2}<tspan fill="#9CA3AF"> more</tspan></text>` : ''}
</svg>`);
}

/**
 * @param {string} brandedImageUrl  - URL of the already-built 1080×1350 branded feed image
 * @param {string} caption          - Article caption for the snippet card
 * @param {{ originalImageUrl?: string }} opts
 */
export async function buildStoryImage(brandedImageUrl, caption, opts = {}) {
  if (!brandedImageUrl) throw new Error('No branded image URL for story');

  // Download the branded feed image
  const feedDl = await axios.get(brandedImageUrl, {
    responseType: 'arraybuffer', timeout: 30000,
    headers: { 'User-Agent': 'NewsPostAuto/1.0' },
  });
  const feedBuf = Buffer.from(feedDl.data);

  // Background: original article image (blurred + very dark) or fall back to feed image
  let bgBuf = feedBuf;
  if (opts.originalImageUrl) {
    try {
      const origDl = await axios.get(opts.originalImageUrl, {
        responseType: 'arraybuffer', timeout: 20000,
        headers: { 'User-Agent': 'NewsPostAuto/1.0' },
      });
      bgBuf = Buffer.from(origDl.data);
    } catch (_) { /* stay with feedBuf */ }
  }

  // Blurred dark background fills the entire 1080×1920 canvas
  const bg = await sharp(bgBuf)
    .resize(SW, SH, { fit: 'cover', position: 'attention' })
    .blur(30)
    .modulate({ brightness: 0.28 })
    .toBuffer();

  // Scale the branded feed post to fill the card image area (top-crop keeps the branded elements)
  const postImg = await sharp(feedBuf)
    .resize(CARD_W, IMG_H, { fit: 'cover', position: 'top' })
    .toBuffer();

  const layers = [
    { input: postImg, top: IMG_Y,  left: CARD_X },
    { input: buildSvg(caption) },
  ];

  // NovasBeat logo in the white header bar
  if (fs.existsSync(LOGO_PATH)) {
    try {
      const logo = await sharp(LOGO_PATH).resize(56, 56, { fit: 'contain' }).png().toBuffer();
      layers.push({ input: logo, top: CARD_Y + Math.round((HDR_H - 56) / 2), left: CARD_X + 16 });
    } catch (_) { /* logo is optional */ }
  }

  const out = await sharp(bg).composite(layers).jpeg({ quality: 92 }).toBuffer();
  return uploadBufferToSupabase(out, `story-${Date.now()}.jpg`, 'image/jpeg');
}

export default { buildStoryImage };
