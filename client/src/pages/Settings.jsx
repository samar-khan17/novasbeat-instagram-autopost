import { useEffect, useState } from 'react';
import { Save, CheckCircle2, XCircle, Loader2, Instagram, Bot, Database, Globe, Send } from 'lucide-react';
import { notify } from '../components/Toast.jsx';
import {
  getSettings, saveSettings, testInstagram, testGrok, testNvidia, scrapeNow,
} from '../lib/api.js';

// Note: API keys/tokens themselves live in the server .env (never sent from the
// browser). These inputs are for the operational settings stored in Supabase,
// plus convenience fields. Test buttons call the server which reads .env.

function Section({ title, Icon, children }) {
  return (
    <section className="rounded-xl border border-[#23233c] bg-card p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
        <Icon size={18} className="text-accent" /> {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, ...props }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-gray-400">{label}</span>
      <input
        {...props}
        className="w-full rounded-lg border border-[#23233c] bg-[#0f0f1a] px-3 py-2.5 text-sm outline-none focus:border-accent"
      />
    </label>
  );
}

function TestResult({ state }) {
  if (!state) return null;
  return state.ok ? (
    <span className="flex items-center gap-1 text-sm text-success"><CheckCircle2 size={15} /> {state.msg}</span>
  ) : (
    <span className="flex items-center gap-1 text-sm text-error"><XCircle size={15} /> {state.msg}</span>
  );
}

