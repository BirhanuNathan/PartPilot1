import { ScanSearch } from 'lucide-react'
import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <p className="font-mono text-sm font-semibold tracking-widest text-accent-700">ERR 404</p>
      <h1 className="mt-1 text-xl font-semibold text-zinc-900">Page not found</h1>
      <p className="mt-2 text-sm text-zinc-600">That drawing is not in the library.</p>
      <Link to="/" className="btn-primary mt-6">
        <ScanSearch className="h-4 w-4" aria-hidden="true" /> Back to Find Parts
      </Link>
    </div>
  )
}
