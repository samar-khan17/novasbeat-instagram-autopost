# ⚡ NewsPost Auto

Personal Instagram auto-posting dashboard. It **scrapes news from your own
website**, generates a caption + hashtags with **Grok (xAI)**, optionally edits
the image with **NVIDIA SANA** or **Sharp brand overlays**, stores everything in
**Supabase**, and **publishes to Instagram via the Meta Graph API** — on a
schedule or with one click.

```
Scrape your site → pick article (headline + body + image)
   → Grok caption + hashtags → image (enhance / AI recreate / original)
   → upload to Supabase Storage → POST to Instagram Graph API
```

## Quick Start (one click)
Everything (keys, tables, bucket) is already set up. Just double-click the
**“NewsPost Auto”** shortcut on your Desktop — it starts the server + dashboard
in two terminal windows and opens http://localhost:5173 automatically.
(The same launcher is `Start NewsPost Auto.bat` in this folder.)

To stop the app, close the two terminal windows.

### Manual start (if you prefer)
```bash
cd server && npm install && npm run dev     # terminal 1
cd client && npm install && npm run dev     # terminal 2  → http://localhost:5173
```

## Content source — important
This tool reads your articles **directly from your website's Supabase `articles`
table** (Settings → Content Source → *Website Database*, the default). That's why
every article has a proper image and full body text. Raw-HTML scraping is also
available (*HTML* mode) but won't work for JS-rendered sites like novasbeat.com.
Click **Queue → Scrape Now** to import the latest articles.

## API Keys Needed
- **Meta Graph API** – https://developers.facebook.com  (App ID, App Secret, Page/IG access token, Instagram account ID)
- **Grok API (xAI)** – https://console.x.ai
- **NVIDIA API** – https://build.nvidia.com (then https://integrate.api.nvidia.com)
- **Supabase** – https://supabase.com

## Supabase Setup
**Already done for the Novas Beat project** — the `.env` is filled with that
project's URL + service-role key, the `np_articles` / `np_settings` tables exist,
and the public `news-images` bucket is created. If you ever point this at a
**fresh** Supabase project, run `server/schema.sql` and create a public
`news-images` bucket there.

> **Table names:** this tool uses `np_articles` and `np_settings` (namespaced
> with `np_`) so it shares the Novas Beat Supabase project **without colliding**
> with the website's own `articles` / `settings` tables.

> **Key:** `.env` uses the Supabase **service-role** key (server-side only — it
> never reaches the browser, since the React app talks to this Express server,
> not Supabase directly). That lets storage uploads + table writes work without
> any RLS fiddling.

## How to Use
1. Go to **Settings**, confirm your API keys are in `.env`, set your news website
   URL (in `.env`) and tune the CSS selectors. Use the **Test** buttons.
2. Go to **Queue → Scrape Now** to fetch articles from your website.
3. (Optional) Go to **Editor** to enhance / AI-recreate an article image.
4. Use **Dashboard → Post Next Article Now**, or per-article **Post Now** in the
   Queue, or just let the **scheduler** post automatically on your chosen interval.

## Image Modes (Settings → Posting Settings)
- **Enhance** – resize to 1080×1080, overlay your first brand colour, sharpen (Sharp).
- **AI Recreate** – generate a brand-new cover from the headline with NVIDIA SANA.
- **Original** – post the scraped image unchanged.

## How posting works (Meta Graph API v18.0)
1. `POST /{INSTAGRAM_ACCOUNT_ID}/media` with `image_url` + `caption` → returns a `creation_id`.
2. Wait ~3s for Instagram to fetch the image.
3. `POST /{INSTAGRAM_ACCOUNT_ID}/media_publish` with `creation_id` → returns the post id.

> **Important – image URLs must be public.** Instagram fetches the image itself,
> which is exactly why every image is uploaded to the **public** `news-images`
> Supabase bucket before publishing.

## Keys — all filled in & verified ✅
Pulled from your Novas Beat site config and tested live:
- **Instagram** — token verified → account **@novasbeatnews** (MEDIA_CREATOR).
  Your token starts with `IGAA…` = the **Instagram Login API**, so the code talks
  to **`graph.instagram.com`** (set via `IG_GRAPH_BASE`), and the account id is the
  Login-scoped **`26862725833370403`** (from the token's `/me`), *not* the
  `17841…` Business id in your txt file.
- **Caption AI** — the key in your site is a **Groq** key (`gsk_…`), not xAI Grok.
  `server/grok.js` auto-detects this and uses Groq (`llama-3.3-70b-versatile`).
  Verified: it returns real captions. Paste an `xai-…` key later to switch to
  `grok-3-mini` automatically.
- **NVIDIA** — `nvapi-…` key configured. It's proven for text; **SANA image
  generation ("AI Recreate") only works if your NVIDIA account has that model
  enabled.** If Recreate fails, use **Enhance** (Sharp brand overlay) or
  **Original** mode — neither needs NVIDIA.
- **Supabase** — connected; tables + bucket created.

⚠️ Instagram Login tokens **expire** (~60 days). If posting starts returning auth
errors, regenerate a long-lived token in the Meta dashboard and update `.env`.

> **Selectors:** the saved scraper selectors are tuned for novasbeat.com's
> homepage (`.art-card-pro` / `h3` / `p` / `img`) and a test scrape already
> pulled 6 articles into your queue. Adjust them in **Settings** for other pages.

## Project Structure
```
newspost-auto/
  client/   React + Vite + Tailwind dashboard
  server/   Node + Express API, scraper, AI, scheduler
  .env      your secrets (gitignored)
  server/schema.sql   run once in Supabase
```

## Troubleshooting
- **"Could not read the articles table"** → run `server/schema.sql` in Supabase.
- **Storage upload fails** → create the public `news-images` bucket.
- **IG publish fails** → token expired / account not Business / image URL not public.
- **Scraper finds 0 articles** → adjust the CSS selectors in Settings to match your site.