export default function Settings() {
  const [s, setS] = useState({});
  const [saving, setSaving] = useState(false);
  const [igTest, setIgTest] = useState(null);
  const [grokTest, setGrokTest] = useState(null);
  const [nvTest, setNvTest] = useState(null);
  const [scrapeTest, setScrapeTest] = useState(null);
  const [busy, setBusy] = useState('');

  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    getSettings().then(setS).catch(() => notify.error('Could not load settings'));
  }, []);

  const colors = (s.brand_colors || '#4361ee,#2ecc71,#ffffff,#0f0f1a,#f39c12').split(',');
  const setColor = (i, v) => {
    const arr = [...colors]; arr[i] = v; set('brand_colors', arr.join(','));
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      // Only persist the operational keys that belong in the settings table.
      const keys = [
        'default_hashtags', 'post_interval', 'max_posts_per_day', 'image_mode', 'brand_colors',
        'auto_post', 'post_to_story', 'source_mode', 'article_selector', 'headline_selector', 'body_selector', 'image_selector',
        'scrape_interval',
        'default_template', 'default_font_scale', 'default_logo_position', 'default_text_align',
        'default_headline_offset', 'default_gradient_strength', 'default_show_footer',
      ];
      const payload = {};
      keys.forEach((k) => { if (s[k] !== undefined) payload[k] = s[k]; });
      await saveSettings(payload);
      notify.success('Settings saved');
    } catch (e) {
      notify.error(e.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  };

  const runIgTest = async () => {
    setBusy('ig'); setIgTest(null);
    try {
      const r = await testInstagram();
      setIgTest(r.ok ? { ok: true, msg: `Connected: @${r.account?.username || r.account?.name || 'account'}` }
                     : { ok: false, msg: r.error || 'Failed' });
    } catch (e) { setIgTest({ ok: false, msg: e.message }); }
    finally { setBusy(''); }
  };

  const runGrokTest = async () => {
    setBusy('grok'); setGrokTest(null);
    try {
      const r = await testGrok();
      setGrokTest(r.success ? { ok: true, msg: `OK: "${(r.sample || '').slice(0, 40)}…"` }
                            : { ok: false, msg: r.error || 'Failed' });
    } catch (e) { setGrokTest({ ok: false, msg: e.response?.data?.error || e.message }); }
    finally { setBusy(''); }
  };

  const runNvTest = async () => {
    setBusy('nv'); setNvTest(null);
    try {
      const r = await testNvidia();
      setNvTest(r.success ? { ok: true, msg: r.message } : { ok: false, msg: r.message || 'Not configured' });
    } catch (e) { setNvTest({ ok: false, msg: e.message }); }
    finally { setBusy(''); }
  };

  const runScrapeTest = async () => {
    setBusy('scrape'); setScrapeTest(null);
    try {
      // Persist selectors first so the scraper uses them.
      await saveSettings({
        article_selector: s.article_selector || 'article',
        headline_selector: s.headline_selector || 'h1',
        body_selector: s.body_selector || 'p',
        image_selector: s.image_selector || 'img',
      });
      const r = await scrapeNow();
      setScrapeTest({ ok: true, msg: `Found ${r.newArticles ?? 0} new article(s)` });
    } catch (e) { setScrapeTest({ ok: false, msg: e.response?.data?.error || e.message }); }
    finally { setBusy(''); }
  };

  return (
    <div className="pb-24">
      <h1 className="mb-6 text-2xl font-extrabold">Settings</h1>

      <div className="mb-4 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
        🔑 API keys &amp; tokens are stored in the server <code>.env</code> file (not the browser).
        Edit <code>.env</code> and restart the server to change them. The fields below are operational
        settings saved to Supabase.
      </div>

      <div className="space-y-6">
        {/* 1. Instagram / Meta */}
        <Section title="Instagram / Meta API" Icon={Instagram}>
          <p className="text-sm text-gray-400">
            Set <code>META_APP_ID</code>, <code>META_APP_SECRET</code>, <code>PAGE_ACCESS_TOKEN</code> and{' '}
            <code>INSTAGRAM_ACCOUNT_ID</code> in <code>.env</code>.
          </p>
          <div className="flex items-center gap-3">
            <button onClick={runIgTest} disabled={busy === 'ig'}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {busy === 'ig' ? <Loader2 size={15} className="spin" /> : <Send size={15} />} Test Connection
            </button>
            <TestResult state={igTest} />
          </div>
        </Section>

        {/* 2. AI APIs */}
        <Section title="AI APIs" Icon={Bot}>
          <p className="text-sm text-gray-400">
            Set <code>GROK_API_KEY</code> and <code>NVIDIA_API_KEY</code> in <code>.env</code>.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={runGrokTest} disabled={busy === 'grok'}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {busy === 'grok' ? <Loader2 size={15} className="spin" /> : <Bot size={15} />} Test Grok API
            </button>
            <TestResult state={grokTest} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={runNvTest} disabled={busy === 'nv'}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {busy === 'nv' ? <Loader2 size={15} className="spin" /> : <Bot size={15} />} Test NVIDIA API
            </button>
            <TestResult state={nvTest} />
          </div>
        </Section>

        {/* 3. Supabase */}
        <Section title="Supabase" Icon={Database}>
          <p className="text-sm text-gray-400">
            Set <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> in <code>.env</code>, then run{' '}
            <code>server/schema.sql</code> once.
          </p>
          <div className="rounded-lg bg-[#0f0f1a] p-3 text-xs text-gray-400">
            ℹ️ Make sure you have a public <span className="text-accent">news-images</span> storage bucket.
          </div>
        </Section>

        {/* 4. Scraper */}
        <Section title="News Website Scraper" Icon={Globe}>
          <label className="block">
            <span className="mb-1.5 block text-sm text-gray-400">Content Source</span>
            <select value={s.source_mode || 'database'} onChange={(e) => set('source_mode', e.target.value)}
              className="w-full max-w-md rounded-lg border border-[#23233c] bg-[#0f0f1a] px-3 py-2.5 text-sm outline-none focus:border-accent">
              <option value="database">Website Database (recommended — reads your Supabase articles)</option>
              <option value="html">HTML Scrape (CSS selectors below)</option>
            </select>
            <span className="mt-1.5 block text-xs text-gray-500">
              Use <b>Database</b> if your site loads articles from Supabase via JavaScript
              (raw HTML scraping can't see those, and they'd have no image).
            </span>
          </label>
          <p className="text-sm text-gray-400">
            Set <code>NEWS_WEBSITE_URL</code> in <code>.env</code>. The selectors below only apply in <b>HTML</b> mode.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Article Container Selector" value={s.article_selector || ''}
              placeholder="article" onChange={(e) => set('article_selector', e.target.value)} />
            <Field label="Headline Selector" value={s.headline_selector || ''}
              placeholder="h1" onChange={(e) => set('headline_selector', e.target.value)} />
            <Field label="Body Text Selector" value={s.body_selector || ''}
              placeholder="p" onChange={(e) => set('body_selector', e.target.value)} />
            <Field label="Image Selector" value={s.image_selector || ''}
              placeholder="img" onChange={(e) => set('image_selector', e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={runScrapeTest} disabled={busy === 'scrape'}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {busy === 'scrape' ? <Loader2 size={15} className="spin" /> : <Globe size={15} />} Test Scraper
            </button>
            <TestResult state={scrapeTest} />
          </div>
        </Section>

        {/* 5. Posting settings */}
        <Section title="Posting Settings" Icon={Send}>
          {/* Auto-post master switch */}
          <div className={`flex items-center justify-between rounded-lg border p-4 ${
            (s.auto_post === 'on') ? 'border-success/40 bg-success/5' : 'border-warning/40 bg-warning/5'}`}>
            <div>
              <div className="text-sm font-semibold">
                Automatic posting: {(s.auto_post === 'on') ? '🟢 ON' : '🔴 OFF'}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                When ON, the app posts the next article to Instagram every{' '}
                {s.post_interval || '2'}h on its own. When OFF, nothing posts unless you click <b>Post Now</b>.
              </div>
            </div>
            <button
              onClick={() => set('auto_post', s.auto_post === 'on' ? 'off' : 'on')}
              className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${
                s.auto_post === 'on' ? 'bg-success' : 'bg-[#3a3a5c]'}`}>
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${
                s.auto_post === 'on' ? 'left-6' : 'left-1'}`} />
            </button>
          </div>

          {/* Also-post-to-story switch */}
          <div className="flex items-center justify-between rounded-lg border border-[#23233c] bg-[#0f0f1a] p-4">
            <div>
              <div className="text-sm font-semibold">Also post to Instagram Story 📲</div>
              <div className="text-xs text-gray-400 mt-0.5">
                When a post goes out, the same branded image is also shared to your Story (image only).
              </div>
            </div>
            <button
              onClick={() => set('post_to_story', s.post_to_story === 'off' ? 'on' : 'off')}
              className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${
                (s.post_to_story ?? 'on') !== 'off' ? 'bg-success' : 'bg-[#3a3a5c]'}`}>
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${
                (s.post_to_story ?? 'on') !== 'off' ? 'left-6' : 'left-1'}`} />
            </button>
          </div>

          <Field label="Default Hashtags (space or comma separated)" value={s.default_hashtags || ''}
            placeholder="#news #trending #breaking" onChange={(e) => set('default_hashtags', e.target.value)} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-sm text-gray-400">Posting Interval</span>
              <select value={s.post_interval || '2'} onChange={(e) => set('post_interval', e.target.value)}
                className="w-full rounded-lg border border-[#23233c] bg-[#0f0f1a] px-3 py-2.5 text-sm outline-none focus:border-accent">
                {['1', '2', '4', '6', '12', '24'].map((h) => <option key={h} value={h}>{h}h</option>)}
              </select>
            </label>

            <Field label="Max Posts Per Day" type="number" min="1" value={s.max_posts_per_day || '10'}
              onChange={(e) => set('max_posts_per_day', e.target.value)} />

            <label className="block">
              <span className="mb-1.5 block text-sm text-gray-400">Image Mode</span>
              <select value={s.image_mode || 'branded'} onChange={(e) => set('image_mode', e.target.value)}
                className="w-full rounded-lg border border-[#23233c] bg-[#0f0f1a] px-3 py-2.5 text-sm outline-none focus:border-accent">
                <option value="branded">Branded headline card (recommended)</option>
                <option value="enhance">Enhance (brand colour overlay)</option>
                <option value="recreate">AI Recreate (NVIDIA)</option>
                <option value="original">Original</option>
              </select>
            </label>
          </div>

          {/* Default post/story size settings */}
          <div className="rounded-xl border border-[#23233c] bg-[#0f0f1a] p-4 space-y-4">
            <div className="text-sm font-semibold text-gray-200">📐 Default Post & Story Sizes</div>
            <div className="grid grid-cols-2 gap-4">
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs text-gray-400">Default post template</span>
                <select value={s.default_template||'novasbeat'} onChange={e=>set('default_template',e.target.value)}
                  className="w-full rounded-lg border border-[#23233c] bg-card px-3 py-2.5 text-sm outline-none focus:border-accent">
                  <option value="novasbeat">NovasBeat Classic (purple gradient)</option>
                  <option value="bbc">BBC Classic (bold + red accent)</option>
                  <option value="ary">ARY News (blue + gold bar)</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs text-gray-400">Default font size (%)</span>
                <input type="number" min="70" max="140" step="5" value={s.default_font_scale ? Math.round(+s.default_font_scale*100) : 100}
                  onChange={e=>set('default_font_scale', (+e.target.value/100).toString())}
                  className="w-full rounded-lg border border-[#23233c] bg-card px-3 py-2.5 text-sm outline-none focus:border-accent"/>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs text-gray-400">Default logo position</span>
                <select value={s.default_logo_position||'top-left'} onChange={e=>set('default_logo_position',e.target.value)}
                  className="w-full rounded-lg border border-[#23233c] bg-card px-3 py-2.5 text-sm outline-none focus:border-accent">
                  <option value="top-left">Left</option>
                  <option value="top-center">Center</option>
                  <option value="top-right">Right</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs text-gray-400">Default text alignment</span>
                <select value={s.default_text_align||'left'} onChange={e=>set('default_text_align',e.target.value)}
                  className="w-full rounded-lg border border-[#23233c] bg-card px-3 py-2.5 text-sm outline-none focus:border-accent">
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs text-gray-400">Headline offset (px)</span>
                <input type="number" min="-80" max="400" step="40" value={s.default_headline_offset||0}
                  onChange={e=>set('default_headline_offset',e.target.value)}
                  className="w-full rounded-lg border border-[#23233c] bg-card px-3 py-2.5 text-sm outline-none focus:border-accent"/>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs text-gray-400">Default gradient darkness (%)</span>
                <input type="number" min="0" max="100" step="5" value={s.default_gradient_strength||70}
                  onChange={e=>set('default_gradient_strength',e.target.value)}
                  className="w-full rounded-lg border border-[#23233c] bg-card px-3 py-2.5 text-sm outline-none focus:border-accent"/>
              </label>
              <label className="flex items-center justify-between rounded-lg border border-[#23233c] bg-card px-3 py-2.5">
                <span className="text-xs text-gray-400">Show footer by default</span>
                <input type="checkbox" checked={s.default_show_footer !== 'false'}
                  onChange={e=>set('default_show_footer', e.target.checked ? 'true' : 'false')}
                  className="accent-accent"/>
              </label>
            </div>
            <p className="text-xs text-gray-500">These defaults are loaded automatically in the preview editor when you open a new article. You can still override them per-post.</p>
          </div>

          <div>
            <span className="mb-2 block text-sm text-gray-400">Brand Colors</span>
            <div className="flex flex-wrap gap-4">
              {colors.map((c, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <input type="color" value={(c || '#000000').trim()} onChange={(e) => setColor(i, e.target.value)}
                    className="h-10 w-12 cursor-pointer rounded border border-[#23233c] bg-transparent" />
                  <input value={(c || '').trim()} onChange={(e) => setColor(i, e.target.value)}
                    className="w-20 rounded bg-[#0f0f1a] px-1.5 py-1 text-center text-[11px] outline-none" />
                </div>
              ))}
            </div>
          </div>
        </Section>
      </div>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-[240px] right-0 border-t border-[#23233c] bg-card/95 p-4 backdrop-blur">
        <div className="flex justify-end">
          <button onClick={saveAll} disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-success px-6 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />} Save All Settings
          </button>
        </div>
      </div>
    </div>
  );
}
