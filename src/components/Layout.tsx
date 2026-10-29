import { ClipboardList, Info, PlayCircle, ScanSearch, Workflow } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useDemoMode } from '../lib/demoMode'
import { LogoMark } from './ui'

const NAV = [
  { to: '/', label: 'Find Parts', end: true, Icon: ScanSearch },
  { to: '/bom', label: 'Project BOM', Icon: ClipboardList },
  { to: '/admin', label: 'Automations', Icon: Workflow },
  { to: '/about', label: 'About', Icon: Info },
]

export function Layout() {
  const { demo, setDemo } = useDemoMode()
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:shadow">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2.5 rounded-lg" aria-label="PartPilot home">
            <LogoMark className="h-8 w-8" />
            <span className="text-base font-bold tracking-tight text-zinc-900">
              Part<span className="bg-gradient-to-r from-accent-600 to-cyan-600 bg-clip-text text-transparent">Pilot</span>
            </span>
            <span className="hidden rounded border border-zinc-200 px-1 font-mono text-[10px] text-zinc-500 sm:inline">v1.1</span>
          </NavLink>
          <nav aria-label="Main" className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `relative flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[13px] font-medium sm:px-3 sm:text-sm transition-colors duration-150 ${
                    isActive ? 'bg-accent-50 text-accent-800 shadow-[inset_0_0_0_1px_var(--color-accent-100)]' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                  }`
                }
              >
                <n.Icon className="hidden h-4 w-4 sm:block" strokeWidth={1.8} aria-hidden="true" />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm font-medium text-zinc-700">
            <span id="demo-label" className="font-mono text-xs uppercase tracking-wide">
              Demo mode
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={demo}
              aria-labelledby="demo-label"
              onClick={() => setDemo(!demo)}
              className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${demo ? 'bg-gradient-to-r from-accent-500 to-cyan-500' : 'bg-zinc-300'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${demo ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>
        </div>
        {demo && (
          <div className="flex items-center justify-center gap-2 border-t border-cyan-400/40 bg-gradient-to-r from-accent-50 via-cyan-50 to-accent-50 px-4 py-1.5 text-center font-mono text-xs font-semibold text-cyan-700" role="status">
            <PlayCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            DEMO MODE — replaying recorded agent runs of the example prompts. No live AI calls are made.
          </div>
        )}
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-zinc-200 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-2 px-4 py-4 text-xs text-zinc-500 sm:px-6">
          <span>PartPilot recommends and verifies. The engineer decides.</span>
          <span className="font-mono">agents: claude-sonnet-5-5 via Netlify AI Gateway</span>
        </div>
      </footer>
    </div>
  )
}
