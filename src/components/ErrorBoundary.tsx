import { Component, type ReactNode } from 'react'

/** Last-resort guard so the app never shows a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-xl font-semibold text-zinc-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-zinc-600">PartPilot hit an unexpected error. Your project BOM is saved on the server.</p>
        <button type="button" className="btn-primary mt-6" onClick={() => location.reload()}>
          Reload PartPilot
        </button>
      </div>
    )
  }
}
