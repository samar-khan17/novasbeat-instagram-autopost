// ═══════════════════════════════════════════════════════════════════
// NewsPost Auto — REST API routes
// ═══════════════════════════════════════════════════════════════════
import express from 'express';
import { supabase, T_ARTICLES, T_SETTINGS } from './database.js';
import * as scraper   from './scraper.js';
import * as scheduler from './scheduler.js';
import * as instagram from './instagram.js';
import * as grok      from './grok.js';
import * as nvidia    from './nvidia.js';
import { buildBrandedImage, makeSummary } from './brandImage.js';
import { buildStoryImage } from './buildStoryImage.js';
import { uploadImageToSupabase, uploadBufferToSupabase } from './supabaseStorage.js';

const router = express.Router();

// ── GET /api/articles?status=pending ────────────────────────────────
router.get('/articles', async (req, res) => {
  try {
    let q = supabase.from(T_ARTICLES).select('*').order('scraped_at', { ascending: false });
    if (req.query.status) q = q.eq('status', req.query.status);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/queue ──────────────────────────────────────────────────
router.get('/queue', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from(T_ARTICLES).select('*')
      .eq('status', 'pending')
      .order('scraped_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/stats ──────────────────────────────────────────────────
router.get('/stats', async (_req, res) => {
  try {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const weekStart  = new Date(); weekStart.setDate(weekStart.getDate() - 7);
    const countOf = async (build) => {
      const { count } = await build(
        supabase.from(T_ARTICLES).select('id', { count: 'exact', head: true })
      );
      return count || 0;
    };
    const [today, week, pending, failed] = await Promise.all([
      countOf((q) => q.eq('status', 'posted').gte('posted_at', todayStart.toISOString())),
      countOf((q) => q.eq('status', 'posted').gte('posted_at', weekStart.toISOString())),
      countOf((q) => q.eq('status', 'pending')),
      countOf((q) => q.eq('status', 'failed')),
    ]);
    res.json({ today, week, pending, failed });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Helper: build branded image with AI key-points + short headline ──
async function buildBrandedWithAI(art, headline, category, opts = {}) {
  const body    = art.body || '';
  const summary = makeSummary(body);

  let keyPoints, headlineSplit;
  try { keyPoints     = await grok.generateKeyPoints(headline, body);     } catch { /* fallback */ }
  try { headlineSplit = await grok.generateShortHeadline(headline, body); } catch { /* fallback */ }

  return buildBrandedImage(art.image_url, headlineSplit || headline, category, {
    ...opts,
    body,
    summary,
    keyPoints,
  });
}

// ── POST /api/preview/:id ───────────────────────────────────────────
router.post('/preview/:id', async (req, res) => {
  try {
    const { data: art, error } = await supabase.from(T_ARTICLES).select('*').eq('id', req.params.id).single();
    if (error || !art) throw new Error('Article not found');

    const settings = await (await import('./database.js')).getSettings();
    const mode     = settings.image_mode || 'branded';

    const opts = {
      template:         req.body?.template,
      headlineOffset:   req.body?.headlineOffset,
      logoPosition:     req.body?.logoPosition,
      fontScale:        req.body?.fontScale,
      textAlign:        req.body?.textAlign,
      highlightColor:   req.body?.highlightColor,
      gradientStrength: req.body?.gradientStrength,
      showFooter:       req.body?.showFooter,
      accentColor:      req.body?.accentColor,
    };
    const headline = req.body?.headline || art.headline;
    const category = req.body?.category || art.category;

    let imageUrl;
    if (mode === 'branded') {
      if (!art.image_url) throw new Error('No source image to brand');
      imageUrl = await buildBrandedWithAI(art, headline, category, opts);
    } else if (mode === 'enhance') {
      imageUrl = await nvidia.enhanceImage(art.image_url, settings.brand_colors || '#8A5CF6');
    } else if (mode === 'recreate') {
      const b64 = await nvidia.recreateImage(headline);
      imageUrl = await uploadBufferToSupabase(Buffer.from(b64, 'base64'), `recreate-${art.id}-${Date.now()}.jpg`, 'image/jpeg');
    } else {
      imageUrl = await uploadImageToSupabase(art.image_url, `original-${art.id}-${Date.now()}.jpg`);
    }

    let caption = '', hashtags = '';
    try { caption  = await grok.generateCaption(headline, art.body); } catch { }
    try { hashtags = await grok.generateHashtags(headline, art.body); } catch { }
    if (!hashtags) hashtags = settings.default_hashtags || '';

    res.json({ success: true, imageUrl, caption, hashtags, mode });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── POST /api/story-preview/:id ─────────────────────────────────────
router.post('/story-preview/:id', async (req, res) => {
  try {
    const { brandedImageUrl, caption, originalImageUrl } = req.body || {};
    if (!brandedImageUrl) throw new Error('brandedImageUrl is required');
    const storyImageUrl = await buildStoryImage(brandedImageUrl, caption || '', { originalImageUrl });
    res.json({ success: true, storyImageUrl });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── POST /api/batch-post ─────────────────────────────────────────────
router.post('/batch-post', async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length)
    return res.status(400).json({ success: false, error: 'ids array required' });
  const results = [];
  for (const id of ids) {
    try {
      const r = await scheduler.runNow(id);
      results.push({ id, success: true, ...r });
    } catch (e) {
      results.push({ id, success: false, error: e.message });
    }
  }
  const failed = results.filter((r) => !r.success).length;
  res.json({ success: true, posted: results.length - failed, failed, results });
});

// ── POST /api/post-now/:id ──────────────────────────────────────────
router.post('/post-now/:id', async (req, res) => {
  try {
    const override = {
      imageUrl: req.body?.imageUrl,
      caption:  req.body?.caption,
      hashtags: req.body?.hashtags,
    };
    const result = await scheduler.runNow(req.params.id, override);
    res.json({ success: true, ...result });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── POST /api/skip/:id ──────────────────────────────────────────────
router.post('/skip/:id', async (req, res) => {
  try {
    const { error } = await supabase.from(T_ARTICLES).update({ status: 'skipped' }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── POST /api/scrape-now ────────────────────────────────────────────
router.post('/scrape-now', async (_req, res) => {
  try {
    const newArticles = await scraper.scrapeArticles();
    res.json({ success: true, newArticles });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── GET /api/settings ───────────────────────────────────────────────
router.get('/settings', async (_req, res) => {
  try {
    const { data, error } = await supabase.from(T_SETTINGS).select('key,value');
    if (error) throw error;
    const obj = {};
    (data || []).forEach((r) => { obj[r.key] = r.value; });
    res.json(obj);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/settings ──────────────────────────────────────────────
router.post('/settings', async (req, res) => {
  try {
    const rows = Object.entries(req.body || {}).map(([key, value]) => ({ key, value: String(value) }));
    if (rows.length) {
      const { error } = await supabase.from(T_SETTINGS).upsert(rows, { onConflict: 'key' });
      if (error) throw error;
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── POST /api/test-instagram ────────────────────────────────────────
router.post('/test-instagram', async (_req, res) => {
  const result = await instagram.testConnection();
  res.json(result);
});

// ── POST /api/test-grok ─────────────────────────────────────────────
router.post('/test-grok', async (_req, res) => {
  try {
    const sample = await grok.generateCaption('Test headline', 'Test body');
    res.json({ success: true, sample });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── POST /api/test-nvidia ───────────────────────────────────────────
router.post('/test-nvidia', async (_req, res) => {
  const keys = [process.env.NVIDIA_KEY_1, process.env.NVIDIA_KEY_2, process.env.NVIDIA_KEY_3].filter(Boolean);
  res.json({ success: keys.length > 0, message: `${keys.length} NVIDIA key(s) configured` });
});

// ── DELETE /api/articles/:id ────────────────────────────────────────
router.delete('/articles/:id', async (req, res) => {
  try {
    const { error } = await supabase.from(T_ARTICLES).delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── DELETE /api/articles (bulk) ─────────────────────────────────────
router.delete('/articles', async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || !ids.length)
      return res.status(400).json({ success: false, error: 'ids array required' });
    const { error } = await supabase.from(T_ARTICLES).delete().in('id', ids);
    if (error) throw error;
    res.json({ success: true, deleted: ids.length });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Image Editor helpers ─────────────────────────────────────────────
router.post('/editor/enhance/:id', async (req, res) => {
  try {
    const { data: art, error } = await supabase.from(T_ARTICLES).select('*').eq('id', req.params.id).single();
    if (error || !art) throw new Error('Article not found');
    const brandColors = req.body?.brandColors || '#8A5CF6';
    const url = await nvidia.enhanceImage(art.image_url, brandColors);
    res.json({ success: true, url });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/editor/branded/:id', async (req, res) => {
  try {
    const { data: art, error } = await supabase.from(T_ARTICLES).select('*').eq('id', req.params.id).single();
    if (error || !art) throw new Error('Article not found');
    const headline = req.body?.headline || art.headline;
    const category = req.body?.category || art.category;
    const opts     = {
      template:         req.body?.template,
      headlineOffset:   req.body?.headlineOffset,
      logoPosition:     req.body?.logoPosition,
      fontScale:        req.body?.fontScale,
      textAlign:        req.body?.textAlign,
      highlightColor:   req.body?.highlightColor,
      gradientStrength: req.body?.gradientStrength,
      showFooter:       req.body?.showFooter,
      accentColor:      req.body?.accentColor,
    };
    const url = await buildBrandedWithAI(art, headline, category, opts);
    res.json({ success: true, url });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/editor/recreate/:id', async (req, res) => {
  try {
    const { data: art, error } = await supabase.from(T_ARTICLES).select('*').eq('id', req.params.id).single();
    if (error || !art) throw new Error('Article not found');
    const prompt = req.body?.prompt || art.headline;
    const b64    = await nvidia.recreateImage(prompt);
    const buffer = Buffer.from(b64, 'base64');
    const url    = await uploadBufferToSupabase(buffer, `recreate-${art.id}-${Date.now()}.jpg`, 'image/jpeg');
    res.json({ success: true, url });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/editor/save/:id', async (req, res) => {
  try {
    const { imageUrl, mode } = req.body || {};
    const patch = {};
    if (imageUrl) patch.supabase_image_url = imageUrl;
    const { error } = await supabase.from(T_ARTICLES).update(patch).eq('id', req.params.id);
    if (error) throw error;
    if (mode) await supabase.from(T_SETTINGS).upsert({ key: 'image_mode', value: mode }, { onConflict: 'key' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

export default router;
