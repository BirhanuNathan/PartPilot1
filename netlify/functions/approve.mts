// Automation 1 — Approval pipeline. POST /api/approve
// Trigger: the engineer clicks "Approve & add to project".
// Steps: save to BOM → generate import package → notify team → write audit log. Every step is recorded in the Automation Runs log.
import { z } from 'zod'
import { RunLogger } from './lib/automation'
import { bomToCsv, getPart, type PackageRecord, importInstructions, lineFromPart, packageFilename, readBom, writeBom } from './lib/bom'
import { jsonError } from './lib/http'
import { notifyTeam, writeAudit } from './lib/notify'
import { VerdictEnum } from './lib/schemas'
import { newId, store } from './lib/store'

const ApproveSchema = z.object({
  approvedBy: z.string().trim().min(1).max(80),
  project: z.string().trim().max(80).optional(),
  searchId: z.string().max(80).optional(),
  description: z.string().max(2000).optional(),
  demo: z.boolean().optional(),
  humanReviewRequired: z.boolean().optional(),
  reasonsForReview: z.array(z.string().max(300)).max(20).optional(),
  items: z
    .array(
      z.object({
        need: z.string().max(200),
        partId: z.string().max(40),
        verdict: VerdictEnum,
        notes: z.string().max(1000).optional(),
        quantity: z.number().int().min(1).max(999).optional(),
      }),
    )
    .min(1)
    .max(10),
})

export default async (req: Request) => {
  if (req.method !== 'POST') return jsonError(405, 'Use POST.')
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'Request body must be JSON.')
  }
  const parsed = ApproveSchema.safeParse(body)
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? 'Invalid approval request.')
  const input = parsed.data

  // Never trust client-sent part data — resolve every id against the catalog.
  const unknown = input.items.filter((i) => !getPart(i.partId))
  if (unknown.length) return jsonError(400, `Unknown part id(s): ${unknown.map((u) => u.partId).join(', ')}`)

  const log = new RunLogger('approval-pipeline', `event: "Approve & add to project" clicked by ${input.approvedBy}${input.demo ? ' (demo mode)' : ''}`)
  const now = new Date()

  try {
    // Step 1 — save approved parts to the project BOM
    const bom = await readBom()
    if (input.project) bom.project = input.project
    const newLines = input.items.map((item) =>
      lineFromPart(getPart(item.partId)!, {
        quantity: item.quantity ?? 1,
        need: item.need,
        verdict: item.verdict,
        notes: item.notes ?? '',
        humanReviewFlag: item.verdict === 'ESCALATE_TO_HUMAN' || !!input.humanReviewRequired,
        approvedBy: input.approvedBy,
        approvedAt: now.toISOString(),
        searchId: input.searchId,
        demo: !!input.demo,
      }),
    )
    bom.lines.push(...newLines)
    bom.updatedAt = now.toISOString()
    await writeBom(bom)
    await log.step('Saved approved parts to project BOM', 'done', `${newLines.length} line(s) added; BOM now has ${bom.lines.length} line(s)`)

    // Step 2 — generate the import package (CAD links + bom.csv + import-instructions.txt)
    const pkg: PackageRecord = {
      id: newId('pkg'),
      createdAt: now.toISOString(),
      project: bom.project,
      files: {
        bom: { filename: packageFilename(bom.project, now, 'bom', 'csv'), content: bomToCsv(newLines) },
        instructions: { filename: packageFilename(bom.project, now, 'import-instructions', 'txt'), content: importInstructions(bom.project, newLines, now) },
      },
      links: newLines.map((l) => ({ partNumber: l.partNumber, url: l.downloadUrl, formats: l.cadFormats })),
    }
    await store().setJSON(`packages/${pkg.id}`, pkg)
    await log.step('Generated import package', 'done', `${pkg.files.bom.filename}, ${pkg.files.instructions.filename}, ${pkg.links.length} CAD link(s)`)

    // Step 3 — notify the team
    const flagged = newLines.filter((l) => l.humanReviewFlag)
    const text = [
      `${input.approvedBy} approved ${newLines.length} part(s) for "${bom.project}":`,
      ...newLines.map((l) => `• ${l.partNumber} — ${l.verdict}${l.humanReviewFlag ? ' ⚠ HUMAN REVIEW' : ''} (${l.need})`),
      flagged.length ? `⚠ ${flagged.length} part(s) need human review: ${(input.reasonsForReview ?? []).slice(0, 3).join('; ') || 'see verdicts'}` : 'No human-review flags.',
    ].join('\n')
    const sent = await notifyTeam('approval', `Parts approved for ${bom.project}`, text)
    await log.step('Notified team', 'done', sent.detail)

    // Step 4 — audit log
    await writeAudit('parts.approved', input.approvedBy, {
      project: bom.project,
      searchId: input.searchId,
      packageId: pkg.id,
      demo: !!input.demo,
      items: newLines.map((l) => ({ partNumber: l.partNumber, verdict: l.verdict, humanReviewFlag: l.humanReviewFlag })),
    })
    await log.step('Wrote audit log entry', 'done')

    const run = await log.finish('succeeded', { packageId: pkg.id, lines: newLines.length })
    return Response.json({
      run,
      package: {
        id: pkg.id,
        files: [
          { label: 'bom.csv', filename: pkg.files.bom.filename, url: `/api/import-package?id=${pkg.id}&file=bom` },
          { label: 'import-instructions.txt', filename: pkg.files.instructions.filename, url: `/api/import-package?id=${pkg.id}&file=instructions` },
        ],
        links: pkg.links,
      },
      bomLineCount: bom.lines.length,
    })
  } catch (err) {
    console.error('approval pipeline failed', err)
    await log.step('Pipeline error', 'failed', err instanceof Error ? err.message : String(err))
    const run = await log.finish('failed')
    return jsonError(500, 'The approval pipeline failed. Nothing was lost — please retry.', { run })
  }
}
