import { useEffect, useState } from 'react';
import {
  Palette, Sparkles, ImageOff, Stamp, Loader2, Save, AlertTriangle,
  Download, SlidersHorizontal, Type, ChevronDown, ChevronRight,
} from 'lucide-react';
import { notify } from '../components/Toast.jsx';
import DesignControls, { DEFAULT_OPTS, optsFromSettings } from '../components/DesignControls.jsx';
import { getQueue, getSettings, editorEnhance, editorRecreate, editorBranded, editorSave } from '../lib/api.js';

const FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='500'%3E%3Crect width='400' height='500' fill='%230d0a1a'/%3E%3Ctext x='50%25' y='52%25' font-size='80' text-anchor='middle' fill='%23222'%3E%F0%9F%93%B0%3C/text%3E%3C/svg%3E";

const TABS = [
  { id: 'branded',  label: 'Branded Card',       Icon: Stamp,    desc: 'NovasBeat headline card (1080×1350)' },
  { id: 'enhance',  label: 'Color Overlay',       Icon: Palette,  desc: 'Apply brand colors over the photo' },
  { id: 'recreate', label: 'AI Recreate (NVIDIA)',Icon: Sparkles, desc: 'Generate a new image from a prompt' },
  { id: 'original', label: 'Keep Original',       Icon: ImageOff, desc: 'Use the scraped photo as-is' },
];

function Slider({ label, value, min, max, step = 1, unit = '', onChange }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-gray-400">{label}</span>
        <span className="text-xs font-semibold text-accent">{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
    </div>
  );
}

