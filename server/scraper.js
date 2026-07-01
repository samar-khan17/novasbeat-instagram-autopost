// ═══════════════════════════════════════════════════════════════════
// NewsPost Auto — article ingest
//
// Two source modes (Settings → "source_mode"):
//   • "database" (default & recommended) — read your website's own Supabase
//     `articles` table directly. Reliable, always has images + full body.
//     Use this when your site renders articles from Supabase via JS (most do),
//     because raw-HTML scraping can't see JS-injected content.
//   • "html" — classic Cheerio scrape using CSS selectors from settings.
// ═══════════════════════════════════════════════════════════════════
import axios from 'axios';
import * as cheerio from 'cheerio';
import cron from 'node-cron';
import { supabase, getSettings, T_ARTICLES } from './database.js';

let scrapeJob = null;

// The website's own articles table (the news source). Override via env.
const WEBSITE_TABLE = process.env.WEBSITE_DB_TABLE || 'articles';

function absUrl(maybeUrl, base) {
  if (!maybeUrl) return '';
  try { return new URL(maybeUrl, base).href; } catch { return maybeUrl; }
}

function siteOrigin() {
  try { return new URL(process.env.NEWS_WEBSITE_URL).origin; }
  catch { return (process.env.NEWS_WEBSITE_URL || '').replace(/\/+$/, ''); }
}

// ── Insert helper: only adds rows whose source_url is new ────────────
// Batched: one read of existing source_urls, then a single bulk insert.
async function insertNew(rows) {
  const clean = rows.filter((r) => r.headline && r.source_url);
  if (!clean.length) return 0;

  // Which source_urls already exist?
  const urls = clean.map((r) => r.source_url);
  const { data: existing } = await supabase
    .from(T_ARTICLES).select('source_url').in('source_url', urls);
  const have = new Set((existing || []).map((r) => r.source_url));

  // De-dupe within this batch too, then drop ones already stored.
  const seen = new Set();
  const toInsert = clean.filter((r) => {
    if (have.has(r.source_url) || seen.has(r.source_url)) return false;
    seen.add(r.source_url);
    return true;
  }).map((r) => ({
    headline: r.headline,
    body: r.body || '',
    image_url: r.image_url || '',
    source_url: r.source_url,
    category: r.category || null,
    status: 'pending',
  }));

  if (!toInsert.length) return 0;

  const { error } = await supabase.from(T_ARTICLES).insert(toInsert);
  if (error) { console.warn('[Ingest] bulk insert:', error.message); return 0; }
  return toInsert.length;
}

// ── Mode A: import from the website's Supabase articles table ────────
async function importFromDatabase() {
  const origin = siteOrigin() || 'https://novasbeat.com';
  const { data, error } = await supabase
    .from(WEBSITE_TABLE)
    .select('id,title,body,excerpt,image_url,category,created_at,status')
    .or('status.eq.published,status.eq.Published')
    .order('created_at', { ascending: false })
    .limit(60);

  if (error) {
    console.error('[Ingest/DB] read failed:', error.message);
    throw new Error(`Could not read website table "${WEBSITE_TABLE}": ${error.message}`);
  }

  const rows = (data || [])
    .filter((a) => a.image_url) // only postable items (need an image for IG)
    .map((a) => ({
      headline: (a.title || '').trim(),
      body: (a.body || a.excerpt || '').trim(),
      image_url: a.image_url,
      category: a.category || null,
      // Stable unique key + a real, working link on the site.
      source_url: `${origin}/article.html?id=${a.id}`,
    }));

  const added = await insertNew(rows);
  console.log(`[Ingest/DB] ✓ ${added} new article(s) imported (${rows.length} candidates).`);
  return added;
}

// ── Mode B: classic HTML scrape with Cheerio ────────────────────────
async function scrapeFromHtml() {
  const websiteUrl = process.env.NEWS_WEBSITE_URL;
  if (!websiteUrl) { console.warn('[Ingest/HTML] NEWS_WEBSITE_URL not set.'); return 0; }

  const s = await getSettings();
  const articleSel  = s.article_selector  || 'article';
  const headlineSel = s.headline_selector || 'h1';
  const bodySel     = s.body_selector     || 'p';
  const imageSel    = s.image_selector    || 'img';

  let html;
  try {
    const resp = await axios.get(websiteUrl, {
      timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0 (NewsPostAuto/1.0)' },
    });
    html = resp.data;
  } catch (err) { console.error('[Ingest/HTML] fetch failed:', err.message); return 0; }

  const $ = cheerio.load(html);
  const containers = $(articleSel);
  console.log(`[Ingest/HTML] Found ${containers.length} "${articleSel}" container(s).`);

  const extracted = [];
  containers.each((i, el) => {
    const node = $(el);
    const headline = node.find(headlineSel).first().text().trim()
      || node.find('h2').first().text().trim() || node.find('h3').first().text().trim();
    const body = node.find(bodySel).map((_, p) => $(p).text().trim()).get().filter(Boolean).join('\n\n');
    const imgEl = node.find(imageSel).first();
    const rawImg = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-lazy-src') || '';
    const rawHref = node.find('a').first().attr('href') || node.closest('a').attr('href') || '';
    extracted.push({
      headline, body,
      image_url: absUrl(rawImg, websiteUrl),
      source_url: rawHref ? absUrl(rawHref, websiteUrl) : `${websiteUrl}#${i}`,
    });
  });

  const added = await insertNew(extracted);
  console.log(`[Ingest/HTML] ✓ ${added} new article(s) (${extracted.length} parsed).`);
  return added;
}

// ── Public entry — dispatches on source_mode ────────────────────────
export async function scrapeArticles() {
  const s = await getSettings();
  const mode = s.source_mode || 'database';
  return mode === 'html' ? scrapeFromHtml() : importFromDatabase();
}

export async function startAutoScrape(intervalMinutes) {
  const mins = Math.max(1, parseInt(intervalMinutes, 10) || 30);
  if (scrapeJob) scrapeJob.stop();
  const cronExpr = mins >= 60 ? `0 */${Math.round(mins / 60)} * * *` : `*/${mins} * * * *`;
  scrapeJob = cron.schedule(cronExpr, () => {
    console.log('[Ingest] cron tick…');
    scrapeArticles().catch((e) => console.error('[Ingest] cron error:', e.message));
  });
  console.log(`[Ingest] Auto-ingest scheduled (every ${mins} min → "${cronExpr}").`);
  return scrapeJob;
}

export function stopAutoScrape() {
  if (scrapeJob) { scrapeJob.stop(); scrapeJob = null; }
}
