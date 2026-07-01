export default function StatCard({ label, value, color = 'purple', Icon, sub }) {
  const C = {
    green:  { bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.28)',  text: '#10b981', glow: '0 0 24px rgba(16,185,129,0.12)'  },
    blue:   { bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.28)',  text: '#60A5FA', glow: '0 0 24px rgba(96,165,250,0.12)'  },
    yellow: { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.28)',  text: '#f59e0b', glow: '0 0 24px rgba(245,158,11,0.12)'  },
    red:    { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.28)',   text: '#ef4444', glow: '0 0 24px rgba(239,68,68,0.12)'   },
    purple: { bg: 'rgba(138,92,246,0.08)',  border: 'rgba(138,92,246,0.28)', text: '#A855F7', glow: '0 0 24px rgba(138,92,246,0.12)'  },
  };
  const c = C[color] || C.purple;

  return (
    <div
      className="rounded-2xl p-5 transition-all"
      style={{ background: c.bg, border: `1px solid ${c.border}`, boxShadow: c.glow }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: c.text }}
          >
            {label}
          </p>
          <p className="mt-2 text-4xl font-black text-white">{value ?? '—'}</p>
          {sub && <p className="mt-1 text-[11px] text-gray-600">{sub}</p>}
        </div>
        {Icon && (
          <div
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ background: `${c.text}14`, border: `1px solid ${c.border}` }}
          >
            <Icon size={19} style={{ color: c.text }} />
          </div>
        )}
      </div>
      <div
        className="mt-4 h-0.5 rounded-full"
        style={{ background: `linear-gradient(90deg, ${c.text}50, transparent)` }}
      />
    </div>
  );
}
