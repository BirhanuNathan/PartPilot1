// GET /api/bom — project Bill of Materials as JSON, or ?format=csv to download.
import { bomToCsv, packageFilename, readBom } from './lib/bom'

export default async (req: Request) => {
  const bom = await readBom()
  if (new URL(req.url).searchParams.get('format') === 'csv') {
    return new Response(bomToCsv(bom.lines), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${packageFilename(bom.project, new Date(), 'bom', 'csv')}"`,
      },
    })
  }
  return Response.json(bom, { headers: { 'Cache-Control': 'no-store' } })
}
