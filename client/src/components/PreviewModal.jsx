import { useEffect, useState, useCallback, useRef } from 'react';
import {
  X, Loader2, Send, RefreshCw, Monitor, BookImage, Tag, FileText,
  Bold, Italic, Minus, ChevronDown, ChevronRight, Maximize2, ImageIcon,
  AlignLeft, Hash,
} from 'lucide-react';
import { notify } from './Toast.jsx';
import { previewPost, previewStory, postNow, getSettings } from '../lib/api.js';
import DesignControls, { DEFAULT_OPTS, optsFromSettings } from './DesignControls.jsx';
import InstagramMockup, { InstagramStoryMockup } from './InstagramMockup.jsx';

function insertFormat(text, sel, marker) {
  if (!sel || sel.start === sel.end) return text;
  return text.slice(0, sel.start) + marker + text.slice(sel.start, sel.end) + marker + text.slice(sel.end);
}

function Panel({ title, open, onToggle, children, icon: Icon }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(138,92,246,0.15)' }}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-xs font-semibold text-gray-300 hover:text-white transition-colors"
        style={{ background: 'rgba(17,14,32,0.8)' }}
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {Icon && <Icon size={13} style={{ color: '#8A5CF6' }} />}
        {title}
      </button>
      {open && (
        <div className="space-y-3 border-t p-4" style={{ borderColor: 'rgba(138,92,246,0.1)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

export default function PreviewModal({ article, onClose, onPosted }) {
  const [opts, setOpts]                   = useState(DEFAULT_OPTS);
  const [headlineEdit, setHeadlineEdit]   = useState('');
  const [categoryEdit, setCategoryEdit]   = useState('');
  const [data, setData]                   = useState(null);
  const [loading, setLoading]             = useState(false);
  const [caption, setCaption]             = useState('');
  const [hashtags, setHashtags]           = useState('');
  const [activeTab, setActiveTab]         = useState('feed');
  const [showRaw, setShowRaw]             = useState(false);
  const [feedExpanded, setFeedExpanded]   = useState(false);
  const [storyUrl, setStoryUrl]           = useState(null);
  const [storyLoading, setStoryLoading]   = useState(false);
  const [storyExpanded, setStoryExpanded] = useState(false);
  const [posting, setPosting]             = useState(false);
  const [openDesign, setOpenDesign]       = useState(true);
  const [openHeadline, setOpenHeadline]   = useState(true);
  const [openCaption, setOpenCaption]     = useState(true);
  const [openBody, setOpenBody]           = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const storyBuiltFor = useRef(null);
  const captionRef    = useRef(null);
  const debounceRef   = useRef(null);
  const prevOptsRef   = useRef(opts);

  useEffect(() => {
    if (!article) return;
    setHeadlineEdit(article.headline || '');
    setCategoryEdit(article.category || '');
    setData(null);
    setCaption('');
    setHashtags('');
    setStoryUrl(null);
    storyBuiltFor.current = null;
    setActiveTab('feed');
    setShowRaw(false);
    setFeedExpanded(false);
    setStoryExpanded(false);
    setSettingsLoaded(false);

    getSettings()
      .then((s) => {
        const o = optsFromSettings(s);
        setOpts(o);
        prevOptsRef.current = o;
        setSettingsLoaded(true);
      })
      .catch(() => { setOpts(DEFAULT_OPTS); setSettingsLoaded(true); });
  }, [article?.id]);

  const build = useCallback(async (o, textOverrides = {}) => {
    if (!article) return;
    setLoading(true);
    try {
      const res = await previewPost(article.id, {
        ...o,
        headline: textOverrides.headline ?? headlineEdit,
        category: textOverrides.category ?? categoryEdit,
      });
      setData(res);
      setCaption(res.caption || '');
      setHashtags(res.hashtags || '');
      setStoryUrl(null);
      storyBuiltFor.current = null;
    } catch (e) {
      notify.error(e.response?.data?.error || 'Could not build preview');
    } finally {
      setLoading(false);
    }
  }, [article, headlineEdit, categoryEdit]);

  useEffect(() => {
    if (!article || !settingsLoaded) return;
    build(opts, { headline: article.headline, category: article.category });
  }, [article?.id, settingsLoaded]); // eslint-disable-line

  useEffect(() => {
    if (!settingsLoaded) return;
    if (JSON.stringify(prevOptsRef.current) === JSON.stringify(opts)) return;
    prevOptsRef.current = opts;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      build(opts, { headline: headlineEdit, category: categoryEdit });
    }, 600);
    return () => clearTimeout(debounceRef.current);
  }, [opts, settingsLoaded]); // eslint-disable-line

  const regen = () => build(opts, { headline: headlineEdit, category: categoryEdit });

  const openStory = async () => {
    setActiveTab('story');
    setStoryExpanded(false);
    if (storyBuiltFor.current === data?.imageUrl) return;
    if (!data?.imageUrl) { notify.error('Generate the feed preview first'); return; }
    setStoryLoading(true);
    try {
      const res = await previewStory(article.id, {
        brandedImageUrl: data.imageUrl,
        caption,
        originalImageUrl: article.image_url,
      });
      setStoryUrl(res.storyImageUrl);
      storyBuiltFor.current = data.imageUrl;
    } catch (e) {
      notify.error(e.response?.data?.error || 'Story preview failed');
    } finally {
      setStoryLoading(false);
    }
  };

  const publish = async () => {
    if (!data?.imageUrl) { notify.error('Generate the preview first'); return; }
    if (!window.confirm('Publish this to your LIVE Instagram (@novasbeatnews) now?\nThis cannot be undone.')) return;
    setPosting(true);
    const t = notify.loading('Posting to Instagram…');
    try {
      await postNow(article.id, { imageUrl: data.imageUrl, caption, hashtags });
      notify.dismiss(t);
      notify.success('Posted to Instagram!');
      onPosted && onPosted();
      onClose();
    } catch (e) {
      notify.dismiss(t);
      notify.error(e.response?.data?.error || 'Post failed');
    } finally {
      setPosting(false);
    }
  };

  const getSelection = () => {
    const el = captionRef.current;
    if (!el) return null;
    return { start: el.selectionStart, end: el.selectionEnd };
  };

  const applyFormat = (marker) => {
    const sel = getSelection();
    setCaption((prev) => insertFormat(prev, sel, marker));
  };

  if (!article) return null;
  const isBranded = !data || data.mode === 'branded';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl"
        style={{ background: '#0a0718', border: '1px solid rgba(138,92,246,0.25)', boxShadow: '0 0 60px rgba(138,92,246,0.15)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(138,92,246,0.15)' }}>
          <div className="min-w-0">
            <h2 className="font-bold text-white">Review before posting</h2>
            <p className="mt-0.5 truncate text-xs text-gray-500">{article.headline}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
          >
            <X size={17} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3 pb-0" style={{ borderBottom: '1px solid rgba(138,92,246,0.12)' }}>
          <button
            onClick={() => setActiveTab('feed')}
            className="flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors"
            style={activeTab === 'feed'
              ? { borderBottom: '2px solid #A855F7', color: '#A855F7' }
              : { color: '#6b7280' }}
          >
            <Monitor size={13} /> Feed (4:5)
          </button>
          <button
            onClick={openStory}
            className="flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors"
            style={activeTab === 'story'
              ? { borderBottom: '2px solid #A855F7', color: '#A855F7' }
              : { color: '#6b7280' }}
          >
            <BookImage size={13} /> Story (9:16)
            {storyLoading && <Loader2 size={11} className="spin" />}
          </button>
          <div className="ml-auto flex items-center gap-2 pb-2">
            {activeTab === 'feed' && (
              <button
                onClick={() => setShowRaw((v) => !v)}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors"
                style={showRaw
                  ? { background: 'rgba(138,92,246,0.2)', color: '#A855F7', border: '1px solid rgba(138,92,246,0.35)' }
                  : { background: 'rgba(255,255,255,0.05)', color: '#9ca3af', border: '1px solid rgba(138,92,246,0.12)' }}
              >
                <ImageIcon size={11} /> {showRaw ? 'Branded' : 'Original'}
              </button>
            )}
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }}
            >
              Live Preview
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-5 lg:grid-cols-2">

          {/* Left — mockup */}
          <div className="flex flex-col items-center gap-3">
            {activeTab === 'feed' ? (
              <>
                <InstagramMockup
                  imageUrl={data?.imageUrl}
                  rawImageUrl={article.image_url}
                  showRaw={showRaw}
                  loading={loading}
                  caption={caption}
                  hashtags={hashtags}
                  onExpand={() => data?.imageUrl && setFeedExpanded(true)}
                  width={300}
                />
                {data?.imageUrl && (
                  <button
                    onClick={() => setFeedExpanded(true)}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white transition-colors"
                  >
                    <Maximize2 size={11} /> View full size
                  </button>
                )}
              </>
            ) : (
              <>
                <InstagramStoryMockup
                  storyUrl={storyUrl}
                  feedImageUrl={data?.imageUrl}
                  loading={storyLoading}
                  onExpand={() => storyUrl && setStoryExpanded(true)}
                />
                {storyUrl && (
                  <button
                    onClick={() => setStoryExpanded(true)}
                    className="text-xs text-gray-500 hover:text-white transition-colors"
                  >
                    View full story
                  </button>
                )}
              </>
            )}
          </div>

          {/* Right — editing */}
          <div className="flex flex-col gap-3">

            {activeTab === 'feed' && isBranded && (
              <Panel title="Design — template & layout" open={openDesign} onToggle={() => setOpenDesign((v) => !v)}>
                <DesignControls opts={opts} setOpts={setOpts} loading={loading} onRefresh={regen} compact />
              </Panel>
            )}

            <Panel title="Headline & category" open={openHeadline} onToggle={() => setOpenHeadline((v) => !v)} icon={FileText}>
              <div>
                <label className="mb-1 block text-xs text-gray-500">Headline on image</label>
                <textarea
                  value={headlineEdit}
                  onChange={(e) => setHeadlineEdit(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-xl p-3 text-sm outline-none"
                  style={{ background: '#0d0a1a', border: '1px solid rgba(138,92,246,0.2)', color: '#fff' }}
                />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs text-gray-500">
                  <Tag size={11} /> Category tag
                </label>
                <input
                  value={categoryEdit}
                  onChange={(e) => setCategoryEdit(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                  style={{ background: '#0d0a1a', border: '1px solid rgba(138,92,246,0.2)', color: '#fff' }}
                />
              </div>
              <button
                onClick={regen}
                disabled={loading}
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white disabled:opacity-50 transition-all"
                style={{ background: 'linear-gradient(135deg,#8A5CF6,#A855F7)', boxShadow: '0 0 12px rgba(138,92,246,0.3)' }}
              >
                {loading ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />}
                Apply &amp; Rebuild
              </button>
            </Panel>

            {/* Full body text */}
            {article.body && (
              <Panel title="Full article body" open={openBody} onToggle={() => setOpenBody((v) => !v)} icon={AlignLeft}>
                <div
                  className="max-h-48 overflow-y-auto rounded-xl p-3 text-[13px] leading-relaxed text-gray-400"
                  style={{ background: '#0d0a1a', border: '1px solid rgba(138,92,246,0.1)' }}
                >
                  {article.body}
                </div>
                {article.source_url && (
                  <a
                    href={article.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-xs text-accent hover:text-brand transition-colors"
                  >
                    Read full article →
                  </a>
                )}
              </Panel>
            )}

            <Panel title="Caption & hashtags" open={openCaption} onToggle={() => setOpenCaption((v) => !v)} icon={Hash}>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs text-gray-500">Caption</label>
                  <div className="flex gap-0.5">
                    {[['**', 'B', Bold], ['_', 'I', Italic], ['~', 'S', Minus]].map(([m, , Icon]) => (
                      <button
                        key={m}
                        onClick={() => applyFormat(m)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
                      >
                        <Icon size={12} />
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        const s = getSelection();
                        if (!s) return;
                        setCaption((p) => {
                          const before = p.slice(0, s.start);
                          const sel = p.slice(s.start, s.end);
                          const after = p.slice(s.end);
                          return before + (sel ? `• ${sel}` : '\n• ') + after;
                        });
                      }}
                      className="rounded-lg px-1.5 py-1 text-xs text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      •
                    </button>
                  </div>
                </div>
                <textarea
                  ref={captionRef}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={6}
                  className="w-full resize-none rounded-xl p-3 text-sm outline-none"
                  style={{ background: '#0d0a1a', border: '1px solid rgba(138,92,246,0.2)', color: '#fff' }}
                />
                <p className="mt-1 text-right text-[10px] text-gray-600">{caption.length} chars</p>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">Hashtags (editable)</label>
                <textarea
                  value={hashtags}
                  onChange={(e) => setHashtags(e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-xl p-3 text-xs outline-none"
                  style={{ background: '#0d0a1a', border: '1px solid rgba(138,92,246,0.2)', color: '#A855F7' }}
                />
              </div>
            </Panel>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-4"
          style={{ borderTop: '1px solid rgba(138,92,246,0.15)' }}
        >
          <span className="text-xs text-gray-600">Posts feed &amp; story · @novasbeatnews</span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-400 hover:text-white transition-colors"
              style={{ border: '1px solid rgba(138,92,246,0.15)' }}
            >
              Cancel
            </button>
            <button
              onClick={publish}
              disabled={posting || loading || !data?.imageUrl}
              className="flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold text-white disabled:opacity-40 transition-all"
              style={{ background: 'linear-gradient(135deg,#059669,#10b981)', boxShadow: '0 0 16px rgba(16,185,129,0.3)' }}
            >
              {posting ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
              Publish Now
            </button>
          </div>
        </div>
      </div>

      {/* Feed expanded */}
      {feedExpanded && data?.imageUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.92)' }}
          onClick={() => setFeedExpanded(false)}
        >
          <div className="relative max-h-[95vh]" onClick={(e) => e.stopPropagation()}>
            <img src={data.imageUrl} alt="" className="max-h-[90vh] rounded-2xl shadow-2xl" style={{ aspectRatio: '4/5' }} />
            <button onClick={() => setFeedExpanded(false)}
              className="absolute -right-3 -top-3 rounded-full p-2 text-white hover:bg-white/20"
              style={{ background: 'rgba(255,255,255,0.1)' }}
            >
              <X size={17} />
            </button>
          </div>
        </div>
      )}

      {/* Story expanded */}
      {storyExpanded && storyUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.92)' }}
          onClick={() => setStoryExpanded(false)}
        >
          <div className="relative max-h-[95vh]" onClick={(e) => e.stopPropagation()}>
            <img src={storyUrl} alt="" className="max-h-[90vh] rounded-2xl shadow-2xl" style={{ aspectRatio: '9/16' }} />
            <button onClick={() => setStoryExpanded(false)}
              className="absolute -right-3 -top-3 rounded-full p-2 text-white hover:bg-white/20"
              style={{ background: 'rgba(255,255,255,0.1)' }}
            >
              <X size={17} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
