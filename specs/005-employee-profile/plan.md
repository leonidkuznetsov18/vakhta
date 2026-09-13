# Implementation Plan: Employee profile

**Change**: 005-employee-profile | **Date**: 2026-09-13 | **Spec**: [spec.md](spec.md)
**Baseline**: 64560d7 | **Checkout**: master | **Engineering memory**: [employee-profile](../../docs/engineering/features/employee-profile.md)

## Summary

Enforce grant scope on employee reads first. Then add one profile read model assembled on the server
with restricted sections omitted by role, a dedicated panel profile page built as an FSD slice, and
three small data additions: marital status and an avatar reference on `employees`, a designated
master on `org_units`, and an append-only `employee_compensation_entries` table. Zone and schedule
are derived from existing scheduling data. No bot, kiosk, worker or bonus changes.

## Technical Context

- **API** `apps/api/src/identity/` (NestJS 11/Fastify): `admin-employees.controller.ts`,
  `employees.service.ts` (hard-coded editable/audited field list at :137-143), `positions.service.ts`;
  `apps/api/src/org/` for the unit directory; `apps/api/src/scheduling/` for published assignments;
  `apps/api/src/infra/object-storage.ts` and `media_objects` for private media;
  `apps/api/src/events/audit-log.ts` for audit.
- **Access** `packages/domain/src/access/{roles,scope}.ts` (`grantCovers`, `accessScope`,
  `HR_ROLES`); medical masking precedent in `apps/api/src/requests/requests.service.ts:599-612`.
- **DB** Drizzle schema `packages/db/src/schema/{identity,org}.ts`; migrations in `packages/db/drizzle/`.
  The concurrent birth-date change owns `0049_calendar_events.sql`; this change takes the next free
  number after that lands.
- **Contracts** `packages/contracts/src/identity.ts` (zod); add `employee-profile.ts`.
- **Panel** React 19 + Vite, TanStack Query/Router, Zustand, shadcn/ui. Existing
  `apps/admin-web/src/admin/EmployeesTab.tsx`, `components/app/avatar.tsx`, `shared/ui/loading-state.tsx`,
  RowDetail/ScrollableText, TableCount/Paginator. i18n in `packages/i18n/src/`.

## Constitution Check

- Access boundaries are correctness: US1 is a hard prerequisite; restricted values are removed on the
  server, not hidden in React. Same gap class as critical-reliability requirement 1 and spec 004 US1.
- SQL invariants (C5): rate range, non-negative amounts, "tariff or salary" check, append-only
  compensation (no UPDATE/DELETE grant, trigger rejects both), master FK to `employees`.
- C7 / privacy: never log compensation, marital status, avatar storage keys or presigned URLs.
  Audit entries for restricted fields carry field names and entry ids, not values (AC-004).
- Domain purity (C2): effective-compensation resolution, master state and field-access matrix are pure
  functions in `packages/domain` with tests; no I/O.
- Payroll out of MVP scope: compensation is reference data; no calculation, export or bonus use.
- React hook policy: no `useEffect`/`useMemo`/`useRef`/`useCallback`; prepared view models and named
  actions; TanStack Query for server state; Zustand only if section-editor UI state needs sharing.
- i18n: every string and tooltip in `uk`/`en`/`ru`. Admin UI rules: disabled no-op saves, async states,
  read-only terminated profile, long-text bounds, visible focus states, mobile layout.
- No gaps requiring exemptions. Re-checked after design: unchanged.

## DESIGN: Ownership and Behavior

### Data (one migration)

| Change                                                                                                                                                                                                                                                                                                 | Invariants                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `employees.marital_status` enum `marital_status` (`SINGLE`,`MARRIED`,`DIVORCED`,`WIDOWED`), nullable                                                                                                                                                                                                   | enum                                                                                                                                                                                                                                                                                                                         |
| `employees.avatar_media_id uuid` → `media_objects.id`, nullable                                                                                                                                                                                                                                        | FK; media purpose `EMPLOYEE_AVATAR`                                                                                                                                                                                                                                                                                          |
| `org_units.master_employee_id uuid` → `employees.id`, nullable, plus `master_assigned_at`, `master_assigned_by`                                                                                                                                                                                        | FK; at most one master per unit by construction                                                                                                                                                                                                                                                                              |
| `employee_compensation_entries` (`id`, `employee_id`, `effective_from date`, `employment_rate numeric(3,2)`, `hourly_rate numeric(12,2)`, `monthly_salary numeric(12,2)`, `currency text default 'UAH'`, `corrects_entry_id uuid` self-FK, `reason text`, `created_by uuid`, `created_at timestamptz`) | `employment_rate > 0 and <= 1`; amounts `>= 0`; `hourly_rate is not null or monthly_salary is not null`; `currency = 'UAH'`; `corrects_entry_id is null or reason is not null`; correction's `effective_from` equals the corrected entry's (trigger); append-only trigger; index `(employee_id, effective_from, created_at)` |

