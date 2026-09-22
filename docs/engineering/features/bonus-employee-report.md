# Feature: employee bonus report

## Outcome and scope

Owner request, 2026-09-22: clicking an employee on the «Бонус» points table must open that
person's own bonus report, the way Reports drill into a category, so a manager sees exactly which
shifts, checklists, remarks and decisions produced the number in the row. Read-only: nothing is
scored or edited. Product description: [bonus points](../../features/09-bonus.md).

## Current behavior and ownership

- Contract: `EmployeeBonusReportView` in `packages/contracts/src/bonus.ts`. One row per shift of
  the month (`EmployeeBonusShiftView`): the shift, its zone, the live checklist report with its
  status, the items the employee marked as not in order, the receiving shift's acceptance, the
  master's resolution and the checklist point it earned. `employee` repeats the row of the points
  table; `awards` lists month-end awards separately.
- API: `GET /admin/bonus/employee?employeeId&month` → `BonusService.employeeReport`. Same viewer
  roles as the points endpoint. Rows come from `shift_sessions`, `handover_records`,
  `checklist_answers`, `handover_reviews`, `handover_resolutions` and `bonus_point_awards`. A shift
  is listed when it closed (terminal state) or has a sent checklist; drafts and superseded reports
  never count, exactly as in `points`. The summary is computed from the same rows, so opening a row
  never shows a number different from the table.
- Panel: `apps/admin-web/src/bonus/EmployeeBonusReport.tsx` renders inline under the row
  (`RowDetail`, standard T5), with the opened employee in the address `#/bonus/<employeeId>`
  (route `/bonus/{-$id}`; opening a row replaces the history entry). Inside: profile link,
  twelve-month points trend (reuses the history endpoint with `employeeId`), the shifts sub-table
  with an expandable detail per shift (own remarks, acceptance, master's decision with full text)
  and an "Open the report" action that presets the handover page filters (site, day, scope "all")
  before deep-linking `#/handover/<id>`. Pure helpers live in `employee-report-model.ts`.
- Shared: `entities/handover` now owns the status-to-label map and `HandoverStatusPill`, used by
  both the handover page and this report, instead of a page-local copy.

## Decisions and reuse

- Inline `RowDetail` rather than a Sheet: the table-filter standard forbids `DetailSheet` for row
  data and asks for inline inspection with preserved scroll and row context; the sub-table and the
  shift detail reuse the shared `DataTable` expansion.
- Trend uses the existing history endpoint (`employeeId` filter) instead of a new aggregate.
- No new scope enforcement: the points endpoint has none yet (open item #1); the new endpoint
  mirrors it and will inherit the same fix.
- `resolvedBy` is a web user id and is not displayed; the decision, reason code and date are.

## Verification

2026-09-22, local checkout, uncommitted at time of writing:

- `apps/api` `bonus.service.test.ts` — new case "the employee report lists each shift with its
  checklist, remarks, decision and point" plus the existing points case: 2 passed (real PostgreSQL
  via testcontainers).
- `apps/admin-web` `BonusPage.test.tsx` — new case "opens the employee report under the row, with
  the shifts and their remarks": 4 passed; `HandoverPage.test.tsx` 4 passed after the entity move.
- `turbo typecheck` for `api`, `admin-web`, `@vakhta/contracts`, `@vakhta/i18n`: clean.
  `eslint` on all changed paths: no new findings.
- Local panel screenshots (desktop and mobile) of the opened row: see the delivery report.

## Remaining work

- Scope enforcement for bonus reads (shared with the points endpoint).
- Reason codes in the shift detail are shown as stored codes; a label lookup from the org
  dictionary can follow if masters ask for it.
