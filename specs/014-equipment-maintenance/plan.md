# Implementation Plan: Equipment maintenance

**Change**: 014-equipment-maintenance | **Date**: 2026-09-24 | **Spec**: [spec.md](spec.md)
**Baseline**: b4453be | **Checkout**: master | **Engineering memory**: new
`docs/engineering/features/equipment-maintenance.md` (created with delivery 1)
**Supporting**: [data-model.md](data-model.md), [research.md](research.md),
[ADR-0018](../../docs/adr/0018-equipment-maintenance-module.md) (proposed)

## Summary

Add a `MAINTENANCE` tenant module with a machine register, attached PDF manuals, versioned
calendar maintenance plans, work orders generated one cycle at a time, a panel calendar, durable
Telegram reminders (7/3/1 days), mechanic execution in the bot with chief-mechanic acceptance, and
an emergency repair that extends the existing incident flow with a machine link, a mechanic work
order, an acknowledgement deadline and a machine stop episode ended only by release.

Everything reuses existing mechanisms: `web_user_roles` scope checks, `notification_outbox`,
durable `background_tasks`, object storage with presigned GET, `EventStore`/`AuditLog`, the stateless
bot screen model and the shared panel calendar. Nothing new is added to infrastructure.

## Technical Context

- **Domain** (`packages/domain`): new pure folder `maintenance/` — codes, plan due-date rules,
  reminder schedule, work transition table, emergency priority/deadlines, calendar forecast.
  Existing `access/roles.ts` gains `CHIEF_MECHANIC`; `tenant/tenant.ts` gains `MAINTENANCE`;
  `notifications/payload.ts` gains templates and `TIMER_JOBS`.
- **Database** (`packages/db`): schema file `schema/maintenance.ts`, changes to `org.ts`
  (positions flag), `incidents.ts` (equipment links), `auth.ts` (enum), `background-tasks.ts`
  (kinds). Migrations `0054`+ via drizzle-kit, including the `background_tasks_kind_valid` CHECK
  recreation (pattern from `0049`) and immutability trigger for published plan versions.
- **Contracts** (`packages/contracts`): `maintenance.ts` zod schemas for commands and views;
  `timer-tasks.ts` union extended; `tenant-settings.ts` new keys.
- **API** (`apps/api/src/maintenance/`, new Nest module): `equipment`, `documents`, `plans`,
  `work-orders`, `emergency` services and controllers, guarded by `WebAuthGuard`, `@Roles` and
  `scopeCondition`/`assertInScope`. The document upload route raises the multipart limit for that
  route only (default 10 MiB elsewhere stays) and reuses the PDF validation of
  `communications/media.service.ts`. `incidents.service.ts` calls the emergency service inside its
  existing report transaction.
- **Bot** (`apps/api/src/telegram/`): a separate `maintenance` composer and screen functions (do not
  grow `bot.factory.ts` beyond registration). Callback prefix `mw:` (≤64 bytes, uuid + version).
  "🔧 Мої роботи" appears only for employees in a maintenance position when the module is on.
- **Worker** (`apps/worker/src/timers/`): `maintenance-reminders.ts` and `emergency-ack.ts`,
  dispatched from `tasks.ts`; each re-reads committed state first (pattern of
  `events.ts` birthday greeting and `reminders.ts` shift reminders).
- **Panel** (`apps/admin-web/src`, FSD):
  - `entities/equipment` — types, query keys, `EquipmentStateBadge`.
  - `features/equipment-register` — list, form, archive, mechanic picker.
  - `features/equipment-documents` — upload, link, open.
  - `features/maintenance-plan-editor` — plan form, publish/pause/copy, version diff.
  - `features/maintenance-calendar` — calendar view model on `shared/ui/resource-calendar`, agenda.
  - `features/work-order-review` — work card, accept/return, replan, record on behalf, release.
  - `pages/maintenance` — section page with tabs Equipment / Calendar / Work, route
    `/maintenance/{-$tab}/{-$id}`, `SECTIONS` entry and `useNavigation().go` mapping.
- **i18n**: `packages/i18n/src/{uk,en,ru}.ts` — panel section, forms, tooltips, bot screens.

## Constitution Check