`employee_positions.manager_employee_id` stays untouched and unused by new code (Open Decisions).

### Domain (`packages/domain/src/employee-profile/`)

- `effectiveCompensation(entries, date)` → the latest non-corrected entry with `effectiveFrom <= date`
  (a correction replaces its target); `compensationHistory(entries)` marks corrected/scheduled.
  fast-check: result independent of input order; corrections never resurrect the corrected entry.
- `unitMasterState({ master, masterStatus, masterGrantCoversUnit, isSelf })` →
  `ASSIGNED | MISSING | INACTIVE | NO_PANEL_ACCESS` (+ `isSelf`).
- `profileFieldAccess(roles)` → `{ personalEdit, maritalStatus, birthDate: 'FULL' | 'DAY_MONTH', compensation: 'NONE' | 'READ' | 'WRITE', ... }`
  per D-02/A5 — single source used by API serialization and panel affordances.
- `profileZone({ openShift, nextShift, monthZones })` per D-05.

### Contracts (`packages/contracts/src/employee-profile.ts`)

`EmployeeProfileView` with optional `maritalStatus`, `compensation` (current + history) and
`birthDate` as full date or `{ day, month }`; `access` flags from `profileFieldAccess`; `version`
(employee `updatedAt`) for conflicts. Commands: `UpdateEmployeeProfileCommand` (extends the existing
update with `maritalStatus`, `birthDate`, `expectedVersion`), `AddCompensationEntryCommand`,
`SetUnitMasterCommand`. All validated with zod at the API boundary.

### API

| Endpoint                                                    | Roles                                                         | Behavior                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| existing `GET /admin/employees`, `/page`, `/:id`, positions | unchanged roles                                               | **add grant scope** by current assignment unit/site (A6 for unassigned); 403 on out-of-scope ids                                                                                                                                                                                                              |
| `GET /admin/employees/:id/profile`                          | ADMIN, HR, ACCOUNTANT, PRODUCTION_HEAD, PLANNER, SHIFT_MASTER | scoped; one read transaction; serializes via `profileFieldAccess`; includes master state, zone (D-05), schedule summary                                                                                                                                                                                       |
| `PATCH /admin/employees/:id`                                | ADMIN, HR                                                     | extend editable/audited fields; `expectedVersion` → 409 `EMPLOYEE_VERSION_CONFLICT`; restricted values redacted in audit                                                                                                                                                                                      |
| `PUT` / `DELETE /admin/employees/:id/avatar`                | ADMIN, HR                                                     | multipart ≤10 MB; magic-byte type check; server normalizes to 512 px square WebP, strips metadata, applies orientation; stores private object, swaps reference and audits in one transaction; old object removed after commit (failure leaves an orphan for existing media cleanup, never a broken reference) |
| `GET /admin/employees/:id/avatar`                           | profile readers, scoped                                       | short-lived redirect or stream; `Cache-Control: private`; URL never logged                                                                                                                                                                                                                                    |
| `GET` / `POST /admin/employees/:id/compensation`            | GET: ADMIN, HR, ACCOUNTANT; POST: ADMIN, HR                   | scoped; denied → 403 + `employee.compensation.denied` audit; POST inserts entry + audit (ids only) in one transaction; not retried automatically                                                                                                                                                              |
| `PUT` / `DELETE /admin/org/units/:id/master`                | ADMIN                                                         | employee must be ACTIVE; audit; emits the existing org change invalidation                                                                                                                                                                                                                                    |

Schedule summary reuses the scheduling read path for published versions only (no draft rows),
computed in the site time zone. Avatar in the employee list uses the same scoped endpoint.

### Panel (`apps/admin-web/src/features/employee-profile/`)

- `model/`: query keys and `useEmployeeProfile` (TanStack Query), view-model builders from the
  contract (section rows, "not specified" markers, master/zone state labels), named actions
  (`saveProfileSection`, `uploadAvatar`, `removeAvatar`, `addCompensationEntry`) with invalidation of
  profile + employee list keys; draft vs saved comparison for save availability.
- `ui/`: `ProfilePage`, `ProfileHeader`, `ContactsSection`, `PersonalSection`, `WorkSection`,
  `ScheduleSection`, `CompensationSection`, section editors in a Sheet (mobile full-height), avatar
  upload control reusing `components/app/avatar.tsx`. Sections absent when access flags deny.
- Route `administration/employees/:employeeId`; `EmployeesTab.tsx` rows/names link to it and keep list
  filters, page and scroll; the expanded row card keeps its existing quick actions (Open Decisions).
- Unit directory (`apps/admin-web/src/admin/` org tab): master picker per unit, "needs a master" filter.
- `packages/i18n/src/employee-profile.ts` with `uk`/`en`/`ru` catalogs and tooltips.

