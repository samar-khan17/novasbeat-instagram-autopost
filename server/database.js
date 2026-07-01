// ═══════════════════════════════════════════════════════════════════
// NewsPost Auto — Supabase client + schema bootstrap
// ═══════════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: process.env.DOTENV_PATH || path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[DB] ⚠️  SUPABASE_URL / SUPABASE_ANON_KEY missing in .env — DB calls will fail until set.');
}

// Single shared client. Storage + table access both go through this.
export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder-key',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Table names. Namespaced with "np_" so this tool can share a Supabase
// project with the news website without colliding with its own `articles`
// / `settings` tables (which have a different schema).
export const T_ARTICLES = 'np_articles';
export const T_SETTINGS = 'np_settings';

// Default settings inserted on first run.
export const DEFAULT_SETTINGS = {
  scrape_interval:   '30',
  post_interval:     '2',
  max_posts_per_day: '10',
  image_mode:        'branded',   // branded headline card (NovasBeat style)
  auto_post:         'off',        // 'on' = scheduler auto-posts; 'off' = manual only
  post_to_story:     'on',         // also share the post image to the IG Story
  default_hashtags:  '#NovasBeat #news #breaking #trending #AI',
  brand_colors:      '#9333EA,#A855F7,#6366F1,#EC4899,#05050A',
  source_mode:       'database',   // 'database' (read website's Supabase) | 'html'
  article_selector:  'article',
  headline_selector: 'h1',
  body_selector:     'p',
  image_selector:    'img',
};

// ── SQL that creates the schema. Used by exec_sql RPC if available; also
//    written to schema.sql for manual paste into the Supabase SQL editor. ──
export const SCHEMA_SQL = `
create extension if not exists "pgcrypto";

create table if not exists public.np_articles (
  id                  uuid primary key default gen_random_uuid(),
  headline            text,
  body                text,
  image_url           text,
  supabase_image_url  text,
  source_url          text unique,
  scraped_at          timestamptz default now(),
  status              text default 'pending',
  posted_at           timestamptz,
  instagram_post_id   text,
  caption             text,
  hashtags            text,
  error_message       text
);

create table if not exists public.np_settings (
  key   text primary key,
  value text
);
`;

// ─────────────────────────────────────────────────────────────────────
// initDatabase — verify tables exist, create them when possible, and
// ensure default settings rows are present.
// ─────────────────────────────────────────────────────────────────────
export async function initDatabase() {
  // 1. Best-effort: create tables via an `exec_sql` RPC if the user added one.
  //    (The Supabase anon client cannot run raw DDL directly — this only
  //     works if you created a SECURITY DEFINER `exec_sql(text)` function.)
  try {
    const { error } = await supabase.rpc('exec_sql', { sql: SCHEMA_SQL });
    if (!error) console.log('[DB] Schema ensured via exec_sql RPC.');
  } catch (_) { /* RPC not present — fall through to verification */ }

  // 2. Verify the articles table is reachable.
  const { error: artErr } = await supabase.from(T_ARTICLES).select('id').limit(1);
  if (artErr) {
    console.warn(`\n[DB] ⚠️  Could not read the "${T_ARTICLES}" table:`, artErr.message);
    console.warn('[DB] 👉 Open Supabase → SQL Editor and run server/schema.sql once.');
    console.warn('[DB] 👉 Also create a public Storage bucket named "news-images".\n');
    return false;
  }

  // 3. Ensure default settings exist (insert only the missing keys).
  try {
    const { data: existing } = await supabase.from(T_SETTINGS).select('key');
    const have = new Set((existing || []).map((r) => r.key));
    const toInsert = Object.entries(DEFAULT_SETTINGS)
      .filter(([k]) => !have.has(k))
      .map(([key, value]) => ({ key, value }));
    if (toInsert.length) {
      const { error } = await supabase.from(T_SETTINGS).insert(toInsert);
      if (error) console.warn('[DB] Could not insert default settings:', error.message);
      else console.log(`[DB] Inserted ${toInsert.length} default setting(s).`);
    }
  } catch (e) {
    console.warn('[DB] settings bootstrap skipped:', e.message);
  }

  console.log('[DB] ✓ Connected to Supabase.');
  return true;
}

// ── Convenience helpers used across the server ──────────────────────
export async function getSettings() {
  const { data, error } = await supabase.from(T_SETTINGS).select('key,value');
  if (error) { console.warn('[DB] getSettings:', error.message); return { ...DEFAULT_SETTINGS }; }
  const out = { ...DEFAULT_SETTINGS };
  (data || []).forEach((r) => { out[r.key] = r.value; });
  return out;
}

export async function getSetting(key, fallback = '') {
  const all = await getSettings();
  return all[key] != null ? all[key] : fallback;
}
