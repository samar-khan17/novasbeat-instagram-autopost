import {
  ArrowUp, ArrowDown, Type, AlignLeft, AlignCenter, AlignRight, RefreshCw, Loader2,
} from 'lucide-react';

export const TEMPLATES = [
  { id: 'novasbeat', label: 'NovasBeat', desc: 'Purple gradient', preview: 'linear-gradient(135deg,#9333EA,#EC4899)' },
  { id: 'bbc', label: 'BBC Classic', desc: 'Bold + red accent', preview: 'linear-gradient(135deg,#000,#BB1919)' },
  { id: 'ary', label: 'ARY News', desc: 'Blue + gold bar', preview: 'linear-gradient(135deg,#1E4D8C,#D4A017)' },
];

export const LOGO_POSITIONS = [
  { id: 'top-left', label: 'Left' },
  { id: 'top-center', label: 'Center' },
  { id: 'top-right', label: 'Right' },
];

export const HIGHLIGHT_COLORS = ['', '#a855f7', '#ec4899', '#f59e0b', '#4ade80', '#38bdf8', '#BB1919', '#D4A017'];

export const DEFAULT_OPTS = {
  template: 'novasbeat',
  headlineOffset: 0,
  logoPosition: 'top-left',
  fontScale: 1,
  textAlign: 'left',
  highlightColor: '',
  gradientStrength: 70,
  showFooter: true,
  accentColor: '',
};

export function optsFromSettings(s = {}) {
  return {
    template: s.default_template || 'novasbeat',
    headlineOffset: parseInt(s.default_headline_offset, 10) || 0,
    logoPosition: s.default_logo_position || 'top-left',
    fontScale: parseFloat(s.default_font_scale) || 1,
    textAlign: s.default_text_align || 'left',
    highlightColor: '',
    gradientStrength: parseInt(s.default_gradient_strength, 10) ?? 70,
    showFooter: s.default_show_footer !== 'false',
    accentColor: '',
  };
}

export default function DesignControls({
  opts, setOpts, loading, onRefresh, compact = false,
}) {
  const move = (k, v) => setOpts((o) => ({ ...o, [k]: v }));
  const fontPct = Math.round((opts.fontScale || 1) * 100);

  return (
    <div className={`space-y-3 ${compact ? '' : 'rounded-xl border border-[#23233c] p-3'}`}>
      {!compact && (
        <div className="text-xs font-semibold text-gray-300">
          Design <span className="font-normal text-green-400">(live preview)</span>
        </div>
      )}

      {/* Template picker */}
      <div>
        <span className="mb-1.5 block text-xs text-gray-400">Post template</span>
        <div className="grid grid-cols-3 gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => move('template', t.id)}
              className={`rounded-lg border p-2 text-left transition-colors ${
                opts.template === t.id ? 'border-accent bg-accent/10' : 'border-[#23233c] bg-[#0f0f1a] hover:border-[#3a3a5c]'
              }`}
            >
              <div className="mb-1 h-6 rounded" style={{ background: t.preview }} />
              <div className="text-[11px] font-semibold">{t.label}</div>
              <div className="text-[10px] text-gray-500">{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400">Headline position</span>
        <div className="flex gap-1">
          <button type="button" onClick={() => move('headlineOffset', Math.min(400, (opts.headlineOffset || 0) + 40))}
            className="rounded-lg bg-[#23233c] p-1.5 hover:bg-[#2c2c4a]" title="Move up"><ArrowUp size={14}/></button>
          <button type="button" onClick={() => move('headlineOffset', Math.max(-80, (opts.headlineOffset || 0) - 40))}
            className="rounded-lg bg-[#23233c] p-1.5 hover:bg-[#2c2c4a]" title="Move down"><ArrowDown size={14}/></button>
          <span className="ml-1 self-center text-xs text-gray-500">{opts.headlineOffset || 0}px</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400">Logo position</span>
        <div className="flex gap-1">
          {LOGO_POSITIONS.map((p) => (
            <button key={p.id} type="button" onClick={() => move('logoPosition', p.id)}
              className={`rounded-lg px-2.5 py-1.5 text-xs ${opts.logoPosition === p.id ? 'bg-accent text-white' : 'bg-[#23233c] text-gray-300 hover:bg-[#2c2c4a]'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400">Text align</span>
        <div className="flex gap-1">
          {[{ v: 'left', I: AlignLeft }, { v: 'center', I: AlignCenter }, { v: 'right', I: AlignRight }].map(({ v, I }) => (
            <button key={v} type="button" onClick={() => move('textAlign', v)}
              className={`rounded-lg p-1.5 ${opts.textAlign === v ? 'bg-accent text-white' : 'bg-[#23233c] text-gray-300 hover:bg-[#2c2c4a]'}`}>
              <I size={13}/>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-xs text-gray-400"><Type size={12}/> Text size</span>
        <div className="flex items-center gap-2">
          <input type="range" min="70" max="140" step="5" value={fontPct}
            onChange={(e) => move('fontScale', +e.target.value / 100)}
            className="w-24 accent-accent"/>
          <span className="w-10 text-right text-xs text-gray-500">{fontPct}%</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400">Gradient darkness</span>
        <div className="flex items-center gap-2">
          <input type="range" min="0" max="100" step="5" value={opts.gradientStrength ?? 70}
            onChange={(e) => move('gradientStrength', +e.target.value)}
            className="w-24 accent-accent"/>
          <span className="w-10 text-right text-xs text-gray-500">{opts.gradientStrength ?? 70}%</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400">Headline highlight</span>
        <div className="flex gap-1">
          {HIGHLIGHT_COLORS.map((c) => (
            <button key={c || 'none'} type="button" onClick={() => move('highlightColor', c)}
              style={{
                width: 20, height: 20, borderRadius: 4,
                background: c || 'transparent',
                border: (opts.highlightColor || '') === c ? '2px solid white' : '1px solid #444',
              }}
              title={c || 'None'}/>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400">Custom accent</span>
        <input type="color" value={opts.accentColor || '#a855f7'}
          onChange={(e) => move('accentColor', e.target.value)}
          className="h-8 w-12 cursor-pointer rounded border border-[#23233c] bg-transparent"/>
        <button type="button" onClick={() => move('accentColor', '')}
          className="text-[10px] text-gray-500 hover:text-gray-300">Reset</button>
      </div>

      <label className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400">Show novasbeat.com footer</span>
        <input type="checkbox" checked={opts.showFooter !== false}
          onChange={(e) => move('showFooter', e.target.checked)}
          className="accent-accent"/>
      </label>

      {onRefresh && (
        <button type="button" onClick={onRefresh} disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#23233c] py-2 text-xs font-semibold hover:bg-[#2c2c4a] disabled:opacity-50">
          {loading ? <Loader2 size={13} className="spin"/> : <RefreshCw size={13}/>}
          Force refresh now
        </button>
      )}
    </div>
  );
}