**State.** Server state in Query; section editor open/draft is local component state; no global store.
**Async.** Stale profile after another editor → 409 path keeps the draft; mutations never auto-retry;
avatar upload is idempotent per request id; after-commit object deletion may fail independently.

## Project Structure and Allowed Files

One writer/index owner (the implementing session). Task-owned paths:

- `packages/db/src/schema/{identity,org}.ts`, `packages/db/src/schema/compensation.ts`, next migration + snapshot
- `packages/domain/src/employee-profile/**`, `packages/domain/src/index.ts`
- `packages/contracts/src/{employee-profile,identity}.ts`, contracts index
- `apps/api/src/identity/**`, `apps/api/src/org/**` (master endpoints), scheduling read helper if needed
- `apps/admin-web/src/features/employee-profile/**`, `apps/admin-web/src/admin/EmployeesTab.tsx`, org directory tab, router/navigation
- `packages/i18n/src/{employee-profile,messages,uk,en,ru}.ts`
- `docs/features/11-admin-panel.md`, `docs/engineering/features/employee-profile.md`, this change directory

Coordinate with the concurrent calendar/birthday session on `identity.ts`, `employees.service.ts`,
`contracts/identity.ts` and migration numbering; never stage its files.

## Lean Review

Recommendation recorded in the engineering memory: **Simplify.** Adopted: zone derived from the
schedule instead of a stored home zone (D-05); schedule section limited to next shifts, month count
and a Schedule link; one master per unit replacing the e-mail inference for display; avatar in private
storage rather than a data URL. Not adopted by owner decision: compensation and marital status stay in
scope, restricted per D-02 and never exported. Measure units without a master (target 0) and HR use of
the profile vs the row card.

## IMPLEMENT: Ordered Delivery

1. US1 access: failing scope/field matrix tests → scope enforcement on existing reads → review.
2. Migration + domain functions + contracts (shared foundation for US2–US5).
3. US2 profile read endpoint and page; list links.
4. US3 section editing, conflict handling, avatar.
5. US4 unit master directory and derived master/zone.
6. US5 compensation entries.
7. US6 schedule summary.
8. Docs, visual QA, independent review, one coherent delivery.

US1 and the foundation must land before any profile data is exposed; US5 and US6 may follow in a later
delivery.

## VERIFY and HARDEN

| Check                                                                                                                         | Covers                                |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| PostgreSQL integration: two units × ORG_UNIT/SITE/ENTERPRISE grants over list, card, profile, positions, avatar, compensation | AC-001, AC-003, SC-002                |
| Role × section serialization matrix (8 roles) on the profile endpoint; audit redaction for restricted fields                  | AC-002, AC-004                        |
| Domain unit + fast-check: `effectiveCompensation`, `unitMasterState`, `profileFieldAccess`, `profileZone`                     | AC-019–AC-025, AC-020                 |
| PostgreSQL invariants: compensation checks, append-only trigger (UPDATE/DELETE rejected), correction date rule, master FK     | AC-023, AC-024                        |
| API: version conflict 409, avatar type/size rejection, upload failure keeps previous reference                                | AC-013–AC-015                         |
| Panel component tests: section absence by access, disabled no-op save, "not specified", async states, terminated read-only    | AC-007–AC-009, AC-011, AC-016, AC-026 |
| i18n catalog parity test (existing)                                                                                           | FR-010                                |
| Visual QA 1440 and 390 px: profile, editors, compensation, unit master directory, employee list avatars (synthetic data)      | AC-010, SC-001, SC-004                |
| One independent access/privacy review of API serialization, audit and logging                                                 | FR-001, FR-002, FR-010                |

Commands: `pnpm --filter @vakhta/domain test`, `pnpm --filter @vakhta/api test -- identity org`,
`pnpm --filter @vakhta/admin-web test -- employee-profile`, `pnpm typecheck`, changed-file lint.
CI remains the full gate. Verify the deployed profile with `dev@vakhta.xyz` per
`docs/runbooks/product-qa.md` without editing real employees' compensation.

## REPORT and Documentation

Update the Employees section of `docs/features/11-admin-panel.md` and the engineering memory with
decisions D-01–D-05, Lean outcome, evidence and remaining work. Distinguish local, CI and deployed evidence.

## Open Decisions

- OD-1 `employee_positions.manager_employee_id`: unused today. Proposal: stop accepting it in new UI and
  drop it in a later migration once production data shows no values. Consequence of keeping: two
  "master" sources.
- OD-2 Bonus nominations still match masters by e-mail. Switching them to the unit master changes bonus
  behavior and is out of this change; record as follow-up.
- OD-3 Whether the expanded row card remains once the profile exists; decide after SC-001 moderated check.
