import { Send, SkipForward, Trash2, Loader2, CheckSquare, Square, Eye, ExternalLink } from 'lucide-react';

function timeAgo(ts) {
  if (!ts) return '';
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Crect width='120' height='120' fill='%230d0a1a'/%3E%3Ctext x='50%25' y='52%25' font-size='40' text-anchor='middle' fill='%23333'%3E%F0%9F%93%B0%3C/text%3E%3C/svg%3E";

const CAT_COLORS = {
  health:        { text: '#10b981', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.3)',  left: '#10b981' },
  technology:    { text: '#60A5FA', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.3)',  left: '#60A5FA' },
  business:      { text: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', left: '#f59e0b' },
  entertainment: { text: '#ec4899', bg: 'rgba(236,72,153,0.12)', border: 'rgba(236,72,153,0.3)', left: '#ec4899' },
  sports:        { text: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)', left: '#f97316' },
  politics:      { text: '#A855F7', bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)', left: '#A855F7' },
  science:       { text: '#38E0D2', bg: 'rgba(56,224,210,0.12)', border: 'rgba(56,224,210,0.3)', left: '#38E0D2' },
};

const DEFAULT_CAT = { text: '#8A5CF6', bg: 'rgba(138,92,246,0.12)', border: 'rgba(138,92,246,0.3)', left: '#8A5CF6' };

export default function ArticleCard({
  article,
  onPost, onPreview, onSkip, onDelete,
  busy,
  compact = false,
  selectMode = false,
  selected = false,
  onSelect,
}) {
  const cat = CAT_COLORS[(article.category || '').toLowerCase()] || DEFAULT_CAT;

  return (
    <div
      className={`relative flex gap-3 overflow-hidden rounded-2xl p-4 transition-all duration-200 ${
        selectMode ? 'cursor-pointer' : ''
      }`}
      style={{
        background: selected
          ? 'linear-gradient(135deg, rgba(138,92,246,0.15), rgba(17,14,32,0.95))'
          : 'linear-gradient(135deg, rgba(26,13,46,0.6), rgba(17,14,32,0.95))',
        border: selected
          ? '1px solid rgba(138,92,246,0.45)'
          : '1px solid rgba(138,92,246,0.14)',
        borderLeft: `3px solid ${cat.left}`,
        boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
      }}
      onClick={selectMode && onSelect ? () => onSelect(article.id) : undefined}
    >
      {/* Checkbox */}
      {selectMode && (
        <button
          onClick={(e) => { e.stopPropagation(); onSelect && onSelect(article.id); }}
          className="flex-shrink-0 self-start pt-0.5"
          style={{ color: selected ? '#A855F7' : '#4b5563' }}
        >
          {selected ? <CheckSquare size={20} /> : <Square size={20} />}
        </button>
      )}

      {/* Thumbnail */}
      <img
        src={article.supabase_image_url || article.image_url || FALLBACK}
        onError={(e) => { e.currentTarget.src = FALLBACK; }}
        alt=""
        className={`flex-shrink-0 rounded-xl object-cover ${
          compact ? 'h-16 w-16' : 'h-[110px] w-[110px]'
        }`}
        style={{ background: '#0d0a1a' }}
      />

      {/* Body */}
      <div className="min-w-0 flex-1">
        <h3 className={`font-bold leading-snug text-white ${compact ? 'line-clamp-1 text-sm' : 'line-clamp-2'}`}>
          {article.headline || '(no headline)'}
        </h3>

        {!compact && article.body && (
          <p className="mt-1.5 line-clamp-4 text-[13px] leading-relaxed text-gray-400">
            {article.body}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {article.category && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ color: cat.text, background: cat.bg, border: `1px solid ${cat.border}` }}
            >
              {article.category}
            </span>
          )}
          <span className="text-[11px] text-gray-600">
            Scraped {timeAgo(article.scraped_at)}
          </span>
          {article.source_url && !compact && (
            <a
              href={article.source_url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 text-[11px] text-accent hover:text-brand"
            >
              <ExternalLink size={9} /> Source
            </a>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {!selectMode && (
        <div className="flex flex-shrink-0 flex-col items-stretch gap-2">
          {onPreview && (
            <button
              onClick={() => onPreview(article)}
              disabled={busy}
              className="flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold text-gray-200 transition-all disabled:opacity-40"
              style={{ border: '1px solid rgba(138,92,246,0.25)', background: 'rgba(138,92,246,0.08)' }}
            >
              <Eye size={13} /> Preview
            </button>
          )}
          <button
            onClick={() => onPost(article)}
            disabled={busy}
            className="flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-white transition-all disabled:opacity-40"
            style={{
              background: 'linear-gradient(135deg,#8A5CF6,#A855F7)',
              boxShadow: '0 0 10px rgba(138,92,246,0.3)',
            }}
          >
            {busy ? <Loader2 size={13} className="spin" /> : <Send size={13} />} Post
          </button>
          <button
            onClick={() => onSkip(article)}
            disabled={busy}
            className="flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold text-gray-400 transition-all hover:text-white disabled:opacity-40"
            style={{ border: '1px solid rgba(138,92,246,0.12)', background: 'rgba(255,255,255,0.03)' }}
          >
            <SkipForward size={13} /> Skip
          </button>
          <button
            onClick={() => onDelete(article)}
            disabled={busy}
            className="flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold text-red-400 transition-all hover:bg-red-500/10 disabled:opacity-40"
            style={{ border: '1px solid rgba(239,68,68,0.25)' }}
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
