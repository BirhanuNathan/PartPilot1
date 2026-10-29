# PartPilot automations

These are fixed workflows, not agents. Each one is started by an event or a schedule, and each writes an **Automation Run** record (`runs/<timestamp>` in Blobs) with its trigger, every step (✓ done / ✕ failed), timestamps, and output. The records appear on the Admin page.

## Automation 1 — Approval pipeline

- **Trigger:** event. The engineer clicks "Approve & add to project" (one need) or "Approve all & add to project". The UI calls `POST /api/approve`.
- **Code:** `netlify/functions/approve.mts`, `lib/bom.ts`, `lib/notify.ts`, `lib/automation.ts`

| # | Step | Detail |
|---|---|---|
| 1 | Save to project BOM | Each part id is resolved against the catalog (client part data is never trusted) and appended to `bom/default` with timestamp, approver, need, verdict, notes, and a human-review flag. |
| 2 | Generate import package | Stored at `packages/<id>`: CAD download links plus two files that follow the naming convention `partpilot_<project-slug>_<YYYYMMDD-HHMM>_bom.csv` and `…_import-instructions.txt`. Download them from `/api/import-package?id=…&file=bom|instructions`. |
| 3 | Notify the team | `POST { text }` to `NOTIFY_WEBHOOK_URL` (Slack-compatible) when it is set. A copy always goes to the in-app Notifications panel, and if the webhook is missing or fails, the panel is the only destination. The message lists part numbers, verdicts, and human-review flags. |
| 4 | Audit log | `audit/<timestamp>` entry: `parts.approved`, actor, project, package id, items. |

If any step throws, the run is marked failed and the failing step is recorded.

## Automation 2 — Weekly Library Gap Report

- **Trigger:** schedule. `netlify/functions/weekly-report.mts` with `schedule: '@weekly'` runs Sundays at 00:00 UTC, on published production deploys only. For demos there is also a manual trigger: the "Run weekly report now" button on the Admin page calls `POST /api/run-weekly-report`.
- **Code:** `netlify/functions/lib/weekly-report.ts`

| # | Step | Detail |
|---|---|---|
| 1 | Pull search log | All `searchlog/*` entries from the last 7 days. Live searches are written by the agents, and demo replays are written with `demo: true`. |
| 2 | Extract gaps | A need counts as a gap when it had no candidates, the Fit Checker verdict was `SWAP` or `ESCALATE_TO_HUMAN`, the agent asked a clarifying question, or the run errored. |
| 3 | Cluster & rank | Deterministic grouping by `category + key dimensions` (thread, shaft/housing diameters, length window, load rounded to 500 N, material, unit system, frame/profile/module), sorted by frequency. No LLM. |
| 4 | Digest | One `claude-sonnet-5-5` call (800 max tokens) writes a short plain-language summary for the catalog owner. If there are no gaps, or the AI is unavailable, a deterministic template is used, so the workflow always completes. |
| 5 | Save | `reports/<id>` and `reports-latest` in Blobs. |
| 6 | Notify catalog owner | Through the webhook or the in-app panel, as in automation 1. |

## Related endpoints

- `GET /api/admin`: runs, latest report, AI trust counts, notifications, audit
- `GET /api/bom` (`?format=csv`): project BOM
- `POST /api/request-review`: "Request human review" button (notification + audit)
- `POST /api/log-search`: records Demo-mode replays in the search log
