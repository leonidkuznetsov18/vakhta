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
- Deviations from the spec, recorded for the owner: the tenant module switch (FR-001) is replaced by
  role-gated visibility; reminder time, offsets and acknowledgement budgets use the pilot defaults in
  code instead of tenant settings; "apply the new plan version to open work" (AC-015) and recording
  work on behalf of a mechanic from the panel (AC-039) are not implemented; the prototype's
  "Бот механика" demo tab is not part of the panel.
- Shared changes caused by this feature: `DetailSheet` `wide` now overrides the sheet's side-variant
  width (it never did); the role picker in "Пользователи и роли" stays a native select with nine roles.

## Verification

2026-09-24, branch `claude/busy-mayer-6jmcpk`, local PostgreSQL 16, Redis 7 and an S3 emulator.

- Domain: `packages/domain` vitest — 243 passed.
- API integration: `apps/api` `src/maintenance` (13), incidents with machine reports (14), bot flows
  `maintenance-bot.test.ts` (3) and screens (5); `src/incidents src/handover src/common/access-scope
src/telegram/qr-departure` pass.
- Worker: `maintenance-timers.test.ts` (6), `timer-tasks` and `background-tasks` pass.
- Panel: full `apps/admin-web` vitest suite passes after the role-picker fix; model tests for the
  calendar grid, plan draft and work view.
- Live local QA as an administrator (desktop 1440×900 and mobile 390×844): register, card with
  plans and documents (6.5 MB PDF uploaded to storage), plan editor, calendar, work queue, review and
  emergency sheets. Flows exercised in the browser: accepting a maintenance in review created the next
  cycle (22.09 → 29.09); creating a machine through the form showed inline required-field errors, then
  saved; returning a repaired machine to service set it to "AVAILABLE" and closed the stop episode.
- Not verified: the live Telegram bot against a real bot token (covered by bot harness tests) and the
  deployed environment.

## Remaining work

- Tenant settings for reminder time/offsets and acknowledgement budgets; the module switch.
- AC-015 (move open work to a new plan version) and AC-039 (record work on behalf of a mechanic).
- Checklist rows of materials in the bot's "missing" answer (today a free-text note).
