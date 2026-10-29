import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <p className="font-mono text-sm text-zinc-500">404</p>
      <h1 className="mt-1 text-xl font-semibold">Page not found</h1>
      <Link to="/" className="btn-primary mt-6">
        Back to Find Parts
      </Link>
    </div>
  )
}