function Section({ title, open, onToggle, children }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(138,92,246,0.15)' }}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold text-gray-300 hover:text-white transition-colors"
        style={{ background: 'rgba(26,13,46,0.5)' }}
      >
        <span>{title}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <div className="space-y-3 border-t p-4" style={{ borderColor: 'rgba(138,92,246,0.1)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

export default function ImageEditor() {
  const [articles, setArticles]         = useState([]);
  const [selectedId, setSelectedId]     = useState('');
  const [tab, setTab]                   = useState('branded');
  const [colors, setColors]             = useState(['#8A5CF6', '#A855F7', '#38E0D2', '#050508', '#ffffff']);
  const [opacity, setOpacity]           = useState(35);
  const [prompt, setPrompt]             = useState('');
  const [preview, setPreview]           = useState(null);
  const [processing, setProcessing]     = useState(false);
  const [saving, setSaving]             = useState(false);
  const [opts, setOpts]                 = useState(DEFAULT_OPTS);
  const [headlineEdit, setHeadlineEdit] = useState('');
  const [categoryEdit, setCategoryEdit] = useState('');

  // CSS filter controls (client-side visual preview only)
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast]     = useState(100);
  const [saturation, setSaturation] = useState(110);
  const [blur, setBlur]             = useState(0);

  // Section collapse state
  const [showTextSec, setShowTextSec]     = useState(true);
  const [showDesignSec, setShowDesignSec] = useState(true);
  const [showFilterSec, setShowFilterSec] = useState(false);
  const [showColorSec, setShowColorSec]   = useState(true);

  const selected = articles.find((a) => a.id === selectedId) || null;

  useEffect(() => {
    (async () => {
      try {
        const [q, s] = await Promise.all([getQueue(), getSettings()]);
        setArticles(q);
        setOpts(optsFromSettings(s));
        if (s.brand_colors) {
          const arr = s.brand_colors.split(',').map((c) => c.trim()).filter(Boolean);
          if (arr.length) setColors((prev) => arr.concat(prev.slice(arr.length)).slice(0, 5));
        }
      } catch { notify.error('Could not load articles'); }
    })();
  }, []);

  useEffect(() => {
    if (selected) {
      setPrompt(selected.headline || '');
      setHeadlineEdit(selected.headline || '');
      setCategoryEdit(selected.category || '');
      setPreview(null);
      setBrightness(100); setContrast(100); setSaturation(110); setBlur(0);
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setColor = (i, v) => setColors((c) => c.map((x, idx) => (idx === i ? v : x)));

  const applyBranded = async () => {
    if (!selected) return;
    setProcessing(true); setPreview(null);
    try {
      const res = await editorBranded(selected.id, { ...opts, headline: headlineEdit, category: categoryEdit });
      setPreview(res.url);
      notify.success('Branded card ready');
    } catch (e) {
      notify.error(e.response?.data?.error || 'Branded image failed');
    } finally { setProcessing(false); }
  };

  const applyEnhance = async () => {
    if (!selected) return;
    setProcessing(true); setPreview(null);
    try {
      const res = await editorEnhance(selected.id, colors.join(','));
      setPreview(res.url);
      notify.success('Enhanced preview ready');
    } catch (e) {
      notify.error(e.response?.data?.error || 'Enhance failed');
    } finally { setProcessing(false); }
  };

  const applyRecreate = async () => {
    if (!selected) return;
    setProcessing(true); setPreview(null);
    try {
      const res = await editorRecreate(selected.id, prompt);
      setPreview(res.url);
      notify.success('New image generated');
    } catch (e) {
      notify.error(e.response?.data?.error || 'NVIDIA generation failed');
    } finally { setProcessing(false); }
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const imageUrl = tab === 'original' ? selected.image_url : (preview || selected.image_url);
      await editorSave(selected.id, imageUrl, tab);
      notify.success('Saved & set as the chosen image');
    } catch (e) {
      notify.error(e.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  };

  const downloadPreview = () => {
    const url = tab === 'original' ? selected?.image_url : preview;
    if (!url) { notify.error('No image to download yet'); return; }
    const a = document.createElement('a');
    a.href = url;
    a.download = `novasbeat-${selected?.id || 'post'}.jpg`;
    a.target = '_blank';
    a.click();
  };

  const cssFilter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) blur(${blur}px)`;

  return (
    <div>
      <div className="mb-2">
        <h1 className="text-2xl font-extrabold text-white">Design Posts</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Edit &amp; generate images for Instagram. NovasBeat branded card is the default.
        </p>
      </div>

      {/* Article selector */}
      <div className="mb-5 mt-5 max-w-xl">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-gray-500">
          Select Article
        </label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none focus:border-accent"
          style={{ background: '#0d0a1a', border: '1px solid rgba(138,92,246,0.2)', color: '#fff' }}
        >
          <option value="">— choose a pending article —</option>
          {articles.map((a) => (
            <option key={a.id} value={a.id}>{a.headline?.slice(0, 72) || a.id}</option>
          ))}
        </select>
      </div>

      {!selected ? (
        <div
          className="rounded-2xl p-16 text-center text-gray-500"
          style={{ border: '1px dashed rgba(138,92,246,0.2)' }}
        >
          Pick an article above to start designing.
        </div>
      ) : (
        <>
          {/* Article info */}
          <div
            className="mb-5 rounded-2xl p-4"
            style={{ background: 'rgba(26,13,46,0.6)', border: '1px solid rgba(138,92,246,0.15)' }}
          >
            <h2 className="font-bold text-white line-clamp-2">{headlineEdit || selected.headline}</h2>
            {selected.body && (
              <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-gray-400">{selected.body}</p>
            )}
            {selected.source_url && (
              <a href={selected.source_url} target="_blank" rel="noreferrer"
                className="mt-2 inline-block text-xs text-accent break-all hover:text-brand">
                {selected.source_url}
              </a>
            )}
          </div>

          {/* Mode tabs */}
          <div className="mb-4 flex flex-wrap gap-2">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => { setTab(id); setPreview(null); }}
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all"
                style={
                  tab === id
                    ? { background: 'linear-gradient(135deg,#8A5CF6,#A855F7)', color: '#fff', boxShadow: '0 0 14px rgba(138,92,246,0.35)' }
                    : { background: 'rgba(26,13,46,0.5)', color: '#9ca3af', border: '1px solid rgba(138,92,246,0.15)' }
                }
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>

          {/* Main layout */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

            {/* LEFT: previews */}
            <div className="space-y-4">
              {/* Original */}
              <div className="rounded-2xl p-4" style={{ background: 'rgba(26,13,46,0.5)', border: '1px solid rgba(138,92,246,0.12)' }}>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-gray-500">Original Photo</p>
                <img
                  src={selected.image_url || FALLBACK}
                  onError={(e) => { e.currentTarget.src = FALLBACK; }}
                  alt=""
                  className="aspect-[4/5] w-full max-w-[260px] mx-auto rounded-xl object-cover"
                  style={{ background: '#0d0a1a' }}
                />
              </div>

              {/* Generated preview */}
              <div className="rounded-2xl p-4" style={{ background: 'rgba(26,13,46,0.5)', border: '1px solid rgba(138,92,246,0.12)' }}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Generated Preview</p>
                  {(preview || tab === 'original') && (
                    <button
                      onClick={downloadPreview}
                      className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-accent hover:text-brand transition-colors"
                      style={{ border: '1px solid rgba(138,92,246,0.25)' }}
                    >
                      <Download size={11} /> Download
                    </button>
                  )}
                </div>
                <div className="relative aspect-[4/5] w-full max-w-[260px] mx-auto overflow-hidden rounded-xl" style={{ background: '#0d0a1a' }}>
                  {processing ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-400">
                      <Loader2 size={28} className="spin" style={{ color: '#A855F7' }} />
                      <span className="text-sm">Generating…</span>
                    </div>
                  ) : (
                    <img
                      src={tab === 'original' ? (selected.image_url || FALLBACK) : (preview || FALLBACK)}
                      onError={(e) => { e.currentTarget.src = FALLBACK; }}
                      alt=""
                      className="h-full w-full object-cover"
                      style={{ filter: showFilterSec ? cssFilter : undefined }}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT: controls */}
            <div className="space-y-3">

              {/* CSS Filters (client-side preview) */}
              <Section title="Image Filters (live preview)" open={showFilterSec} onToggle={() => setShowFilterSec((v) => !v)}>
                <p className="text-[11px] text-gray-600">These adjust the preview display only — generate the final image after tweaking.</p>
                <Slider label="Brightness" value={brightness} min={50} max={180} unit="%" onChange={setBrightness} />
                <Slider label="Contrast"   value={contrast}   min={50} max={200} unit="%" onChange={setContrast}   />
                <Slider label="Saturation" value={saturation} min={0}  max={250} unit="%" onChange={setSaturation} />
                <Slider label="Blur"       value={blur}       min={0}  max={10}  unit="px" step={0.5} onChange={setBlur} />
                <button
                  onClick={() => { setBrightness(100); setContrast(100); setSaturation(110); setBlur(0); }}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Reset filters
                </button>
              </Section>

              {/* Branded mode controls */}
              {tab === 'branded' && (
                <>
                  <Section title="Headline & Category" open={showTextSec} onToggle={() => setShowTextSec((v) => !v)}>
                    <div>
                      <label className="mb-1 flex items-center gap-1 text-xs text-gray-400">
                        <Type size={11} /> Headline on image
                      </label>
                      <textarea
                        value={headlineEdit}
                        onChange={(e) => setHeadlineEdit(e.target.value)}
                        rows={3}
                        className="w-full resize-none rounded-xl p-3 text-sm outline-none focus:border-accent"
                        style={{ background: '#0d0a1a', border: '1px solid rgba(138,92,246,0.2)', color: '#fff' }}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-400">Category tag</label>
                      <input
                        value={categoryEdit}
                        onChange={(e) => setCategoryEdit(e.target.value)}
                        className="w-full rounded-xl px-3 py-2 text-sm outline-none focus:border-accent"
                        style={{ background: '#0d0a1a', border: '1px solid rgba(138,92,246,0.2)', color: '#fff' }}
                      />
                    </div>
                  </Section>

                  <Section title="Design Template" open={showDesignSec} onToggle={() => setShowDesignSec((v) => !v)}>
                    <DesignControls opts={opts} setOpts={setOpts} loading={processing} compact />
                  </Section>

                  <button
                    onClick={applyBranded}
                    disabled={processing}
                    className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50 transition-all"
                    style={{
                      background: 'linear-gradient(135deg,#8A5CF6,#A855F7)',
                      boxShadow: '0 0 18px rgba(138,92,246,0.35)',
                    }}
                  >
                    {processing ? <Loader2 size={15} className="spin" /> : <Stamp size={15} />}
                    Generate Branded Card
                  </button>
                </>
              )}

              {/* Enhance mode */}
              {tab === 'enhance' && (
                <Section title="Brand Color Palette" open={showColorSec} onToggle={() => setShowColorSec((v) => !v)}>
                  <div className="flex flex-wrap gap-3">
                    {colors.map((c, i) => (
                      <div key={i} className="flex flex-col items-center gap-1.5">
                        <input
                          type="color" value={c}
                          onChange={(e) => setColor(i, e.target.value)}
                          className="h-10 w-12 cursor-pointer rounded-lg border-0 bg-transparent"
                          style={{ outline: `2px solid ${c}60` }}
                        />
                        <input
                          value={c}
                          onChange={(e) => setColor(i, e.target.value)}
                          className="w-20 rounded-lg px-1.5 py-1 text-center text-[10px] outline-none"
                          style={{ background: '#0d0a1a', border: '1px solid rgba(138,92,246,0.2)', color: '#fff' }}
                        />
                      </div>
                    ))}
                  </div>
                  <Slider label="Overlay opacity" value={opacity} min={10} max={80} unit="%" onChange={setOpacity} />
                  <button
                    onClick={applyEnhance}
                    disabled={processing}
                    className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg,#8A5CF6,#A855F7)', boxShadow: '0 0 14px rgba(138,92,246,0.3)' }}
                  >
                    {processing ? <Loader2 size={15} className="spin" /> : <Palette size={15} />}
                    Apply Color Overlay
                  </button>
                </Section>
              )}

              {/* Recreate mode */}
              {tab === 'recreate' && (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-400">AI Image Prompt</label>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={4}
                      placeholder="Describe the image you want NVIDIA to generate…"
                      className="w-full rounded-xl p-3 text-sm outline-none focus:border-accent"
                      style={{ background: '#0d0a1a', border: '1px solid rgba(138,92,246,0.2)', color: '#fff', resize: 'none' }}
                    />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl p-3 text-xs text-yellow-400"
                    style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <AlertTriangle size={14} />
                    Uses NVIDIA API credits (key pool of 3 keys).
                  </div>
                  <button
                    onClick={applyRecreate}
                    disabled={processing}
                    className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg,#8A5CF6,#A855F7)', boxShadow: '0 0 14px rgba(138,92,246,0.3)' }}
                  >
                    {processing ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
                    Generate with NVIDIA AI
                  </button>
                </div>
              )}

              {tab === 'original' && (
                <div
                  className="rounded-2xl p-5 text-sm text-gray-400"
                  style={{ background: 'rgba(26,13,46,0.4)', border: '1px solid rgba(138,92,246,0.12)' }}
                >
                  The original scraped photo will be uploaded and used without modification.
                </div>
              )}

              {/* Save button */}
              <div
                className="mt-2 flex gap-3 rounded-2xl p-4"
                style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}
              >
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#059669,#10b981)', boxShadow: '0 0 14px rgba(16,185,129,0.25)' }}
                >
                  {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                  Save &amp; Add to Queue
                </button>
                {(preview || tab === 'original') && (
                  <button
                    onClick={downloadPreview}
                    className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-gray-300 transition-all hover:text-white"
                    style={{ border: '1px solid rgba(138,92,246,0.2)' }}
                  >
                    <Download size={15} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
