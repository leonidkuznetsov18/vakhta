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
- Shared changes caused by this feature: `DetailSheet` takes `size` (`default`, `medium` = prototype
  `max-w-2xl`, `wide` = `max-w-3xl`) instead of the `wide` flag, and a `meta` slot for status pills
  under the description; DataTable cards skip the empty field list when every other column is
  `hideOnCards`; the role picker in "Пользователи и роли" stays a native select with nine roles;
  `MODULE_DISABLED` has a panel message.

### Prototype parity (2026-09-24)

Actual screens were compared with `specs/014-equipment-maintenance/prototype/01–08` at 1440×900 and
390×844 and aligned:

- Header title "Обслуговування обладнання"; machines read as `code model` (`machineLabel`, model else
  name) in the register, queue, banner, sheets, calendar overdue line and bot notices.
- Register: "Поточна робота" column, one-line location and machine, compact phone cards (title and
  state, place, next maintenance with readiness, "Механік: …", emergency). Column minimums were set so
  all seven columns fit a 1440 screen; only the long mechanic header wraps.
- Card and work sheets: pills in the header, next date as `dd.mm` (year shown only beyond the current
  year), full-word intervals by plural rules ("кожні 3 дні", "кожен тиждень"), secondary actions
  (state correction, archive, cancel work) in a "⋯" menu, review buttons in the footer, "Використано"
  after submission, next date after acceptance by the anchor mode.
- Emergency sheet: "P1" code in the title, Відповідальний / Резерв / Інцидент, report line with
  reporter, time and "робота зупинена", notices merged into "Хід" by time (`repairTimeline`).
- Calendar: view switch in the section header, filters in one row (two per row on phones), legend only
  for marks on screen, `dd.mm` agenda dates.
- Bot: model in the machine line and the operator's machine buttons, zone named in "На якому
  обладнанні?", "ТО через 7 днів" by plural rules, "P1" in the emergency heading.

Deliberate differences, kept because project standards or the spec require them: the "Як це працює"
card, labelled filters and the table's own search (table-filter standard F1), row chevrons, sort
buttons and "Показано 1–N з N" counts, the StateFilter segmented control, footer actions on the machine
card (release, emergency, edit — the prototype shows none), editing controls in the plan editor, the
panel's work card in the bot (status, full operation list) instead of a one-step view, the bot's explicit
"📨 Надіслати майстру" / "✍️ Інше — написати" instead of "Готово", and no "📍 Прибув" repair step (not
in the spec). Overdue work reads "Прострочено" without a day count, and the bot's planned date stays
`DD.MM.YYYY` without a weekday.

### Owner review in production (2026-09-24/25)

