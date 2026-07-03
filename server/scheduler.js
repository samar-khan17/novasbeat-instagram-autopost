// ═══════════════════════════════════════════════════════════════════
// NewsPost Auto — posting pipeline + cron scheduler
// ═══════════════════════════════════════════════════════════════════
import cron from 'node-cron';
import { supabase, getSettings, T_ARTICLES } from './database.js';
import * as grok      from './grok.js';
import * as nvidia    from './nvidia.js';
import * as instagram from './instagram.js';
import { buildBrandedImage, makeSummary } from './brandImage.js';
import { buildStoryImage } from './buildStoryImage.js';
import { uploadImageToSupabase, uploadBufferToSupabase } from './supabaseStorage.js';

let schedulerJob = null;

function hoursToCron(hours) {
  const h = Math.max(1, parseInt(hours, 10) || 2);
  if (h >= 24) return '0 9 * * *';
  return `0 */${h} * * *`;
}

async function dailyCapReached(maxPerDay) {
  const cap   = parseInt(maxPerDay, 10) || 10;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const { count } = await supabase
    .from(T_ARTICLES).select('id', { count: 'exact', head: true })
    .eq('status', 'posted').gte('posted_at', start.toISOString());
  return (count || 0) >= cap;
}

export async function runPipeline(articleId, override = {}) {
  const { data: article, error: loadErr } = await supabase
    .from(T_ARTICLES).select('*').eq('id', articleId).single();
  if (loadErr || !article) throw new Error(`Article not found: ${loadErr?.message || articleId}`);

  await supabase.from(T_ARTICLES).update({ status: 'scheduled' }).eq('id', articleId);

  try {
    const settings   = await getSettings();
    const imageMode  = settings.image_mode  || 'branded';
    const brandColors = settings.brand_colors || '#8A5CF6';

    // Caption + hashtags
    const caption  = override.caption  || await grok.generateCaption(article.headline, article.body);
    let   hashtags = override.hashtags;
    if (!hashtags) {
      hashtags = await grok.generateHashtags(article.headline, article.body).catch(() => '');
      if (!hashtags) hashtags = settings.default_hashtags || '';
    }

    // Image
    let finalImageUrl;
    if (override.imageUrl) {
      finalImageUrl = override.imageUrl;
    } else if (imageMode === 'branded') {
      if (!article.image_url) throw new Error('No source image to brand');
      const body    = article.body || '';
      const summary = makeSummary(body);
      let keyPoints, headlineSplit;
      try { keyPoints     = await grok.generateKeyPoints(article.headline, body);       } catch { }
      try { headlineSplit = await grok.generateShortHeadline(article.headline, body);   } catch { }
      finalImageUrl = await buildBrandedImage(
        article.image_url,
        headlineSplit || article.headline,
        article.category,
        { body, summary, keyPoints },
      );
    } else if (imageMode === 'recreate') {
      const b64 = await nvidia.recreateImage(article.headline);
      finalImageUrl = await uploadBufferToSupabase(
        Buffer.from(b64, 'base64'), `recreate-${articleId}-${Date.now()}.jpg`, 'image/jpeg'
      );
    } else if (imageMode === 'enhance') {
      if (!article.image_url) throw new Error('No source image to enhance');
      finalImageUrl = await nvidia.enhanceImage(article.image_url, brandColors);
    } else {
      if (!article.image_url) throw new Error('Article has no image');
      finalImageUrl = await uploadImageToSupabase(article.image_url, `original-${articleId}-${Date.now()}.jpg`);
    }

    // Post to Instagram feed
    const postId = await instagram.postToInstagram(finalImageUrl, caption, hashtags);

    // Also post story
    let storyId = null;
    if ((settings.post_to_story || 'on') === 'on') {
      try {
        const storyUrl = await buildStoryImage(finalImageUrl, caption, { originalImageUrl: article.image_url });
        storyId = await instagram.postStoryToInstagram(storyUrl);
        console.log(`[Pipeline] ✓ Story → ${storyId}`);
      } catch (storyErr) {
        console.warn('[Pipeline] story skipped:', storyErr.message);
      }
    }

    await supabase.from(T_ARTICLES).update({
      status: 'posted',
      posted_at: new Date().toISOString(),
      instagram_post_id: postId,
      caption, hashtags,
      supabase_image_url: finalImageUrl,
    }).eq('id', articleId);

    console.log(`[Pipeline] ✓ "${article.headline?.slice(0, 50)}" → IG ${postId}${storyId ? ' (+story)' : ''}`);
    return { success: true, instagram_post_id: postId, story_id: storyId };
  } catch (err) {
    await supabase.from(T_ARTICLES).update({
      status: 'failed', error_message: err.message,
    }).eq('id', articleId);
    console.error(`[Pipeline] ✗ "${article.headline?.slice(0, 50)}":`, err.message);
    throw err;
  }
}

// One fixed 5-minute heartbeat handles BOTH modes; settings are re-read live
// each tick so changing them in the admin takes effect immediately (no restart).
//   post_mode = 'schedule' → posts one article every `post_interval` hours
//   post_mode = 'realtime' → posts new articles as soon as they're scraped
//                            (matches the website's timing), up to the daily cap.
// The daily cap is clamped to 25 — Instagram's API publishing limit per 24h.
export async function startScheduler() {
  if (schedulerJob) schedulerJob.stop();
  schedulerJob = cron.schedule('*/5 * * * *', async () => {
    try {
      const s = await getSettings();
      if ((s.auto_post || 'off') !== 'on') return;

      const cap = Math.min(25, Math.max(1, parseInt(s.max_posts_per_day, 10) || 25));
      if (await dailyCapReached(cap)) return;

      // In schedule mode, throttle: wait `post_interval` hours since the last post.
      if ((s.post_mode || 'schedule') === 'schedule') {
        const intervalMs = Math.max(1, parseInt(s.post_interval, 10) || 1) * 3600 * 1000;
        const { data: last } = await supabase
          .from(T_ARTICLES).select('posted_at').eq('status', 'posted')
          .order('posted_at', { ascending: false }).limit(1).maybeSingle();
        if (last?.posted_at && (Date.now() - new Date(last.posted_at).getTime()) < intervalMs) return;
      }
      // realtime mode: no extra wait — post the next queued article now.

      const { data: next } = await supabase
        .from(T_ARTICLES).select('id,headline').eq('status', 'pending')
        .order('scraped_at', { ascending: true }).limit(1).maybeSingle();
      if (!next) return;
      console.log(`[Scheduler] (${s.post_mode || 'schedule'}) Posting: "${next.headline?.slice(0, 50)}"`);
      await runPipeline(next.id);
    } catch (e) { console.error('[Scheduler] tick error:', e.message); }
  });
  console.log('[Scheduler] Started — 5-min heartbeat (mode/interval read live).');
  return schedulerJob;
}

export function stopScheduler() {
  if (schedulerJob) { schedulerJob.stop(); schedulerJob = null; }
}

export async function runNow(articleId, override = {}) {
  return runPipeline(articleId, override);
}

export default { runPipeline, startScheduler, stopScheduler, runNow };
