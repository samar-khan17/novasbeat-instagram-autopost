import { NavLink } from 'react-router-dom';
import { LayoutDashboard, List, Palette, Settings, Zap, Globe } from 'lucide-react';

const links = [
  { to: '/',        label: 'Dashboard',    Icon: LayoutDashboard },
  { to: '/queue',   label: 'Article Queue', Icon: List },
  { to: '/editor',  label: 'Design Posts',  Icon: Palette },
  { to: '/settings',label: 'Settings',      Icon: Settings },
];

export default function Sidebar() {
  return (
    <aside
      className="fixed left-0 top-0 flex h-screen w-[240px] flex-col"
      style={{
        background: 'linear-gradient(180deg, #0a0718 0%, #0d0a1a 60%, #110e20 100%)',
        borderRight: '1px solid rgba(138,92,246,0.18)',
      }}
    >
      {/* Brand header */}
      <div className="px-5 py-5 border-b" style={{ borderColor: 'rgba(138,92,246,0.15)' }}>
        <div className="flex items-center gap-3">
          {/* N logo circle */}
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-black text-white"
            style={{
              background: 'linear-gradient(135deg,#8A5CF6,#A855F7)',
              boxShadow: '0 0 14px rgba(138,92,246,0.5)',
            }}
          >
            N
          </div>
          <div>
            <div className="text-sm font-extrabold leading-tight text-white">Novas Beat</div>
            <div className="text-[10px] font-semibold tracking-widest" style={{ color: '#8A5CF6' }}>
              AUTOPOST
            </div>
          </div>
        </div>

        {/* Status dot */}
        <div className="mt-3 flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full glow-pulse"
            style={{ background: '#10b981', boxShadow: '0 0 6px #10b981' }}
          />
          <span className="text-[11px] text-gray-500">Connected to Internet</span>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {links.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`
            }
            style={({ isActive }) =>
              isActive
                ? {
                    background: 'linear-gradient(135deg,rgba(138,92,246,0.22),rgba(168,85,247,0.12))',
                    border: '1px solid rgba(138,92,246,0.35)',
                    boxShadow: '0 0 12px rgba(138,92,246,0.2)',
                  }
                : {}
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={17} style={{ color: isActive ? '#A855F7' : undefined }} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 pb-5 pt-3 border-t" style={{ borderColor: 'rgba(138,92,246,0.12)' }}>
        <div className="flex items-center gap-2 mb-1">
          <Globe size={12} style={{ color: '#8A5CF6' }} />
          <span className="text-[11px] text-gray-500">novasbeat.com</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Zap size={11} style={{ color: '#8A5CF6' }} />
          <span className="text-[10px] text-gray-600">Meta Graph API · AI Powered</span>
        </div>
      </div>
    </aside>
  );
}
