import { useCallback, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, CircleCheck, Download, ExternalLink, FlaskConical, ImageUp, Sparkles, UserRound, X } from 'lucide-react'
import { AgentPipeline, type NodeStatus } from '../components/AgentPipeline'
import { NeedResult } from '../components/NeedResult'
import { RunStepper } from '../components/RunStepper'
import { Banner, Meter, Spinner } from '../components/ui'
import { ALL_EXAMPLES, EDGE_EXAMPLE, EXAMPLES, type ExampleId, type ExamplePrompt } from '../demo/examples'
import { ApiError, postJson, streamAgent } from '../lib/api'
import { useApprover, useDemoMode } from '../lib/demoMode'
import { toPayload, validateFile } from '../lib/image'
import type { AutomationRun, Constraints, FinderResult, ImagePayload, Part, TraceStep, Verdict, VerifyResult } from '../lib/types'

type Phase = 'idle' | 'finding' | 'verifying' | 'done' | 'question' | 'error'

interface ApprovalResponse {
  run: AutomationRun
  package: { id: string; files: { label: string; filename: string; url: string }[]; links: { partNumber: string; url: string; formats: string[] }[] }
  bomLineCount: number
}

const MATERIALS = ['steel', 'stainless', 'aluminum', 'brass', 'nylon']
const STANDARDS = ['ISO', 'DIN', 'ANSI']

