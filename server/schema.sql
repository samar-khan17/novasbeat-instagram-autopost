-- ════════════════════════════════════════════════════════════════════
-- NewsPost Auto — Supabase schema
-- Run this ONCE in Supabase → SQL Editor (paste + Run).
-- Then go to Storage and create a PUBLIC bucket named  news-images
--
-- Tables are namespaced "np_" so this tool can SHARE the same Supabase
-- project as the Novas Beat website without touching its own `articles`
-- and `settings` tables.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

create table if not exists public.np_articles (
  id                  uuid primary key default gen_random_uuid(),
  headline            text,
  body                text,
  category            text,
  image_url           text,                 -- original image found on the site
  supabase_image_url  text,                 -- processed image in Supabase Storage
  source_url          text unique,          -- de-dupe key
  scraped_at          timestamptz default now(),
  status              text default 'pending', -- pending|scheduled|posted|failed|skipped
  posted_at           timestamptz,
  instagram_post_id   text,
  caption             text,
  hashtags            text,
  error_message       text
);

create index if not exists np_articles_status_idx     on public.np_articles (status);
create index if not exists np_articles_scraped_at_idx on public.np_articles (scraped_at desc);

create table if not exists public.np_settings (
  key   text primary key,
  value text
);

-- Default settings (no-op if they already exist)
insert into public.np_settings (key, value) values
  ('scrape_interval',   '30'),
  ('post_interval',     '2'),
  ('max_posts_per_day', '10'),
  ('image_mode',        'enhance'),
  ('default_hashtags',  '#news #trending #breaking'),
  ('brand_colors',      '#4361ee,#2ecc71,#ffffff,#0f0f1a,#f39c12'),
  ('article_selector',  'article'),
  ('headline_selector', 'h1'),
  ('body_selector',     'p'),
  ('image_selector',    'img'),
  ('default_template',  'novasbeat'),
  ('default_font_scale','1'),
  ('default_logo_position','top-left'),
  ('default_text_align','left'),
  ('default_headline_offset','0'),
  ('default_gradient_strength','70'),
  ('default_show_footer','true')
on conflict (key) do nothing;

-- Add category column on existing installs (safe if already present)
alter table public.np_articles add column if not exists category text;

-- ── Row Level Security ──────────────────────────────────────────────
-- The server uses the SERVICE_ROLE key, which bypasses RLS entirely, so
-- these policies are only needed if you ever switch to the anon key.
alter table public.np_articles enable row level security;
alter table public.np_settings enable row level security;

drop policy if exists "np anon all articles" on public.np_articles;
create policy "np anon all articles" on public.np_articles
  for all to anon using (true) with check (true);

drop policy if exists "np anon all settings" on public.np_settings;
create policy "np anon all settings" on public.np_settings
  for all to anon using (true) with check (true);
