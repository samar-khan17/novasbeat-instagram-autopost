// ═══════════════════════════════════════════════════════════════════
// NewsPost Auto — Supabase Storage helper
// Downloads a remote image and uploads it to the "news-images" bucket,
// returning a public URL. Also exposes uploadBufferToSupabase for the
// image pipeline (Sharp / NVIDIA output).
// ═══════════════════════════════════════════════════════════════════
import axios from 'axios';
import { supabase } from './database.js';

const BUCKET = 'news-images';

function extToContentType(urlOrName = '') {
  const u = urlOrName.toLowerCase();
  if (u.endsWith('.png'))  return 'image/png';
  if (u.endsWith('.webp')) return 'image/webp';
  if (u.endsWith('.gif'))  return 'image/gif';
  return 'image/jpeg';
}

// Upload an already-in-memory buffer (used by Sharp/NVIDIA results).
export async function uploadBufferToSupabase(buffer, fileName, contentType = 'image/jpeg') {
  const path = fileName.replace(/^\/+/, '');
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType, upsert: true });

  if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data || !data.publicUrl) throw new Error('Could not resolve public URL after upload');
  return data.publicUrl;
}

// Download from a remote URL, then upload to Supabase Storage.
export async function uploadImageToSupabase(imageUrl, fileName) {
  try {
    if (!imageUrl) throw new Error('No image URL provided');

    const resp = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 20000,
      headers: { 'User-Agent': 'NewsPostAuto/1.0' },
      maxContentLength: 25 * 1024 * 1024,
    });

    const buffer = Buffer.from(resp.data);
    const contentType =
      resp.headers['content-type'] && resp.headers['content-type'].startsWith('image/')
        ? resp.headers['content-type']
        : extToContentType(imageUrl);

    const safeName = fileName || `news-${Date.now()}.jpg`;
    return await uploadBufferToSupabase(buffer, safeName, contentType);
  } catch (err) {
    console.error('[Storage] uploadImageToSupabase error:', err.message);
    throw err;
  }
}

export default uploadImageToSupabase;
