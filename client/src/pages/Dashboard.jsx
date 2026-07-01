import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw, Zap, Send, CalendarCheck, Clock, ListChecks,
  AlertTriangle, Loader2, Trash2, Eye, ExternalLink,
} from 'lucide-react';
import StatCard from '../components/StatCard.jsx';
import PreviewModal from '../components/PreviewModal.jsx';
import { notify } from '../components/Toast.jsx';
import { getStats, getArticles, getQueue, deleteArticle } from '../lib/api.js';

const STATUS_STYLE = {
  pending:   { bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b',  label: 'Pending'   },
  posted:    { bg: 'rgba(16,185,129,0.15)',   color: '#10b981',  label: 'Posted'    },
  failed:    { bg: 'rgba(239,68,68,0.15)',    color: '#ef4444',  label: 'Failed'    },
  skipped:   { bg: 'rgba(107,114,128,0.15)', color: '#9ca3af', label: 'Skipped'  },
  scheduled: { bg: 'rgba(138,92,246,0.15)',  color: '#A855F7', label: 'Queued'   },
};

const CAT_COLOR = {
  health: '#10b981', technology: '#60A5FA', business: '#f59e0b',
  entertainment: '#ec4899', sports: '#f97316', politics: '#A855F7',
  science: '#38E0D2', world: '#60A5FA',
};

const FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='240'%3E%3Crect width='400' height='240' fill='%230d0a1a'/%3E%3Ctext x='50%25' y='52%25' font-size='56' text-anchor='middle' fill='%23222'%3E%F0%9F%93%B0%3C/text%3E%3C/svg%3E";

function timeAgo(ts) {
  if (!ts) return '';
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ArticleRow({ article, onPreview, onDelete, busy }) {
  const st = STATUS_STYLE[article.status] || STATUS_STYLE.skipped;
  const catColor = CAT_COLOR[(article.category || '').toLowerCase()] || '#8A5CF6';
  const isPending = article.status === 'pending';

  return (
    <div
      className="group relative overflow-hidden rounded-2xl transition-all duration-200"
      style={{
        background: 'linear-gradient(135deg, rgba(26,13,46,0.7) 0%, rgba(17,14,32,0.9) 100%)',
        border: '1px solid rgba(138,92,246,0.15)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }}
    >
      {/* Image */}
      <div className="relative h-44 overflow-hidden">
        <img
          src={article.supabase_image_url || article.image_url || FALLBACK}
          onError={(e) => { e.currentTarget.src = FALLBACK; }}
          alt=""
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {/* gradient overlay */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(5,5,8,0) 30%, rgba(5,5,8,0.9) 100%)' }}
        />
        {/* Status badge */}
        <div
          className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
          style={{ background: st.bg, color: st.color, backdropFilter: 'blur(8px)' }}
        >
          {st.label}
        </div>
        {/* Category */}
        {article.category && (
          <div
            className="absolute right-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
            style={{ background: `${catColor}20`, color: catColor, border: `1px solid ${catColor}40`, backdropFilter: 'blur(8px)' }}
          >
            {article.category}
          </div>
        )}
        {/* Time overlay at bottom */}
        <div className="absolute bottom-2 right-3 text-[10px] text-gray-400">
          {timeAgo(article.scraped_at)}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="line-clamp-2 font-bold leading-snug text-white">
          {article.headline || '(no headline)'}
        </h3>
        {article.body && (
          <p className="mt-2 line-clamp-4 text-[13px] leading-relaxed text-gray-400">
            {article.body}
          </p>
        )}
        {article.source_url && (
          <a
            href={article.source_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-accent hover:text-brand truncate max-w-full"
          >
            <ExternalLink size={10} />
            {article.source_url.replace(/^https?:\/\//, '').slice(0, 50)}
          </a>
        )}
      </div>

      {/* Action buttons */}
      <div
        className="flex gap-2 border-t px-4 pb-4 pt-3"
        style={{ borderColor: 'rgba(138,92,246,0.12)' }}
      >
        {isPending && (
          <button
            onClick={() => onPreview(article)}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold text-white transition-all disabled:opacity-40"
            style={{
              background: 'linear-gradient(135deg,#8A5CF6,#A855F7)',
              boxShadow: '0 0 12px rgba(138,92,246,0.3)',
            }}
          >
            <Eye size={13} /> Preview &amp; Post
          </button>
        )}
        <button
          onClick={() => onDelete(article)}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-red-400 transition-all hover:bg-red-500/10 disabled:opacity-40"
          style={{ border: '1px solid rgba(239,68,68,0.25)' }}
        >
          <Trash2 size={13} /> Delete
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState({ today: 0, week: 0, pending: 0, failed: 0 });
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [previewArticle, setPreviewArticle] = useState(null);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      const [s, arts] = await Promise.all([getStats(), getArticles()]);
      setStats(s);
      setArticles(arts || []);
    } catch {
      notify.error('Could not load dashboard — is the server running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const postNext = async () => {
    setPosting(true);
    try {
      const queue = await getQueue().catch(() => []);
      if (!queue.length) { notify.error('No pending articles in the queue'); return; }
      setPreviewArticle(queue[0]);
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (article) => {
    if (!window.confirm(`Delete "${article.headline?.slice(0, 60)}…"?`)) return;
    setDeletingId(article.id);
    try {
      await deleteArticle(article.id);
      setArticles((prev) => prev.filter((a) => a.id !== article.id));
      notify.success('Article deleted');
    } catch {
      notify.error('Could not delete article');
    } finally {
      setDeletingId(null);
    }
  };

  const displayed = filter === 'all'
    ? articles
    : articles.filter((a) => a.status === filter);

  const FILTERS = [
    { id: 'all',     label: 'All' },
    { id: 'pending', label: 'Pending' },
    { id: 'posted',  label: 'Posted' },
    { id: 'failed',  label: 'Failed' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Dashboard</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {articles.length} article{articles.length !== 1 ? 's' : ''} · newest first
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:text-white"
          style={{ border: '1px solid rgba(138,92,246,0.2)', background: 'rgba(138,92,246,0.06)' }}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Posted Today" value={stats.today}   color="green"  Icon={CalendarCheck} />
        <StatCard label="This Week"    value={stats.week}    color="blue"   Icon={Clock}          />
        <StatCard label="In Queue"     value={stats.pending} color="yellow" Icon={ListChecks}     />
        <StatCard label="Failed"       value={stats.failed}  color="red"    Icon={AlertTriangle}  />
      </div>

      {/* Quick Post */}
      <div
        className="mt-5 rounded-2xl p-5"
        style={{
          background: 'linear-gradient(135deg, rgba(138,92,246,0.12) 0%, rgba(168,85,247,0.06) 100%)',
          border: '1px solid rgba(138,92,246,0.25)',
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 font-bold text-white">
              <Zap size={16} style={{ color: '#A855F7' }} /> Quick Post
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Open the latest pending article for review, edit &amp; publish.
            </p>
          </div>
          <button
            onClick={postNext}
            disabled={posting}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg,#8A5CF6,#A855F7)',
              boxShadow: '0 0 18px rgba(138,92,246,0.35)',
            }}
          >
            {posting ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
            Post Next Article
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="mt-7 mb-4 flex items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className="rounded-xl px-4 py-1.5 text-sm font-semibold transition-all"
            style={
              filter === f.id
                ? { background: 'rgba(138,92,246,0.2)', color: '#A855F7', border: '1px solid rgba(138,92,246,0.4)' }
                : { background: 'transparent', color: '#6b7280', border: '1px solid rgba(138,92,246,0.1)' }
            }
          >
            {f.label}
            {f.id !== 'all' && (
              <span className="ml-1.5 text-[10px] opacity-70">
                {articles.filter((a) => a.status === f.id).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Articles Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-80 rounded-2xl" />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div
          className="rounded-2xl p-14 text-center"
          style={{ border: '1px dashed rgba(138,92,246,0.2)' }}
        >
          <p className="text-gray-500">
            {filter === 'all'
              ? 'No articles yet — go to Article Queue → Scrape Now.'
              : `No ${filter} articles.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {displayed.map((a) => (
            <ArticleRow
              key={a.id}
              article={a}
              onPreview={setPreviewArticle}
              onDelete={handleDelete}
              busy={deletingId === a.id}
            />
          ))}
        </div>
      )}

      <PreviewModal
        article={previewArticle}
        onClose={() => setPreviewArticle(null)}
        onPosted={load}
      />
    </div>
  );
}