- Correctness first: invariants in SQL (unique cycle, one open emergency repair and one open stop
  per machine, reason checks, immutable versions); domain transitions pure and tested (C2).
- Append-only history: audit and domain events only appended (C6); no shift FSM or activity interval
  writes (C3); no close button for workers; mechanics get no release button in the bot (release is
  a panel action by an authorised person).
- Access: every endpoint scoped; bot callbacks re-resolve employee and rights (ADR-0009, ADR-0011).
- React policy: no application `useEffect/useMemo/useRef/useCallback`; TanStack Query for server
  state; view models in `model/`; shared loaders, TableCount/Paginator, Alert, tooltips.
- C7: no presigned URL, token or file content in logs or Telegram text.
- Single writer on master, one coherent push per delivery, risk-based checks.

No exemptions required.

## DESIGN: Ownership and Behavior

### Domain rules (pure)

- `nextDueOn(plan, anchor)`: `FROM_COMPLETION` → performed business date + interval; `FIXED_CALENDAR`
  → first grid date strictly after the current due date; months clamp to month end; returns the list
  of missed grid dates for history.
- `reminderSchedule(plannedOn, offsets, localTime, tz, now)`: instants for future offsets; returns
  `sendNowNotice` when any offset is already past (FR-041).
- `workTransition(snapshot, action, ctx)`: table of `{action, from[], to, guard}` for
  `START, WAIT, RESUME, SUBMIT, ACCEPT_REVIEW, RETURN, CANCEL, ACCEPT_ASSIGNMENT, DECLINE`; guards return
  error codes (missing answers, required op not done, stale version, wrong actor).
- `emergencyPriority(reasonSeverity, stoppedWork)` and `ackDeadlines(receivedAt, priority, policy)`.
- `calendarForecast(plan, fromOn, toOn)`: projected dates after the open work item.

### Transactions

- **Publish plan**: lock plan → validate → set version published → create work order for
  `first_due_on` with `cycle_key = due_on` (`ON CONFLICT` returns the existing one) → schedule reminder
  tasks and optional immediate notice via outbox → audit + event. One transaction.
- **Accept review**: lock work order (version check) → review row → `COMPLETED` → compute next due →
  insert next work order (unique cycle) → schedule its reminders → events.
- **Emergency report**: inside the existing incident report transaction, when `equipment_id` is set and
  the report stops work or is critical/safety: upsert open emergency work order (partial unique),
  upsert open stop episode (partial unique), set machine `STOPPED`, schedule `EMERGENCY_ACK_DEADLINE`
  and `EMERGENCY_ESCALATION`, outbox rows for mechanic and unit master. Concurrent reports race on the
  partial unique indexes; the loser re-reads and attaches.
- **Release**: lock machine and open episode → verify the emergency work order is completed (or
  record the override reason for an explicit release without it) → close episode → machine state →
  notify reporter → prefill incident diagnosis fields (the master still resolves as today).

### Async recovery

The database is the source of truth; timers and outbox are written in the same transaction.
Reminder and escalation tasks are idempotent by key and re-read state, so a lost or repeated task
cannot send a stale or duplicate message. Replanning creates new keys (planned date is part of the
key) and old tasks become no-ops. Relay failures surface on the work order from outbox status.

### Panel state

Server state through TanStack Query keys per slice; filters in the URL (router search params);
drafts of the plan form in the form library state; no Zustand store unless the calendar selection
needs cross-component client state, which the existing schedule store pattern shows how to scope.

### Compatibility and migration

Additive migration; new enum value appended to `web_role`; nullable columns on incident tables;
module off by default, so existing tenants are unaffected until enabled from the control panel.
Rollback: disable the module; data remains.

## Project Structure and Allowed Files

Writer and index owner: one agent per delivery on master.

