// ═══════════════════════════════════════════════════════════════════
// NewsPost Auto — NVIDIA key pool + image AI + Sharp brand-overlay
// Rotates through 3 keys (NVIDIA_KEY_1/2/3) on 429 / auth errors.
// ═══════════════════════════════════════════════════════════════════
import axios from 'axios';
import sharp from 'sharp';
import { uploadBufferToSupabase } from './supabaseStorage.js';

const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';
const SANA_MODEL  = 'nvidia/sana-1.5-4.1b-1024px';

// ── Key pool ─────────────────────────────────────────────────────────
function getKeys() {
  const keys = [
    process.env.NVIDIA_KEY_1,
    process.env.NVIDIA_KEY_2,
    process.env.NVIDIA_KEY_3,
  ].filter(Boolean);
  if (!keys.length) throw new Error('No NVIDIA keys set (NVIDIA_KEY_1/2/3 in .env)');
  return keys;
}

let _keyIdx = 0;

function nextKey() {
  const keys = getKeys();
  const key = keys[_keyIdx % keys.length];
  _keyIdx++;
  return key;
}

// ── Generate a fresh cover image from headline (NVIDIA SANA) ────────
export async function recreateImage(headline) {
  const keys = getKeys();
  const prompt = `Professional editorial news photo for: ${headline}. Cinematic, high quality, photorealistic.`;
  const url = `${NVIDIA_BASE}/genai/${SANA_MODEL}`;

  let lastErr;
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const apiKey = keys[(attempt + _keyIdx) % keys.length];
    try {
      const resp = await axios.post(
        url,
        { prompt, width: 1024, height: 1024, steps: 25, seed: Math.floor(Math.random() * 1e6) },
        {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          timeout: 120000,
        }
      );
      const d = resp.data || {};
      const b64 =
        d.image ||
        d.artifacts?.[0]?.base64 ||
        d.data?.[0]?.b64_json ||
        d.images?.[0] ||
        (typeof d === 'string' ? d : null);
      if (!b64) throw new Error('NVIDIA returned no image data');
      _keyIdx = (attempt + _keyIdx + 1) % keys.length;
      return String(b64).replace(/^data:image\/\w+;base64,/, '');
    } catch (e) {
      lastErr = e;
      const status = e.response?.status;
      if (status === 429 || status === 401 || status === 403) continue;
      throw e;
    }
  }
  throw lastErr;
}

// ── Enhance an existing image with brand-colour overlay ──────────────
function hexToRgb(hex) {
  const h = String(hex || '#9333EA').replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const int = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(int)) return { r: 147, g: 51, b: 234 };
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

export async function enhanceImage(imageUrl, brandColors) {
  if (!imageUrl) throw new Error('No source image URL to enhance');

  const colors = String(brandColors || '#9333EA')
    .split(',').map((c) => c.trim()).filter(Boolean);
  const { r, g, b } = hexToRgb(colors[0]);

  const dl = await axios.get(imageUrl, {
    responseType: 'arraybuffer', timeout: 20000,
    headers: { 'User-Agent': 'NewsPostAuto/1.0' },
  });

  const SIZE = 1080;
  const overlay = Buffer.from(
    `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${SIZE}" height="${SIZE}" fill="rgb(${r},${g},${b})" fill-opacity="0.28"/>` +
    `</svg>`
  );

  const out = await sharp(Buffer.from(dl.data))
    .resize(SIZE, SIZE, { fit: 'cover', position: 'centre' })
    .composite([{ input: overlay, blend: 'over' }])
    .sharpen()
    .jpeg({ quality: 90 })
    .toBuffer();

  return await uploadBufferToSupabase(out, `enhanced-${Date.now()}.jpg`, 'image/jpeg');
}

export default { recreateImage, enhanceImage };
