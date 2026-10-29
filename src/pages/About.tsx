import { Link } from 'react-router-dom'

const AGENTS = [
  {
    name: 'Part Finder agent',
    endpoint: '/api/find-parts',
    body: 'Reads your description and screenshot (vision), works out which kinds of parts you need, then decides for itself which catalog searches to run. It loosens or tightens filters when results are empty or too broad, and asks you one clarifying question instead of guessing when something critical, such as a shaft diameter, is missing. It returns a ranked shortlist with match scores and reasons.',
    tools: ['search_catalog', 'get_part', 'list_categories', 'ask_user'],
  },
  {
    name: 'Fit Checker agent',
    endpoint: '/api/verify-fit',
    body: 'Acts as a skeptical senior engineer. It runs each pick through a deterministic rule engine (thread and pitch, bore/shaft fit, thread engagement, material conflicts, load rating with a 1.5 safety factor, CAD format, ISO/DIN equivalence), searches for an alternate when a part fails, and gives one verdict per need: Approve, Approve with notes, Swap, or Escalate to a human.',
    tools: ['get_part', 'check_compatibility', 'search_catalog'],
  },
]

const AUTOMATIONS = [
  {
    name: 'Approval pipeline',
    trigger: 'Event: you click “Approve & add to project”',
    steps: ['Save the approved parts to the project BOM (timestamp, approver, verdict)', 'Generate the import package: CAD links, bom.csv and import-instructions.txt', 'Notify the team (Slack-compatible webhook, or the in-app panel)', 'Write an audit log entry'],
  },
  {
    name: 'Weekly Library Gap Report',
    trigger: 'Schedule: every Sunday 00:00 UTC (plus a “Run now” button)',
    steps: ['Pull the past week of searches', 'Pick out searches with no good match (no candidates, Swap, or Escalate)', 'Group and rank them by category and key dimensions (no AI)', 'Write a plain-language digest (one AI call)', 'Save the report and send it to the catalog owner'],
  },
]

export function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-10 sm:px-6">
      <header>
        <p className="label-caps text-accent-700">How it works</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">From minutes of browsing to seconds</h1>
        <p className="mt-3 text-zinc-700">
          Mechanical design engineers lose a lot of time scrolling a large online parts library for the right fastener, bearing, bracket or gear to drop into an assembly. With PartPilot you describe what you are building, optionally attach a CAD screenshot, and two AI agents find, verify and hand back the exact parts to import.
        </p>
      </header>

      <section aria-labelledby="agents-h">
        <h2 id="agents-h" className="text-xl font-semibold">
          The two agents
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          These are real tool-using agents rather than chatbots. The model chooses which tool to call, PartPilot runs it, feeds the result back, and the loop repeats until the model gives a final answer. Each agent is capped at 5 tool rounds so a run stays under about 25 seconds. You can watch every step on the Find Parts page.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {AGENTS.map((a) => (
            <article key={a.name} className="card p-5">
              <h3 className="font-semibold">{a.name}</h3>
              <p className="font-mono text-xs text-zinc-500">{a.endpoint}</p>
              <p className="mt-2 text-sm text-zinc-700">{a.body}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {a.tools.map((t) => (
                  <span key={t} className="chip">
                    {t}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
        <p className="mt-3 text-sm text-zinc-600">
          On top of the agents, fixed guardrails re-run the rule engine on every final pick. Any part that fails a rule is downgraded to <em>Escalate</em>, and any confidence below 0.70 or any safety-critical use turns on the human-review banner.
        </p>
      </section>

      <section aria-labelledby="auto-h">
        <h2 id="auto-h" className="text-xl font-semibold">
          The two automations
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {AUTOMATIONS.map((a) => (
            <article key={a.name} className="card p-5">
              <h3 className="font-semibold">{a.name}</h3>
              <p className="text-xs text-zinc-500">{a.trigger}</p>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-zinc-700">
                {a.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </article>
          ))}
        </div>
        <p className="mt-3 text-sm text-zinc-600">
          Every run, with its trigger and timestamped steps, appears on the{' '}
          <Link to="/admin" className="font-medium text-accent-700 hover:underline">
            Admin page
          </Link>
          .
        </p>
      </section>

      <section aria-labelledby="trust-h" className="card border-l-4 border-l-accent-600 p-6">
        <h2 id="trust-h" className="text-xl font-semibold">
          How much to trust PartPilot
        </h2>
        <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">Points of failure</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-800">
          <li>Misreading a screenshot, especially dimensions or scale.</li>
          <li>An incomplete or out-of-date catalog.</li>
          <li>Wrong unit assumptions.</li>
          <li>The LLM approving a part that fails a rule the rulebook does not cover.</li>
          <li>The agent confidently choosing among near-identical parts.</li>
        </ul>
        <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-zinc-500">Trust level</h3>
        <p className="mt-2 text-sm text-zinc-800">
          Reliable for routine, non-critical parts (standard fasteners, spacers, common bearings) as a first-pass shortlist that an engineer approves with one click. Not trustworthy to operate unreviewed for safety-critical, load-bearing, regulated, or high-cost parts; those are always escalated to a human.
        </p>
        <p className="mt-4 text-base font-semibold text-zinc-900">The system recommends and verifies; the engineer decides.</p>
      </section>

      <section aria-labelledby="limits-h">
        <h2 id="limits-h" className="text-xl font-semibold">
          Known limitations
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
          <li>The catalog here is a seed of about 130 parts standing in for the company library. The data layer can be swapped for the real library's API.</li>
          <li>Screenshots are downscaled in the browser, so very small callouts may not be readable. Typing key dimensions in the description helps.</li>
          <li>The rule engine covers the common failure modes listed above, not full tolerance stack-ups, fatigue, or thermal effects.</li>
          <li>Load ratings are catalog values; structural joints still need a proper calculation.</li>
          <li>Demo mode replays recorded runs for the three examples only and makes no AI calls.</li>
          <li>There are no user accounts. The approver name is typed in, and each visitor gets 20 agent requests per hour.</li>
        </ul>
      </section>
    </div>
  )
}
