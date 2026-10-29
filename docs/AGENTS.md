# PartPilot agents

Both agents use the shared loop in `netlify/functions/lib/agent.ts`:

1. Send system prompt + user content (+ screenshot as an image block) + tool definitions to `claude-sonnet-5-5`.
2. If the reply contains `tool_use` blocks, run every tool call from that turn (in parallel), record a trace step for each one (tool, arguments, result summary), and return all `tool_result`s in one user message. Text written before a tool call becomes a "reasoning" step.
3. Repeat. On iteration 5, or once 16 s have passed, the call uses `tool_choice: none` and tells the model to answer now.
4. Extract the JSON object from the final text and validate it with zod. If that fails, send the validation error back once and ask for corrected JSON. If it fails again, return a friendly error.
5. A terminal tool (`ask_user`) stops the loop immediately and returns the question to the UI.

Limits: 5 iterations, `max_tokens` 1500 per call, a 25 s per-call timeout, and 20 requests per IP per hour per endpoint (stored in Blobs).

Prompts live in `netlify/functions/lib/prompts.ts`.

## Agent 1 — Part Finder (`POST /api/find-parts`)

**Input:** `{ description, image?: { mediaType, data(base64) }, constraints?: { unitSystem, material, standard, maxLoadN } }`

**What it decides for itself:**
- What is being built. From the screenshot it reports what it sees (holes, shafts, threads, callouts) and how confident it is.
- Which kinds of parts are needed (often several).
- Which searches to run, and whether to relax or tighten filters when results are empty or too broad.
- Whether critical info is missing. If so, it calls `ask_user` instead of guessing.
- A numeric `requirement` per need, which the Fit Checker's rule engine consumes.

**Tools:**
| Tool | Purpose |
|---|---|
| `search_catalog(category, query, filters)` | Filters by thread, bore, OD, length range, material, standard (with ISO/DIN equivalents), unit system, min load, CAD format |
| `get_part(id)` | Full record |
| `list_categories()` | Category names and counts |
| `ask_user(question)` | Ends the run with a clarifying question |

**Output:** `{ understanding, visionObservations?, confidence, needs: [{ need, category, requirement, candidates: [{ partId, reason, matchScore }] }], clarifyingQuestion? }`. Server post-processing drops unknown part ids and logs the search to Blobs (`searchlog/…`).

## Agent 2 — Fit Checker (`POST /api/verify-fit`)

**Input:** the Part Finder shortlist plus the original description, screenshot, and constraints.

**What it decides for itself:** which candidates to check, how to refine each requirement, when to look for an alternate, and the verdict for each need.

**Tools:**
| Tool | Purpose |
|---|---|
| `get_part(id)` | Full record |
| `check_compatibility(partId, requirement)` | Deterministic rules from `lib/compat.ts`. Returns pass/warn/fail per rule with expected/actual numbers |
| `search_catalog(...)` | Find alternates |

**Rules in `check_compatibility`:** unit system (never mix), thread diameter and pitch, bore↔shaft (±0.05 pass, ±0.2 warn), OD↔housing, length window, thread engagement (≥1.5×d in steel, 2×d in soft materials), material match, soft-fastener conflicts and galvanic warnings, load rating with SF 1.5, CAD format (STEP by default), standard with ISO/DIN equivalents, motor frame / belt profile / gear module, and safety-critical or pressure-part flags.

**Verdicts:** `APPROVE`, `APPROVE_WITH_NOTES`, `SWAP` (replacement in `partId`, original in `originalPartId`), `ESCALATE_TO_HUMAN`.

**Deterministic guardrails** (in `verify-fit.mts`, after the LLM answers):
- The rule engine re-checks each chosen part, and its results become the `checks` shown in the UI.
- Any non-escalated verdict on a part that fails a rule becomes `ESCALATE_TO_HUMAN`.
- Needs marked `safetyCritical` are always escalated.
- Finder or Checker confidence below 0.70, any escalation, or any need without a verified part sets `humanReviewRequired: true`, and the reasons are listed.

**CAD rulebook** (in the Fit Checker prompt): preferred ISO coarse pitches, ISO/DIN equivalents, standard bearing series dimensions, the 1.5×d engagement rule, never mixing metric and imperial, fastener material rules, SF 1.5, STEP required, and always escalating safety-critical uses.

## Demo mode

`src/demo/traces.ts` holds recorded step traces and results for the three example prompts. The rule checks shown in demo results are computed in the browser by the same `checkCompatibility` code. Demo runs are labeled in the UI and are logged with `demo: true`, so the weekly report and trust panel still have data during a presentation.