The live test on the pilot tenant (module switched on in Control; three NEWTOP machines of "Цех
Стаканов" with four plans each; responsible mechanic chosen by the owner) led to these changes:

- Documents may be links: `equipment_documents` keeps `storage_key`, `content_type`, `size_bytes` and
  `sha256` nullable (migration `0055_document_links`, check `equipment_documents_file_or_link`);
  `POST equipment/:id/documents/link` records one; `EquipmentDocumentView.hasFile` tells the panel to
  open `sourceUrl` in a new tab; `DocumentsService.manualFor` answers `ManualKind.LINK` and the bot
  sends the address as text (only presigned links stay out of Telegram, C7). The owner refused a cut
  PDF and a 48 MB catalogue is above the browser tool's limit, so the catalogue is referenced by link.
- Reminder days per plan: `maintenance_plans.reminder_days` (null = tenant parameters, at most five,
  1–90 days) in `PlanContent.reminderDays`; `loadWorkNotice` carries them and the scheduler prefers
  them over `MAINTENANCE_OPTIONS`. The editor's block 5 takes "7, 3, 1" as text; the preview and the
  summary use the plan's own days when they are valid.
- `EquipmentDetail.materials` (`PlansService.materialsForEquipment`) feeds the card's "Материалы" tab:
  every item of the published plans with kind, quantity, need and the plan's next date.
- Sheet footers use `components/app/sheet-actions.tsx`: every action stays visible as an `IconButton`
  with a tooltip (`card.actionHints`, `workCard.actionHints`), label shown on wide screens, icon only on
  phones; the "⋯" menus are gone from the card and the work sheet.
- `DataTable` draws the row chevron only for rows that expand under themselves; rows that open a panel
  keep a screen-reader-only "Подробности" button for the keyboard (owner rule).
- `focusFirstField` skips `[role="tab"]`: the sheet's auto-focus used to land on the first tab trigger
  and Radix activated it, so every card opened on "Паспорт" instead of its default tab.
- The plan editor replaces the machine card instead of stacking a second sheet on it (the double
  overlay read as a flicker); closing the editor mounts the card again from the query cache.
- Material rows of the plan editor are cards: the name is a wrapping textarea on its own line, the
  codes and numbers sit under it with visible labels.
- Found but not fixed here: no panel UI marks a position as `performs_maintenance` (spec A-1); the
  pilot has no `MECHANIC` position and its adjusters are `MACHINE_ADJUSTER*`, so the flag was set by
  SQL for `WORKSHOP_HEAD` to let the owner's mechanic be chosen. Tracked as a separate task.

### End-to-end run after the review (2026-09-25)

A local stack with a Telegram Bot API double (`TELEGRAM_API_ROOT`, webhook driven by a script) walked
the whole journey: activation code in the bot, "Всё есть" / "Чего-то не хватает" on a planned work,
start, operations with a required photo (stored in MinIO), materials "Как в плане", review in the
panel (accept, return for rework and resubmit), an operator's breakdown report with the machine
picked from the zone, the emergency notice to the mechanic with the master's copy, escalation to the
master after the acknowledgement budget, "Не могу" handing the repair to the backup, pause and
resume, completion, release from the panel and the reporter's notice, and the manual link sent as
text. Two defects came out of it and are fixed here:

- `nextCycle` for `FROM_COMPLETION` counted only from the performed date, so a work done early enough
  landed the next cycle on the same date as the accepted one; `cycle_key` is unique per plan and the
  insert did nothing, leaving the plan without an open cycle. The next date is now the later of "an
  interval after completion" and "the day after the accepted due date" (domain test).
- The bot closed a repair with one free-text message stored only in `summary`, while AC-045 expects
  what was done, the cause and the parts used. `FINISH` now asks the three questions one after another
  (`PendingStep.SUMMARY` → `CAUSE` → `PARTS`, the answers travel in the pending state) and fills
  `summary`, `cause` and `parts_used`; a dash answers "no parts". The repair photo of AC-045 is still
  not collected by the bot.

Observed and accepted: an employee without a locale gets notices in the tenant's base language until
the first bot contact sets it; the seeded pause reasons are Russian labels; the card in the panel
refreshes on focus, so a bot action can take a few seconds to show.

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
- Prototype parity pass (same day): repo-wide `pnpm typecheck` and `pnpm lint` pass; panel 587,
  worker 141, i18n 16 (bot notice texts), API `src/telegram` 54 and `src/maintenance` 23 passed.
  Screens 01–07 captured again at 1440×900 and 390×844 and compared with the prototype images;
  measured tables fit their containers (register 7 columns, queue 7, card plans 6).
- Not verified: the live Telegram bot against a real bot token (covered by bot harness tests; no token
  was available in this environment), the Control → Parameters page with the new group in a browser,
  and the deployed environment.

2026-09-25, scratchpad clone of `origin/master` (the shared checkout held another session's unpushed
work with a clashing migration number): `pnpm lint`, `pnpm format:check`, `tsc` for api, worker and
admin-web pass; i18n 16, panel maintenance suites 36 (plan draft, equipment card, work, data table,
page), API `src/maintenance` + `src/telegram/maintenance*` 36 on PostgreSQL (link documents, own
reminder days), worker timers 7 pass. Production evidence of the live test: 12 work orders 1001–1012,
nine `MAINTENANCE_ASSIGNED` notices delivered to the mechanic, 24 pending `MAINTENANCE_REMINDER` tasks
at 06:00 UTC (09:00 Kyiv), skipped offsets already in the past (FR-041). Not verified: the bot flows
with a mechanic's Telegram, the emergency flow, phone layouts of the new screens (the automation
browser cannot resize) and the deployed migration `0055`, which the release will run.

2026-09-25, end-to-end run: domain maintenance 22 (early completion after the due date), API
`src/maintenance` 25 and `src/telegram/maintenance-bot` 4 (three-question repair completion) pass on
PostgreSQL; the local journey above was repeated on the rebuilt API for the new bot questions (work
1005 keeps summary, cause and parts) and for the next cycle after an early completion (1006 accepted
five days early created 1007 on the following interval). Production: the owner's Telegram is linked
to a QA mechanic employee and that employee is the responsible mechanic of the three NEWTOP machines
for the owner's own bot test, with the original mechanic as backup; both are to be reverted after it.

## Remaining work

- Positions directory: a `performs_maintenance` switch in the panel (spec A-1).
- Revert the pilot after the owner's bot test: responsible mechanic back to the original employee on
  the three machines, the owner's Telegram back to their own employee record, QA employee archived.
- Optional repair photo on completion (AC-045) in the bot.
- Live bot and emergency QA with a mechanic's Telegram on the pilot; phone screenshots of the card's new
  footer, the materials tab and the material cards.
- Watch the pilot for materials lists over 30 rows (bot falls back to text).
