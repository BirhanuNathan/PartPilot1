// GET /api/import-package?id=<packageId>&file=bom|instructions — downloads a generated import-package file.
import { jsonError } from './lib/http'
import { store } from './lib/store'
import type { PackageRecord } from './lib/bom'

export default async (req: Request) => {
  const url = new URL(req.url)
  const id = url.searchParams.get('id') ?? ''
  const file = url.searchParams.get('file')
  if (!/^pkg_[a-z0-9]+$/.test(id)) return jsonError(400, 'Invalid package id.')
  const pkg = (await store().get(`packages/${id}`, { type: 'json' })) as PackageRecord | null
  if (!pkg) return jsonError(404, 'Package not found.')

  if (file === 'bom' || file === 'instructions') {
    const f = pkg.files[file === 'bom' ? 'bom' : 'instructions']
    return new Response(f.content, {
      headers: {
        'Content-Type': file === 'bom' ? 'text/csv; charset=utf-8' : 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${f.filename}"`,
      },
    })
  }
  return Response.json({ id: pkg.id, createdAt: pkg.createdAt, project: pkg.project, links: pkg.links })
}
