# Feature: equipment maintenance

## Outcome and scope

Specification: `specs/014-equipment-maintenance/` (spec, plan, data model, research, pilot machines,
prototype screenshots). Decision: [ADR-0018](../../adr/0018-equipment-maintenance-module.md).
Product document: [13-equipment-maintenance.md](../../features/13-equipment-maintenance.md).

A register of machines with manufacturer manuals, versioned maintenance plans that create planned work
and 7/3/1-day Telegram reminders to the responsible mechanic, the mechanic's checklist in the bot with
review in the panel, a maintenance calendar with forecast, and emergency repairs from the operator's
report to an explicit return to service. Out of scope: spare-part stock, purchasing, meter-based
intervals, OEE.

## Current behavior and ownership

- Domain (`packages/domain/src/maintenance/`): codes, schedule rules (`nextCycle`, `forecastDueDates`,
  `isOverdue` — work in review is not late), reminder plan, work FSM (`transitionWork`), emergency
  priority and deadlines, bot callback codec, role lists `MAINTENANCE_VIEWERS/MANAGERS/RESPONDERS`.
- Database: migration `0054_maintenance` — equipment, documents and links, plans with immutable
  published versions (trigger), work orders (one per plan cycle, one open emergency per machine),
  operation results, waits, reviews, stop episodes (one open per machine). `positions.performs_maintenance`
  marks mechanics; the seed sets it for `MECHANIC`.
- API (`apps/api/src/maintenance/`): `EquipmentService`, `DocumentsService` (PDF ≤ 50 MiB, private
  storage, presigned links, Telegram file id cache), `PlansService`, `MaintenanceScheduler`,
  `WorkActionsService`, `WorkQueriesService`, `EmergencyService`, `MechanicWorkService`;
  routes under `/admin/maintenance`. `IncidentsService.report` opens the emergency repair in the
  report's transaction when the report names a machine (FR-061).
- Worker (`apps/worker/src/timers/maintenance.ts`): `MAINTENANCE_REMINDER`, `EMERGENCY_ACK`,
  `EMERGENCY_ESCALATION` re-read the work order and write the outbox on the task transaction.
- Bot: `apps/api/src/telegram/maintenance-bot.ts` (composer, owed inputs in Redis, zod-validated) and
  `maintenance-screens.ts` (pure screens). "🔧 Мои работы" is added to the home and shift screens of
  maintenance employees. No bot button releases a machine.
- Panel (FSD): `entities/maintenance` (API with zod parsing, query factories, pills),
  `features/equipment-register`, `equipment-card`, `maintenance-plan-editor`, `maintenance-calendar`,
  `maintenance-work`, `pages/maintenance`; route `/maintenance/{-$tab}/{-$id}`.

## Decisions and reuse

- D-1 calendar intervals only; D-2 new web role `CHIEF_MECHANIC`; D-3 mechanic submits, chief mechanic
  or admin accepts.
- The panel reuses DataTable (count, search, sort, mobile cards), DetailSheet, SelectField, DateField,
  MonthField, useConfirm and the query client; no new libraries. Photos of answers are shown through a
  work-order-scoped link endpoint instead of the generic media thumbnail (which needs a full media view).
- The plan editor pre-checks publication with the same rules the server applies because `ApiError`
  does not carry error details; the server remains the authority (`PLAN_INVALID`).
- Module and parameters: `MAINTENANCE` is a delivered tenant module (registry migration
  `0003_maintenance_module`; the env tenant and the pilot cutover include it). Off means the
  `/admin/maintenance` routes answer `MODULE_DISABLED`, the panel hides the section, the bot shows no
  "Мои работы" and asks no machine, and the worker completes maintenance timers without sending.
  Reminder days (three slots, 0 = off) and hour, the P0/P1/P2 acceptance budgets and the escalation gap
  are tenant settings (group "maintenance" in Control → Parameters); the API reads them through
  `MAINTENANCE_OPTIONS` at use time, the panel through `GET /admin/maintenance/policy`.
- The escalation instant shown on a repair is the stored acceptance deadline plus the current gap; a
  gap changed while a repair is unaccepted only moves the displayed time, the queued timer keeps its own.
- Plan versions (AC-015): open work keeps its snapshot; `GET work/:id/plan-diff` (pure
  `planVersionDiff`) and `POST work/:id/apply-plan-version` move only work not yet started. Changed
  materials reset readiness so the mechanic answers again.
- Plan copy (AC-018) creates a draft on another machine without first date, source document, source
  note and mechanic; publication then asks for them.
- Paper records (AC-039): `POST work/:id/record-completion` walks START/RESUME and SUBMIT through the
  domain FSM with `paperRecord` (required photos cannot exist), records the performer in
  `performed_by_employee_id` and the panel user in `entered_by`, keeps bot photos already stored, and
  goes to review like a bot submission.
- Materials used (FR-051): planned work whose version lists materials needs a confirmation before
  submission — "as in the plan" (every-cycle materials) or the mechanic's text — stored in `parts_used`.
- Notices (FR-043): the work card lists outbox rows whose dedupe key names the work, with delivery
  state; a failed delivery is called out. `last_error` is not shown.
- Missing materials in the bot: a checklist of the plan's materials whose selection travels in the
  button data as a base-36 bit mask (≤ 30 materials); more materials fall back to free text.
- FR-052: skipped fixed-calendar dates are recorded as a `MAINTENANCE_CYCLES_MISSED` event.
- FR-005: the chief mechanic corrects the state with a reason (`POST equipment/:id/state`); refused
  while a stop episode is open.
- FR-031: month and week views, unit, mechanic, machine and status filters. Filters persist in the
  panel's shared UI store (table-filter standard F4) rather than the URL; records still deep-link.
- Not done by design: the prototype's "Бот механика" demo tab is not part of the panel.
- Shared changes caused by this feature: `DetailSheet` `wide` now overrides the sheet's side-variant
  width (it never did); the role picker in "Пользователи и роли" stays a native select with nine roles;
  `MODULE_DISABLED` has a panel message.

## Verification

2026-09-24, branch `claude/busy-mayer-6jmcpk`, local PostgreSQL 16, Redis 7.

- Repo-wide `pnpm build`, `pnpm typecheck` and `pnpm lint` pass.
- Domain: `packages/domain` vitest — 248 passed (FSM with materials and paper records, plan diff).
- Contracts 24, registry 14, i18n parity 13 passed.
- API integration: `src/maintenance` 23 (tenant parameters, module off, apply version, copy, paper
  record, notices, missed dates, backup rule, state correction); bot flows 4 and screens 7; incidents,
  handover, access scope, QR departure, infra and config suites 80 passed.
- Worker: maintenance timers 7 (module off sends nothing) and timer tasks pass (28).
- Panel: full `apps/admin-web` suite 584 passed; control-web 66 passed.
- Live local QA as an administrator, desktop 1440×900 and mobile 390×844: newer plan version alert,
  diff dialog and applying version 2; paper record dialog with inline errors, then the work in review
  showing performer and "Вніс у панель"; failed notice on the work card; state correction and plan copy
  dialogs; calendar week view with filters. Fixed during QA: the week view opened on the month's first
  week, long titles in the week view were cut, and the diff was re-read (409) after applying.
- Not verified: the live Telegram bot against a real bot token (covered by bot harness tests), the
  Control → Parameters page with the new group in a browser, and the deployed environment.

## Remaining work

- None from spec 014 known. Watch the pilot for materials lists over 30 rows (bot falls back to text).