- `packages/domain/src/maintenance/**`, `packages/domain/src/{access/roles.ts,tenant/tenant.ts,notifications/payload.ts}`
- `packages/db/src/schema/{maintenance.ts,org.ts,incidents.ts,auth.ts,background-tasks.ts,index.ts}`, `packages/db/drizzle/0054_*.sql`+, `packages/db/src/seed-defaults.ts`
- `packages/contracts/src/{maintenance.ts,timer-tasks.ts,tenant-settings.ts,index.ts}`
- `apps/api/src/maintenance/**`, `apps/api/src/incidents/*` (emergency hook), `apps/api/src/telegram/{maintenance*.ts,screens.ts,bot.factory.ts}`, `apps/api/src/app.module.ts`, `apps/api/src/main.ts` (route limit only if required)
- `apps/worker/src/timers/{maintenance-reminders.ts,emergency-ack.ts,tasks.ts}`
- `apps/admin-web/src/{entities/equipment,features/equipment-*,features/maintenance-*,features/work-order-review,pages/maintenance}/**`, `app/router/*`, `app/ui/panel-shell.tsx`
- `packages/i18n/src/{uk,en,ru}.ts`
- Docs: `docs/features/equipment-maintenance.md`, `docs/engineering/features/equipment-maintenance.md`,
  `docs/adr/0018-equipment-maintenance-module.md`, `docs/product-vision.md` (scope row), this folder.

## Applicable Skills

Architecture: `architecture-decision-records` (ADR-0018). Backend: `nestjs-best-practices`,
`supabase-postgres-best-practices` (constraints, indexes). Frontend: `vercel-react-best-practices`,
`vercel-composition-patterns`, `frontend-design` (calendar and card). QA: `javascript-testing-patterns`,
`webapp-testing`. Lean review is not requested.

## IMPLEMENT: Ordered Delivery

`tasks.md` is generated with `$speckit-tasks` after the owner answers D-1–D-3.

1. **Delivery 1 — register and manuals (US1, US2).** Module switch, role, position flag; equipment and
   document tables; API with scope checks; panel Equipment tab and card with Documents; bot
   "Інструкція" send. Enter the three pilot machines.
2. **Delivery 2 — planned maintenance (US3–US6).** Domain rules and tests first; plan/version tables;
   work orders; publish/accept transactions; reminder timers; calendar; bot "Мої роботи" execution;
   panel review, replan and record on behalf.
3. **Delivery 3 — emergency repair (US7).** Incident links, stop episodes, emergency transaction,
   acknowledgement/escalation timers, bot accept/decline/steps, panel creation and release.

Each delivery is one coherent push with its docs and memory update.

## VERIFY and HARDEN

| Acceptance            | Check                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| AC-001–AC-006         | API integration: create/duplicate/eligibility/scope leak/archive/reassign                                              |
| AC-007–AC-011         | Upload validation and rollback; link reuse; archive on unlink; bot send via fake Telegram                              |
| AC-012–AC-018, AC-036 | Domain property tests for `nextDueOn`; integration: concurrent publish/accept keeps one cycle                          |
| AC-019–AC-025         | Calendar view-model tests; desktop/mobile screenshots                                                                  |
| AC-026–AC-032         | Domain tests for `reminderSchedule` (DST, past offsets); worker tests for re-read no-ops, dedupe, absence and backup   |
| AC-033–AC-040         | Domain transition table tests; bot harness for callbacks, stale versions, no release button                            |
| AC-041–AC-050         | Integration: concurrent reports → one repair and one episode; ack/escalation timers; release; incident tests unchanged |

Commands: `pnpm --filter @vakhta/domain test`, `pnpm --filter api test` (real PostgreSQL via
testcontainers), `pnpm --filter worker test`, `pnpm --filter admin-web test`, `pnpm typecheck`,
`pnpm lint` (clean-code rules, no growth of `eslint-suppressions.json`). CI is the full gate.
One independent review of migrations, access checks and the emergency transaction. Live QA per
`docs/runbooks/product-qa.md` for the reminder and emergency bot journeys.

## REPORT and Documentation

Per delivery: update `docs/features/equipment-maintenance.md` (current behavior), the engineering
memory (decisions, evidence, limits), `docs/product-vision.md` capability row, and accept or revise
ADR-0018. Deployed verification is reported separately from local checks.

## Open Decisions

- **D-1, D-2, D-3**: see [spec.md](spec.md#open-decisions). Delivery 1 depends only on D-2;
  delivery 2 on D-1 and D-3.
- **Pilot data**: nameplate data (serial, year), the manuals actually supplied with the three
  NEWTOP machines, the lubricants in use and the responsible mechanics. See
  [pilot-equipment.md](pilot-equipment.md).
