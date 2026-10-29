import { NavLink, Outlet } from 'react-router-dom'
import { useDemoMode } from '../lib/demoMode'

const NAV = [
  { to: '/', label: 'Find Parts', end: true },
  { to: '/bom', label: 'Project BOM' },
  { to: '/admin', label: 'Admin / Automations' },
  { to: '/about', label: 'How it works' },
]

export function Layout() {
  const { demo, setDemo } = useDemoMode()
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2 rounded" aria-label="PartPilot home">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            <span className="text-base font-bold tracking-tight">PartPilot</span>
            <span className="hidden font-mono text-[11px] text-zinc-400 sm:inline">v1.0</span>
          </NavLink>
          <nav aria-label="Main" className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm font-medium text-zinc-700">
            <span>Demo mode</span>
            <button
              type="button"
              role="switch"
              aria-checked={demo}
              onClick={() => setDemo(!demo)}
              className={`relative h-6 w-11 rounded-full transition-colors ${demo ? 'bg-amber-500' : 'bg-zinc-300'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${demo ? 'left-[22px]' : 'left-0.5'}`} />
              <span className="sr-only">Toggle demo mode</span>
            </button>
          </label>
        </div>
        {demo && (
          <div className="border-t border-amber-300 bg-amber-100 px-4 py-1.5 text-center text-xs font-semibold text-amber-950" role="status">
            DEMO MODE — replaying pre-recorded agent traces for the 3 example prompts. No live AI calls are made.
          </div>
        )}
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-2 px-4 py-4 text-xs text-zinc-500 sm:px-6">
          <span>PartPilot recommends and verifies. The engineer decides.</span>
          <span className="font-mono">Agents: claude-sonnet-5-5 via Netlify AI Gateway</span>
        </div>
      </footer>
    </div>
  )
}
