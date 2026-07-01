import { useState } from 'react';
import { X, Send, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { postNow } from '../lib/api.js';

const STATUS_ICON = {
  pending:  <Clock size={16} className="text-gray-400" />,
  posting:  <Loader2 size={16} className="spin text-accent" />,
  done:     <CheckCircle size={16} className="text-success" />,
  failed:   <XCircle size={16} className="text-error" />,
};

const STATUS_TEXT = {
  pending: 'text-gray-400',
  posting: 'text-accent',
  done:    'text-success',
  failed:  'text-error',
};

export default function BatchPublishModal({ articles, onClose, onDone }) {
  // rows: { id, headline, image_url, status: 'pending'|'posting'|'done'|'failed', error? }
  const [rows, setRows] = useState(
    articles.map((a) => ({ id: a.id, headline: a.headline, image_url: a.image_url, status: 'pending' }))
  );
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  const setRow = (id, patch) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const run = async () => {
    setRunning(true);
    let anyFailed = false;

    for (const row of rows) {
      if (row.status !== 'pending') continue;
      setRow(row.id, { status: 'posting' });
      try {
        await postNow(row.id, {});
        setRow(row.id, { status: 'done' });
      } catch (e) {
        setRow(row.id, { status: 'failed', error: e?.response?.data?.error || e.message });
        anyFailed = true;
      }
    }

    setRunning(false);
    setFinished(true);
    onDone && onDone();
    void anyFailed;
  };

  const doneCount   = rows.filter((r) => r.status === 'done').length;
  const failedCount = rows.filter((r) => r.status === 'failed').length;
  const total       = rows.length;

  const progress = Math.round(((doneCount + failedCount) / total) * 100);

  const FALLBACK =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%2323233c'/%3E%3Ctext x='50%25' y='55%25' font-size='18' text-anchor='middle' fill='%23555'%3E%F0%9F%93%B0%3C/text%3E%3C/svg%3E";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => { if (!running && e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#23233c] bg-card">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#23233c] p-4">
          <div>
            <h2 className="font-bold">Bulk Publish — {total} articles</h2>
            <p className="text-xs text-gray-400">Posts to feed + story for each article, one by one.</p>
          </div>
          {!running && (
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-[#23233c] hover:text-white">
              <X size={18} />
            </button>
          )}
        </div>

        {/* Progress bar */}
        {(running || finished) && (
          <div className="px-5 pt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
              <span>{doneCount + failedCount} / {total} processed</span>
              <span>{doneCount} posted{failedCount > 0 ? `, ${failedCount} failed` : ''}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#23233c]">
              <div
                className="h-full rounded-full bg-success transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Article list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {rows.map((row) => (
            <div key={row.id}
              className="flex items-center gap-3 rounded-lg border border-[#23233c] bg-[#0f0f1a] p-3">
              <img
                src={row.image_url || FALLBACK}
                onError={(e) => { e.currentTarget.src = FALLBACK; }}
                alt="" className="h-10 w-10 flex-shrink-0 rounded-md object-cover bg-[#23233c]"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{row.headline || '(no headline)'}</p>
                {row.error && <p className="text-xs text-error truncate">{row.error}</p>}
              </div>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                {STATUS_ICON[row.status]}
                <span className={`text-xs font-medium capitalize ${STATUS_TEXT[row.status]}`}>
                  {row.status}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-[#23233c] p-4">
          {finished ? (
            <>
              <span className="text-sm text-gray-400">
                Done: {doneCount} posted, {failedCount} failed.
              </span>
              <button onClick={onClose}
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
                Close
              </button>
            </>
          ) : running ? (
            <>
              <span className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 size={15} className="spin" /> Publishing… do not close this window.
              </span>
            </>
          ) : (
            <>
              <span className="text-xs text-gray-500">
                This will post {total} article{total !== 1 ? 's' : ''} to @novasbeatnews.
              </span>
              <div className="flex gap-2">
                <button onClick={onClose}
                  className="rounded-lg border border-[#23233c] px-4 py-2.5 text-sm text-gray-300 hover:bg-[#23233c]">
                  Cancel
                </button>
                <button
                  onClick={run}
                  className="flex items-center gap-2 rounded-lg bg-success px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
                >
                  <Send size={15} /> Confirm &amp; Publish All
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
