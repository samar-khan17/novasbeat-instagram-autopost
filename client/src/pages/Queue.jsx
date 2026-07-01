import { useEffect, useState, useCallback } from 'react';
import { Download, Inbox, Loader2, CheckSquare, Square, Send, Search, LayoutList, LayoutGrid } from 'lucide-react';
import ArticleCard from '../components/ArticleCard.jsx';
import PreviewModal from '../components/PreviewModal.jsx';
import BatchPublishModal from '../components/BatchPublishModal.jsx';
import { notify } from '../components/Toast.jsx';
import { getQueue, skipArticle, deleteArticle, scrapeNow } from '../lib/api.js';

const MAX_BATCH = 20;

export default function Queue() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [scraping, setScraping] = useState(false);
  const [busyId, setBusyId]     = useState(null);

  // Single-article preview
  const [previewArticle, setPreviewArticle] = useState(null);

  // Batch select / publish
  const [selectMode, setSelectMode]       = useState(false);
  const [selectedIds, setSelectedIds]     = useState(new Set());
  const [batchArticles, setBatchArticles] = useState(null); // non-null → open batch modal
  const [search, setSearch] = useState('');
  const [compact, setCompact] = useState(false);

  const load = useCallback(async () => {
    try {
      setArticles(await getQueue());
    } catch {
      notify.error('Could not load queue — is the server running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Exit select mode and clear selection
  const exitSelect = () => { setSelectMode(false); setSelectedIds(new Set()); };

  const toggleSelect = (id) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_BATCH) next.add(id);
      else notify.error(`You can select at most ${MAX_BATCH} articles at once`);
      return next;
    });

  const selectAll = () => {
    const ids = articles.slice(0, MAX_BATCH).map((a) => a.id);
    setSelectedIds(new Set(ids));
    if (articles.length > MAX_BATCH)
      notify.error(`Only the first ${MAX_BATCH} articles were selected (API limit).`);
  };

  const openBatch = () => {
    if (!selectedIds.size) { notify.error('Select at least one article first'); return; }
    const selected = articles.filter((a) => selectedIds.has(a.id));
    setBatchArticles(selected);
  };

  const handleScrape = async () => {
    setScraping(true);
    const t = notify.loading('Scraping your website…');
    try {
      const res = await scrapeNow();
      notify.dismiss(t);
      notify.success(`Found ${res.newArticles ?? 0} new article(s)`);
      load();
    } catch (e) {
      notify.dismiss(t);
      notify.error(e.response?.data?.error || 'Scrape failed');
    } finally {
      setScraping(false);
    }
  };

  const handlePost = (a) => setPreviewArticle(a);
  const handlePreview = (a) => setPreviewArticle(a);

  const filtered = articles.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (a.headline || '').toLowerCase().includes(q)
      || (a.body || '').toLowerCase().includes(q)
      || (a.category || '').toLowerCase().includes(q);
  });

  const handleSkip = async (a) => {
    setBusyId(a.id);
    try { await skipArticle(a.id); notify.success('Skipped'); load(); }
    catch { notify.error('Could not skip'); }
    finally { setBusyId(null); }
  };

  const handleDelete = async (a) => {
    if (!confirm('Delete this article permanently?')) return;
    setBusyId(a.id);
    try { await deleteArticle(a.id); notify.success('Deleted'); load(); }
    catch { notify.error('Could not delete'); }
    finally { setBusyId(null); }
  };

  const handleBatchDone = () => { exitSelect(); load(); };

  return (
    <div className="pb-24">
      {/* ── Top bar ── */}
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-extrabold">Article Queue</h1>
          <span className="rounded-full bg-warning/15 px-3 py-1 text-sm font-semibold text-warning">
            {articles.length} pending
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Batch toggle */}
          <button
            onClick={() => selectMode ? exitSelect() : setSelectMode(true)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
              selectMode
                ? 'bg-accent text-white'
                : 'border border-[#23233c] text-gray-300 hover:bg-[#23233c]'
            }`}
          >
            {selectMode ? <CheckSquare size={16} /> : <Square size={16} />}
            {selectMode ? 'Cancel Select' : 'Select Articles'}
          </button>

          <button
            onClick={handleScrape}
            disabled={scraping}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {scraping ? <Loader2 size={16} className="spin" /> : <Download size={16} />} Scrape Now
          </button>
        </div>
      </div>

      {/* ── Search & density ── */}
      {!loading && articles.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"/>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search headlines, body, category…"
              className="w-full rounded-lg border border-[#23233c] bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-accent"
            />
          </div>
          <button
            onClick={() => setCompact((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-[#23233c] px-3 py-2 text-xs font-semibold text-gray-300 hover:bg-[#23233c]"
          >
            {compact ? <LayoutList size={14}/> : <LayoutGrid size={14}/>}
            {compact ? 'Comfortable' : 'Compact'}
          </button>
          {search && (
            <span className="text-xs text-gray-500">{filtered.length} of {articles.length} shown</span>
          )}
        </div>
      )}

      {/* ── Select mode controls ── */}
      {selectMode && !loading && articles.length > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
          <button onClick={selectAll}
            className="flex items-center gap-1.5 rounded-lg bg-[#23233c] px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-[#2c2c4a]">
            <CheckSquare size={13} /> Select All ({Math.min(articles.length, MAX_BATCH)})
          </button>
          <button onClick={() => setSelectedIds(new Set())}
            className="flex items-center gap-1.5 rounded-lg bg-[#23233c] px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-[#2c2c4a]">
            <Square size={13} /> Clear
          </button>
          <span className="ml-auto text-sm text-gray-400">
            {selectedIds.size} of {Math.min(articles.length, MAX_BATCH)} selected
          </span>
        </div>
      )}

      {/* ── Article list ── */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-28" />)}
        </div>
      ) : articles.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[#23233c] p-16 text-center text-gray-500">
          <Inbox size={40} />
          <p>The queue is empty. Click <span className="text-accent">Scrape Now</span> to fetch articles.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((a) => (
            <ArticleCard
              key={a.id}
              article={a}
              busy={busyId === a.id}
              compact={compact}
              onPost={handlePost}
              onPreview={handlePreview}
              onSkip={handleSkip}
              onDelete={handleDelete}
              selectMode={selectMode}
              selected={selectedIds.has(a.id)}
              onSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      {/* ── Sticky batch publish bar ── */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-[240px] right-0 z-40 border-t border-[#23233c] bg-card/95 backdrop-blur p-4">
          <div className="flex items-center justify-between gap-4 max-w-5xl mx-auto">
            <div>
              <p className="font-bold text-white">{selectedIds.size} article{selectedIds.size !== 1 ? 's' : ''} selected</p>
              <p className="text-xs text-gray-400">
                Each will be posted to feed + story in sequence (may take a few minutes).
              </p>
            </div>
            <button
              onClick={openBatch}
              className="flex items-center gap-2 rounded-xl bg-success px-6 py-3 text-sm font-bold text-white hover:opacity-90 shadow-lg"
            >
              <Send size={16} /> Publish {selectedIds.size} Now
            </button>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      <PreviewModal
        article={previewArticle}
        onClose={() => setPreviewArticle(null)}
        onPosted={load}
      />

      {batchArticles && (
        <BatchPublishModal
          articles={batchArticles}
          onClose={() => setBatchArticles(null)}
          onDone={handleBatchDone}
        />
      )}
    </div>
  );
}
