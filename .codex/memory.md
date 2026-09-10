# Handoff decisions

Append decisions and unresolved questions only, with date, commit, owner and links. Do not duplicate
`AGENTS.md`, store secrets or maintain a commentary log. Limit this active file to 120 lines / 12 KiB.
At the cap, archive the whole file unchanged under `docs/engineering/handoffs/`, start a new active
file linking the archive and current decisions, and preserve all historical entries. One integration
owner appends after merging work; parallel agents return proposed entries instead of editing this file.

## 2026-09-10 — Recon and setup

- Baseline `08979de`; setup owner: Architect/Planner. Scope is audit/configuration only.
- Preserve Nest modules, pure domain and vanilla kiosk; frontend FSD is incremental. RSC is not an
  instruction to replace the current Vite runtime.
- Product Lean advisor and delivery Lean/Process Expert are distinct roles. See
  `docs/engineering/agent-operating-model.md` and `docs/audits/2026-09-10/README.md`.
- Unresolved: GitHub required checks and Codex Automatic Reviews need an owner-applied settings change;
  hosted Cloud Docker availability needs verification before full integration tests can be promised.

## 2026-09-10 — Owner supersedes PR/worktree proposal

- Owner decision: work only in the current Vakhta checkout on `master`; no PRs, topic branches or new
  worktrees. Push verified task-owned commits directly, without force. Serialize writers/index use.
- Audit commit `37bc0c7` was copied into current master as `d219cdd`; its temporary audit worktree was
  removed after preserving the committed result. The audit's PR/protection/worktree proposals are historical.
- Preserve GitHub release → existing changelog bot → private "Вахта Dev" group. A published version's
  announcement does not prove all deployments completed. Do not send duplicate/manual announcements.
- Map and verify GitHub, Cloudflare, Railway and Namecheap access, logs and runtime ownership in
  `docs/runbooks/platform-operations.md`; report access gaps explicitly and use 1Password for secrets.

## 2026-09-10 — Critical reliability behavior

- Integration owner: Codex. Implemented #2/#3 atomic departure and request publication, #6/#7
  consistent historical reports, and #9 immutable monthly nominations (latest base `bcb61de`).
- Owner-approved #8: day 08:00–20:00/night 20:00–08:00, two-hour grace; QR time is actual, missing QR
  accounts to planned end while physical departure stays unknown. Preserve immutable event history.
  See `docs/engineering/features/estimated-shift-closure.md` and `critical-reliability.md`.
- #1 scope enforcement, #4 durable Telegram admission/processing and #5 durable required effects
  remain open. Pre-deadline durable admission must fence scanner closure when #4 is implemented.
- Keep the user Cloudflare token and dedicated Pages token; there were no duplicate 1Password items
  to remove. CI uses the dedicated Pages token. Do not revoke either token as cleanup.

## 2026-09-10 — Automatic closure and durable media

- Integration owner: Codex. Automatic closure #8 (`a9be981`) is deployed and verified, including
  audited unknown-departure reconciliation; see `estimated-shift-closure.md` for exact evidence.
- Foundation `f9a437c` deployed migration 0027; the production task table and guards were verified
  before media consumer integration `e17b431`. Media passed 483 tests and independent reviews;
  deployment verification is recorded separately in `media-processing.md`.
- Timer integration `4383be6` passed 508 package tests plus six release tests and independent review; deployment
  is the next gate. Media v0.70.10 deployment and organic task completion are verified in its feature
  memory. #5 remains open for bonus invalidation/consumption and monthly startup catch-up. Modern
  handover submission immediately escalates to the master; HANDOVER_TIMEOUT recovery is legacy only.
  Old schedule months must not generate new acknowledgement reminders. #1/#4 remain open.
- A duplicate GitHub dispatch exposed source-version fallback risk; it was canceled before Pages.
  Bind rerun version resolution to the requested source, not the current branch or latest release.
  Resolver `1681a76` passed deployed CI `34483329441`, retaining v0.70.10 without a new release.
