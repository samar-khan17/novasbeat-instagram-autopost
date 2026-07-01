import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, Loader2 } from 'lucide-react';

export default function InstagramMockup({
  imageUrl,
  rawImageUrl,
  showRaw = false,
  loading = false,
  username = 'novasbeatnews',
  caption = '',
  hashtags = '',
  onExpand,
  width = 280,
}) {
  const displayUrl = showRaw ? (rawImageUrl || imageUrl) : imageUrl;

  return (
    <div className="mx-auto" style={{ width }}>
      <div
        className="overflow-hidden rounded-2xl border border-[#333] bg-black shadow-2xl"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}
      >
        {/* Profile row */}
        <div className="flex items-center gap-2.5 border-b border-[#222] px-3 py-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 text-xs font-bold text-white">
            N
          </div>
          <span className="flex-1 text-xs font-semibold text-white">{username}</span>
          <MoreHorizontal size={16} className="text-gray-400"/>
        </div>

        {/* Image */}
        <div className="relative aspect-[4/5] w-full bg-[#111]">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400">
              <Loader2 size={24} className="spin"/>
              <span className="text-xs">Building…</span>
            </div>
          ) : displayUrl ? (
            <img
              src={displayUrl}
              alt="Instagram post preview"
              className="h-full w-full object-cover cursor-pointer"
              onClick={onExpand}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">No preview</div>
          )}
          {showRaw && (
            <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white">
              Original photo
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 px-3 py-2.5">
          <Heart size={20} className="text-white"/>
          <MessageCircle size={20} className="text-white"/>
          <Send size={20} className="text-white"/>
          <Bookmark size={20} className="ml-auto text-white"/>
        </div>

        {/* Caption */}
        <div className="px-3 pb-3 text-xs leading-relaxed text-gray-200">
          <span className="font-semibold text-white">{username}</span>
          {caption ? (
            <span className="ml-1 whitespace-pre-wrap break-words text-gray-300">
              {caption.length > 180 ? `${caption.slice(0, 180)}…` : caption}
            </span>
          ) : (
            <span className="ml-1 text-gray-500">Caption will appear here…</span>
          )}
          {hashtags && (
            <p className="mt-1 break-words text-accent/90">{hashtags}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function InstagramStoryMockup({ storyUrl, feedImageUrl, loading, onExpand }) {
  return (
    <div className="mx-auto" style={{ width: 220 }}>
      <div style={{
        position: 'relative', width: 220, background: '#111', borderRadius: 32,
        border: '3px solid #333', overflow: 'hidden', aspectRatio: '9/16',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      }}>
        <div style={{ background: '#000', padding: '6px 16px', display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#fff' }}>
          <span>9:41</span><span>📶 🔋</span>
        </div>
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 12, height: 'calc(100% - 24px)', background: '#1a1a2e' }}>
          <div style={{ position: 'absolute', top: 3, left: 8, right: 8, height: 2, background: 'rgba(255,255,255,0.25)', borderRadius: 2 }}>
            <div style={{ width: '60%', height: '100%', background: '#fff', borderRadius: 2 }}/>
          </div>
          <div style={{ position: 'absolute', top: 8, left: 10, right: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,#a855f7,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 700, border: '2px solid #a855f7' }}>N</div>
            <span style={{ fontSize: 9, color: '#fff', fontWeight: 600 }}>novasbeatnews</span>
          </div>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.5)' }}>
              <Loader2 size={20} className="spin"/>
              <span style={{ fontSize: 10 }}>Building story…</span>
            </div>
          ) : storyUrl ? (
            <img src={storyUrl} alt="story" style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }} onClick={onExpand}/>
          ) : feedImageUrl ? (
            <div style={{ cursor: 'pointer' }} onClick={onExpand} title="Tap to see full story">
              <div style={{ background: '#fff', borderRadius: 8, overflow: 'hidden', width: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                <div style={{ background: '#fff', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 5, borderBottom: '1px solid #eee' }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'linear-gradient(135deg,#a855f7,#6366f1)', fontSize: 7, color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>N</div>
                  <span style={{ fontSize: 8, fontWeight: 700, color: '#111' }}>novasbeatnews</span>
                </div>
                <img src={feedImageUrl} alt="post" style={{ width: '100%', aspectRatio: '4/5', objectFit: 'cover', display: 'block' }}/>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.4)', fontSize: 10 }}>Generate feed preview first</div>
          )}
        </div>
      </div>
    </div>
  );
}