export function FindPartsPage() {
  const { demo, setDemo } = useDemoMode()
  const [approver, setApprover] = useApprover()

  // Input state
  const [description, setDescription] = useState('')
  const [constraints, setConstraints] = useState<Constraints>({})
  const [image, setImage] = useState<ImagePayload | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [imageBusy, setImageBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [exampleId, setExampleId] = useState<ExampleId | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // Run state
  const [phase, setPhase] = useState<Phase>('idle')
  const [runMode, setRunMode] = useState<'live' | 'demo'>('live')
  const [finderSteps, setFinderSteps] = useState<TraceStep[]>([])
  const [verifySteps, setVerifySteps] = useState<TraceStep[]>([])
  const [finder, setFinder] = useState<FinderResult | null>(null)
  const [verify, setVerify] = useState<VerifyResult | null>(null)
  const [parts, setParts] = useState<Record<string, Part>>({})
  const [searchId, setSearchId] = useState<string | undefined>()
  const [error, setError] = useState<{ message: string; stage: 'finder' | 'verify' } | null>(null)
  const [answer, setAnswer] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  // Approval state
  const [approvedNeeds, setApprovedNeeds] = useState<Set<string>>(new Set())
  const [approving, setApproving] = useState(false)
  const [approval, setApproval] = useState<ApprovalResponse | null>(null)
  const [toast, setToast] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const busy = phase === 'finding' || phase === 'verifying'

  const flash = (tone: 'ok' | 'err', text: string) => {
    setToast({ tone, text })
    window.setTimeout(() => setToast(null), 5000)
  }

  const handleFile = useCallback(async (file: File) => {
    setImageError(null)
    const err = validateFile(file)
    if (err) return setImageError(err)
    setImageBusy(true)
    try {
      const { payload, previewUrl } = await toPayload(file)
      setImage(payload)
      setPreview(previewUrl)
      setExampleId(null)
    } catch (e) {
      setImageError(e instanceof Error ? e.message : 'Could not read that image.')
    } finally {
      setImageBusy(false)
    }
  }, [])

  const loadExample = async (ex: ExamplePrompt) => {
    setDescription(ex.description)
    setConstraints(ex.constraints)
    setExampleId(ex.id)
    setImageError(null)
    setImageBusy(true)
    try {
      const { payload, previewUrl } = await toPayload(ex.image)
      setImage(payload)
      setPreview(previewUrl)
    } catch {
      setImage(null)
      setPreview(ex.image)
      setImageError('Could not rasterize the sample screenshot; continuing with text only.')
    } finally {
      setImageBusy(false)
    }
  }

  const clearImage = () => {
    setImage(null)
    setPreview(null)
    setImageError(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  const resetRun = () => {
    abortRef.current?.abort()
    setFinderSteps([])
    setVerifySteps([])
    setFinder(null)
    setVerify(null)
    setParts({})
    setSearchId(undefined)
    setError(null)
    setApprovedNeeds(new Set())
    setApproval(null)
    setAnswer('')
  }

  const runDemo = async (id: ExampleId) => {
    resetRun()
    setRunMode('demo')
    setPhase('finding')
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const { getDemoRun, replay } = await import('../demo/traces')
    const run = getDemoRun(id)
    await replay(run.finder.steps, (s) => setFinderSteps((p) => [...p, s]), ctrl.signal)
    if (ctrl.signal.aborted) return
    setFinder(run.finder.result)
    setParts(run.finder.parts)
    setPhase('verifying')
    await replay(run.verify.steps, (s) => setVerifySteps((p) => [...p, s]), ctrl.signal)
    if (ctrl.signal.aborted) return
    setVerify(run.verify.result)
    setParts((p) => ({ ...p, ...run.verify.parts }))
    setPhase('done')
    const ex = ALL_EXAMPLES.find((e) => e.id === id)!
    postJson<{ searchId: string }>('/api/log-search', { description: ex.description, constraints: ex.constraints, hasImage: true, finder: run.finder.result, verify: run.verify.result })
      .then((r) => setSearchId(r.searchId))
      .catch(() => {})
  }

  const runLive = async (desc: string) => {
    resetRun()
    setRunMode('live')
    setPhase('finding')
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const body = { description: desc, constraints, ...(image ? { image } : {}) }

    let shortlist: FinderResult
    let sid: string | undefined
    try {
      const res = await streamAgent('/api/find-parts', body, (ev) => ev.type === 'step' && setFinderSteps((p) => [...p, ev.step]), { signal: ctrl.signal })
      shortlist = res.result as FinderResult
      sid = res.searchId
      setFinder(shortlist)
      setParts(res.parts as Record<string, Part>)
      setSearchId(sid)
    } catch (e) {
      if (ctrl.signal.aborted) return
      setError({ message: e instanceof ApiError ? e.message : 'Unexpected error.', stage: 'finder' })
      setPhase('error')
      return
    }

    if (shortlist.clarifyingQuestion) return setPhase('question')
    if (!shortlist.needs.some((n) => n.candidates.length > 0)) return setPhase('done')

    setPhase('verifying')
    try {
      const res = await streamAgent(
        '/api/verify-fit',
        { ...body, searchId: sid, shortlist },
        (ev) => ev.type === 'step' && setVerifySteps((p) => [...p, ev.step]),
        { signal: ctrl.signal },
      )
      setVerify(res.result as VerifyResult)
      setParts((p) => ({ ...p, ...(res.parts as Record<string, Part>) }))
      setPhase('done')
    } catch (e) {
      if (ctrl.signal.aborted) return
      setError({ message: e instanceof ApiError ? e.message : 'Unexpected error.', stage: 'verify' })
      setPhase('error')
    }
  }

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (busy) return
    if (demo) {
      if (!exampleId) {
        setError({ message: 'Demo mode replays recorded runs of the example prompts (the four main examples and the edge case under More examples). Pick one of them below, or turn Demo mode off for a live search.', stage: 'finder' })
        setPhase('error')
        return
      }
      void runDemo(exampleId)
      return
    }
    if (description.trim().length < 5) {
      setError({ message: 'Describe what you are building (at least a few words).', stage: 'finder' })
      setPhase('error')
      return
    }
    void runLive(description.trim())
  }

  const answerQuestion = (e: FormEvent) => {
    e.preventDefault()
    if (!answer.trim() || !finder?.clarifyingQuestion) return
    const next = `${description.trim()}\n\nQ: ${finder.clarifyingQuestion}\nA: ${answer.trim()}`
    setDescription(next)
    void runLive(next)
  }

  const verdictFor = (need: string): Verdict | undefined => verify?.verdicts.find((v) => v.need === need)

  const approve = async (needNames: string[]) => {
    if (!finder) return
    const items = needNames
      .map((n) => {
        const need = finder.needs.find((x) => x.need === n)
        const v = verdictFor(n)
        const partId = v?.partId ?? need?.candidates[0]?.partId
        if (!partId) return null
        return { need: n, partId, verdict: v?.verdict ?? 'ESCALATE_TO_HUMAN', notes: v?.notes ?? 'Not verified by Fit Checker' }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
    if (items.length === 0) return
    const escalated = items.filter((i) => i.verdict === 'ESCALATE_TO_HUMAN')
    if (escalated.length && !window.confirm(`${escalated.length} part(s) are flagged for human review. Add them to the BOM with a review flag?`)) return

    setApproving(true)
    try {
      const res = await postJson<ApprovalResponse>('/api/approve', {
        approvedBy: approver.trim() || 'Design engineer',
        searchId,
        description,
        demo: runMode === 'demo',
        humanReviewRequired: verify?.humanReviewRequired ?? true,
        reasonsForReview: verify?.reasonsForReview ?? [],
        items,
      })
      setApproval(res)
      setApprovedNeeds((s) => new Set([...s, ...items.map((i) => i.need)]))
      flash('ok', `Added ${items.length} part(s) to the project BOM.`)
    } catch (e) {
      flash('err', e instanceof ApiError ? e.message : 'Approval failed. Please retry.')
    } finally {
      setApproving(false)
    }
  }

  const requestReview = async (need: string) => {
    const v = verdictFor(need)
    const partId = v?.partId ?? finder?.needs.find((n) => n.need === need)?.candidates[0]?.partId
    if (!partId) return
    const reason = window.prompt('What should the reviewer look at? (optional)', v?.notes ?? '')
    if (reason === null) return
    try {
      const res = await postJson<{ detail: string }>('/api/request-review', { requestedBy: approver || 'Design engineer', need, partId, verdict: v?.verdict, reason, searchId, description })
      flash('ok', `Review requested — ${res.detail}.`)
    } catch (e) {
      flash('err', e instanceof ApiError ? e.message : 'Could not send the review request.')
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) void handleFile(f)
  }

  const finderStatus = phase === 'finding' ? 'running' : error?.stage === 'finder' && phase === 'error' ? 'error' : finder ? 'done' : 'waiting'
  const verifyStatus = phase === 'verifying' ? 'running' : error?.stage === 'verify' ? 'error' : verify ? 'done' : 'waiting'
  const showRun = phase !== 'idle' && !(phase === 'error' && finderSteps.length === 0 && !finder)
  const approvalStatus: NodeStatus = approval
    ? approval.run.status === 'succeeded'
      ? 'done'
      : 'error'
    : verify
      ? verify.humanReviewRequired
        ? 'review'
        : 'paused'
      : 'waiting'
  const approvableNeeds = finder?.needs.filter((n) => n.candidates.length > 0 && !approvedNeeds.has(n.need)).map((n) => n.need) ?? []

  return (
    <div>
      {/* Input */}
      <section className="border-b border-zinc-200/70">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="max-w-3xl">
            <p className="label-caps flex items-center gap-1.5 text-accent-700">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> PartPilot · CAD parts search
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 sm:text-[2.1rem] sm:leading-tight">
              Describe it. Get the{' '}
              <span className="bg-gradient-to-r from-accent-600 to-cyan-600 bg-clip-text text-transparent">exact parts</span> to import.
            </h1>
            <p className="mt-2 text-sm text-zinc-600 sm:text-base">
              Two AI agents search the parts library, check every pick against the company CAD rulebook, and hand back verified part numbers — in seconds instead of minutes of browsing.
            </p>
          </div>

          <form onSubmit={submit} className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="card p-4">
              <label htmlFor="desc" className="text-sm font-semibold text-zinc-900">
                What are you building?
              </label>
              <textarea
                id="desc"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value)
                  if (exampleId) setExampleId(null)
                }}
                rows={5}
                maxLength={2000}
                placeholder="e.g. 'Motor mount for a NEMA 17 stepper driving an 8 mm shaft with M3 bolts'"
                className="mt-2 w-full resize-y rounded-[10px] border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 transition-shadow duration-150 focus:border-accent-500 focus:outline-none focus:ring-4 focus:ring-accent-100"
              />

              <fieldset className="mt-3">
                <legend className="label-caps">Constraints (optional)</legend>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {(['metric', 'imperial'] as const).map((u) => (
                    <Chip key={u} active={constraints.unitSystem === u} onClick={() => setConstraints((c) => ({ ...c, unitSystem: c.unitSystem === u ? undefined : u }))}>
                      {u === 'metric' ? 'Metric' : 'Imperial'}
                    </Chip>
                  ))}
                  <span className="mx-1 h-4 w-px bg-zinc-300" aria-hidden="true" />
                  {MATERIALS.map((m) => (
                    <Chip key={m} active={constraints.material === m} onClick={() => setConstraints((c) => ({ ...c, material: c.material === m ? undefined : m }))}>
                      {m}
                    </Chip>
                  ))}
                  <span className="mx-1 h-4 w-px bg-zinc-300" aria-hidden="true" />
                  {STANDARDS.map((s) => (
                    <Chip key={s} active={constraints.standard === s} onClick={() => setConstraints((c) => ({ ...c, standard: c.standard === s ? undefined : s }))}>
                      {s}
                    </Chip>
                  ))}
                  <label className="ml-1 flex items-center gap-1.5 text-xs text-zinc-600">
                    Max load
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={constraints.maxLoadN ?? ''}
                      onChange={(e) => setConstraints((c) => ({ ...c, maxLoadN: e.target.value ? Number(e.target.value) : undefined }))}
                      className="w-20 rounded-md border border-zinc-200 bg-white px-2 py-1 font-mono text-xs focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                      aria-label="Maximum load in newtons"
                    />
                    N
                  </label>
                </div>
              </fieldset>
            </div>

            <div
              className={`card flex flex-col p-4 ${dragOver ? 'border-accent-500 ring-2 ring-accent-200' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <p className="text-sm font-semibold text-zinc-900">CAD screenshot (optional)</p>
              {preview ? (
                <div className="relative mt-2 flex-1">
                  <img src={preview} alt="Uploaded CAD screenshot preview" className="h-40 w-full rounded-[10px] border border-zinc-200 bg-white object-contain" />
                  <button type="button" onClick={clearImage} className="btn-secondary absolute right-2 top-2 px-2 py-1 text-xs">
                    <X className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="mt-2 flex h-40 flex-1 flex-col items-center justify-center rounded-[10px] border-2 border-dashed border-accent-200 bg-accent-50/40 text-center text-sm text-zinc-600 transition-colors duration-150 grid-paper hover:border-accent-500 hover:text-accent-700"
                >
                  {imageBusy ? <Spinner className="h-6 w-6 text-accent-600" /> : <ImageUp className="h-7 w-7 text-accent-500" strokeWidth={1.6} aria-hidden="true" />}
                  <span className="mt-1 font-medium">Drop a screenshot or click to upload</span>
                  <span className="text-xs text-zinc-500">PNG, JPG or WebP · resized in your browser</span>
                </button>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                aria-label="Upload CAD screenshot"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleFile(f)
                }}
              />
              {imageError && (
                <p className="mt-2 text-xs text-red-700" role="alert">
                  {imageError}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
              <button type="submit" className="btn-primary px-6 py-2.5 text-base" disabled={busy || imageBusy}>
                {busy ? (
                  <>
                    <Spinner /> Working…
                  </>
                ) : (
                  'Find my parts'
                )}
              </button>
              {busy && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    abortRef.current?.abort()
                    setPhase('idle')
                  }}
                >
                  Cancel
                </button>
              )}
              <label className="flex items-center gap-2 text-xs text-zinc-600">
                Approving as
                <input value={approver} onChange={(e) => setApprover(e.target.value)} maxLength={80} className="w-40 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100" />
              </label>
              {demo && (
                <span className="rounded-full border border-cyan-400/60 bg-cyan-50 px-2.5 py-1 font-mono text-[11px] font-semibold text-cyan-700">
                  DEMO MODE: pick an example below, then press Find my parts
                </span>
              )}
            </div>
          </form>

          <div className="mt-6">
            <p className="label-caps">Try an example (includes a labelled drawing)</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {EXAMPLES.map((ex) => (
                <ExampleButton key={ex.id} ex={ex} active={exampleId === ex.id} disabled={busy} onClick={() => void loadExample(ex)} />
              ))}
            </div>
            <details className="group mt-3">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md font-mono text-xs font-medium text-zinc-600 hover:text-accent-700 [&::-webkit-details-marker]:hidden">
                <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-90" aria-hidden="true" />
                More examples
              </summary>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <ExampleButton ex={EDGE_EXAMPLE} active={exampleId === EDGE_EXAMPLE.id} disabled={busy} onClick={() => void loadExample(EDGE_EXAMPLE)} />
              </div>
            </details>
          </div>
        </div>
      </section>

      {/* Progress + results */}
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        {phase === 'idle' && (
          <div className="rounded-[14px] border border-dashed border-accent-200 bg-white/60 px-6 py-10 text-center text-sm text-zinc-600">
            Results appear here. The Part Finder searches the library; the Fit Checker then verifies every pick before you import it.
          </div>
        )}

        {phase === 'error' && error && (
          <Banner tone="danger" title={error.stage === 'verify' ? 'The Fit Checker could not finish' : 'The search could not finish'}>
            <p>{error.message}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {!demo && (
                <button type="button" className="btn-secondary" onClick={() => submit()}>
                  Retry
                </button>
              )}
              {exampleId && !demo && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setDemo(true)
                    void runDemo(exampleId)
                  }}
                >
                  Switch to Demo mode and replay this example
                </button>
              )}
            </div>
            {error.stage === 'verify' && <p className="mt-2 text-xs">The Part Finder's shortlist is shown below but has NOT been verified.</p>}
          </Banner>
        )}

        {showRun && (
          <>
            {runMode === 'demo' && <Banner tone="demo" title="DEMO — recorded replay. This is a pre-recorded agent run, not a live AI call." />}
            <AgentPipeline
              inputStatus="done"
              finderStatus={finderStatus}
              finderPaused={phase === 'question'}
              verifyStatus={verifyStatus}
              approvalStatus={approvalStatus}
              finderSteps={finderSteps}
              verifySteps={verifySteps}
              demo={runMode === 'demo'}
            />
          </>
        )}

        {phase === 'question' && finder?.clarifyingQuestion && (
          <div className="card border-cyan-400/60 p-5">
            <p className="label-caps text-accent-700">The Part Finder needs one detail</p>
            <p className="mt-1 text-base font-medium text-zinc-900">{finder.clarifyingQuestion}</p>
            <form onSubmit={answerQuestion} className="mt-3 flex flex-wrap gap-2">
              <label htmlFor="answer" className="sr-only">
                Your answer
              </label>
              <input
                id="answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                className="min-w-0 flex-1 rounded-[10px] border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-4 focus:ring-accent-100"
                placeholder="e.g. 8 mm"
              />
              <button type="submit" className="btn-primary" disabled={!answer.trim()}>
                Answer & search again
              </button>
            </form>
          </div>
        )}

        {finder && phase !== 'question' && (
          <section aria-label="Results" className="space-y-4">
            <div className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <p className="label-caps">What PartPilot understood</p>
                  <p className="mt-1 text-sm text-zinc-900">{finder.understanding}</p>
                  {finder.visionObservations && (
                    <p className="mt-2 text-sm text-zinc-600">
                      <span className="font-medium text-zinc-800">Screenshot: </span>
                      {finder.visionObservations}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5 text-xs text-zinc-600">
                  <div className="flex items-center justify-between gap-3">
                    Finder confidence <Meter value={finder.confidence} label="Part Finder confidence" />
                  </div>
                  {verify && (
                    <div className="flex items-center justify-between gap-3">
                      Fit Checker confidence <Meter value={verify.overallConfidence} label="Fit Checker confidence" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {verify?.humanReviewRequired && (
              <Banner tone="danger" title="Human review required before these parts are released">
                <ul className="list-disc space-y-0.5 pl-5">
                  {verify.reasonsForReview.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </Banner>
            )}
            {!verify && phase === 'done' && finder.needs.length > 0 && !finder.needs.some((n) => n.candidates.length) && (
              <Banner tone="warn" title="No matching parts found">
                The library has nothing that fits this description. The search has been logged for the weekly Library Gap Report. Try relaxing a constraint or adding a dimension.
              </Banner>
            )}
            {phase === 'done' && finder.needs.length === 0 && (
              <Banner tone="warn" title="No part needs identified">
                Try adding more detail — what the part mates with, sizes, threads or loads.
              </Banner>
            )}

            {finder.needs.length > 0 && verify && approvableNeeds.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-zinc-900">
                  Verified parts <span className="font-mono text-sm font-medium text-zinc-500">({finder.needs.length})</span>
                </h2>
                <button type="button" className="btn-primary" disabled={approving} onClick={() => void approve(approvableNeeds)}>
                  {approving ? <Spinner /> : null} Approve all & add to project
                </button>
              </div>
            )}

            <div className="grid gap-4 xl:grid-cols-2">
              {finder.needs.map((n) => (
                <NeedResult
                  key={n.need}
                  need={n}
                  verdict={verifyFor(verify, n.need)}
                  parts={parts}
                  verifying={phase === 'verifying'}
                  approved={approvedNeeds.has(n.need)}
                  busy={approving}
                  onApprove={() => void approve([n.need])}
                  onRequestReview={() => void requestReview(n.need)}
                />
              ))}
            </div>
          </section>
        )}

        {approval && <ApprovalPanel data={approval} />}
      </div>

      {toast && (
        <div
          role="status"
          className={`fixed bottom-4 right-4 z-50 flex max-w-sm animate-fade-in items-start gap-2 rounded-[12px] border bg-white/95 px-4 py-3 text-sm font-medium text-zinc-900 shadow-[var(--shadow-lift)] backdrop-blur ${
            toast.tone === 'ok' ? 'border-emerald-300' : 'border-red-300'
          }`}
        >
          {toast.tone === 'ok' ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> : <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />}
          {toast.text}
        </div>
      )}
    </div>
  )
}

function verifyFor(verify: VerifyResult | null, need: string) {
  return verify?.verdicts.find((v) => v.need === need)
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors duration-150 ${active ? 'border-accent-600 bg-accent-600 text-white' : 'border-zinc-200 bg-white text-zinc-700 hover:border-accent-300 hover:text-accent-800'}`}
    >
      {children}
    </button>
  )
}

function ApprovalPanel({ data }: { data: ApprovalResponse }) {
  return (
    <section className="card p-5" aria-label="Approval pipeline result">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-zinc-900">Approval pipeline {data.run.status === 'succeeded' ? 'completed' : 'failed'}</h2>
        <Link to="/bom" className="inline-flex items-center gap-1 text-sm font-medium text-accent-700 hover:underline">
          View project BOM ({data.bomLineCount} lines) <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <RunStepper steps={data.run.steps} />
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="label-caps">Import package</p>
          <ul className="mt-1.5 space-y-1">
            {data.package.files.map((f) => (
              <li key={f.url}>
                <a href={f.url} className="inline-flex items-center gap-1.5 font-mono text-sm text-accent-700 hover:underline" download={f.filename}>
                  <Download className="h-3.5 w-3.5" aria-hidden="true" /> {f.filename}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="label-caps">CAD downloads</p>
          <ul className="mt-1.5 space-y-1">
            {data.package.links.map((l) => (
              <li key={l.url} className="text-sm">
                <a href={l.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-mono text-accent-700 hover:underline">
                  {l.partNumber} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
                <span className="ml-2 font-mono text-xs text-zinc-500">{l.formats.join(' · ')}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

function ExampleButton({ ex, active, disabled, onClick }: { ex: ExamplePrompt; active: boolean; disabled: boolean; onClick: () => void }) {
  const edge = ex.kind === 'edge'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`card flex items-start gap-3 p-3 text-left disabled:cursor-not-allowed disabled:opacity-60 ${
        active ? 'border-accent-500 ring-4 ring-accent-100' : edge ? 'hover:border-red-300' : 'hover:border-accent-300'
      }`}
    >
      <img src={ex.image} alt="" className="h-16 w-20 shrink-0 rounded-md border border-zinc-200 bg-white object-cover" />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
          {edge && <FlaskConical className="h-3.5 w-3.5 shrink-0 text-red-600" aria-hidden="true" />}
          {ex.title}
        </span>
        <span className="mt-0.5 block font-mono text-[11px] leading-snug text-zinc-600">{ex.summary}</span>
      </span>
    </button>
  )
}
