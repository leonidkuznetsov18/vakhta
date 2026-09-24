# Handoff decisions

Append decisions and unresolved questions only, with date, commit, owner and links. Do not duplicate
`AGENTS.md`, store secrets or maintain a commentary log. Limit this active file to 120 lines / 12 KiB.
At the cap, archive the whole file unchanged under `docs/engineering/handoffs/`, start a new active
file linking the archive and current decisions, and preserve all historical entries. One integration
owner appends after merging work; parallel agents return proposed entries instead of editing this file.

## 2026-09-10 — Owner requires minimal verification overhead

- Owner: project owner; integration owner: Codex. Remove redundant checks and retain only the
  risk-based mandatory checks in `docs/engineering/testing-baseline.md`. This supersedes blanket
  full local build/check, repeated independent reviews and panel/kiosk/bot QA for every edit.
- Simple edits: diff and relevant format/visual check. Behavior: focused regressions. Money, access,
  time, transactions, migrations and recovery: relevant invariant tests and one independent review.
- Reuse valid results; existing CI supplies the full integration gate. No repeated reading/testing
  of unchanged code, speculative audits or intermediate documentation pushes. Batch coherent delivery.

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

## 2026-09-13 — Product positioning

- Owner decision: Vakhta is positioned as a Connected Worker / Frontline Operations platform. The
  canonical vocabulary, roles, KPIs and domain background live in `docs/product-vision.md`; README,
  `AGENTS.md`, `CLAUDE.md` and the GitHub repository description follow it. Use its terms in new work.

## 2026-09-17 — Skills match engineering responsibilities

- Owner decision; integration owner: Codex; baseline `be668b6`. Use distinct frontend, backend,
  UI/UX, architecture and QA skills from `docs/engineering/skills.md`. Nine upstream skills are
  project-local and pinned in `.agents/skills/upstream-lock.json`; existing global specialists remain.
- Lean expertise is only for an owner-requested process assessment. No routine feature/design/QA
  gate or automatic cadence; this supersedes earlier broad Lean instructions and templates.
- Exact decisions, checks and remaining evidence: `docs/engineering/features/development-workflow.md`.

## 2026-09-21 — Multi-tenant platform direction

- Owner decision; writer: Claude; baseline `0566952`. Vakhta becomes a platform: database per
  tenant on a shared cluster, shared API/worker with a fail-closed tenant context, one bot per
  tenant, tenant hostnames, a separate control service and control panel for operators, modules
  `ADMIN_PANEL`/`WORKER_BOT`/`QR_KIOSK` as registry switches. `TENANCY_MODE=env` keeps the pilot
  and CI unchanged until cutover. See `specs/011-multi-tenant-control-plane/` and ADR-0015 (proposed).
- Unresolved (owner): hostname scheme, separate control service, one Postgres cluster, pilot slug,
  control panel languages. Implementation starts with delivery 1 after confirmation.

## 2026-09-24 — Unit shift templates

- Owner decisions; writer: Claude; baseline `0f868f54`.
  - Only ADMIN creates, edits and deletes the shifts of a unit (Directories → unit Sheet).
  - A borrowed worker is offered the schedule unit's shifts. The Day/Night defaults stay for every
    unit. There is no inheritance. Full day is its own type (fuchsia).
  - As in When I Work, an edit changes new assignments only: used templates are versioned
    (ADR-0017).
- See `specs/013-unit-shift-templates/` and `docs/engineering/features/unit-shift-templates.md`.

## 2026-09-24 — Equipment maintenance module (draft spec)

- Owner request; writer: Claude; baseline `b4453be`. New tenant module `MAINTENANCE`: machine register,
  PDF manuals, versioned calendar plans, work orders, calendar, 7/3/1-day Telegram reminders to the
  responsible mechanic, emergency repair beside incidents. This is the separate decision that brings
  "equipment" into scope. See `specs/014-equipment-maintenance/` and ADR-0018 (proposed).
- Unresolved (owner): D-1 meter hours now or later, D-2 `CHIEF_MECHANIC` role, D-3 who accepts
  planned maintenance. Pilot machines: NEWTOP FB100S, FB158S, 118DT (`pilot-equipment.md`).

## 2026-09-24 — Equipment maintenance implemented

- Owner asked to implement spec 014 as prototyped; ADR-0018 accepted. Domain, migration 0054, API,
  worker timers, mechanic bot and panel section "Обслуживание" delivered on
  `claude/busy-mayer-6jmcpk`. D-1 calendar intervals only, D-2 `CHIEF_MECHANIC`, D-3 chief
  mechanic or admin accepts. Deviations and verification: `docs/engineering/features/equipment-maintenance.md`.
- Follow-up the same day closed the reported gaps: tenant module `MAINTENANCE` (registry migration
  0003), maintenance tenant parameters, applying a newer plan version (AC-015), plan copy (AC-018),
  paper records (AC-039), notice delivery on work (FR-043), confirmed materials (FR-051), missed
  fixed-calendar dates (FR-052), state correction (FR-005), week view and calendar filters (FR-031).
