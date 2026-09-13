# Tasks: Employee profile

**Input**: spec.md and plan.md in this change directory
**Authority**: Specification and issue publication authorized 2026-09-13; implementation not yet authorized | **Writer / index owner**: implementing session | **Checkout**: master
**Evidence**: [docs/engineering/features/employee-profile.md](../../docs/engineering/features/employee-profile.md)

## Task Format and Rules

Tasks follow the local template. Writing tasks are sequential. GitHub issues group tasks by
independently deliverable capability (repository convention, as in epics #3 and #55); each issue
lists its task IDs. The GitHub issue is the completion authority.

## Foundation: Data, domain and contracts

- [ ] T001 Coordinate with the calendar/birthday change: confirm `birth_date` and `0049_calendar_events.sql` are delivered, then take the next migration number (covers A-dependency in spec Edge Cases)
- [ ] T002 Add migration and schema: `employees.marital_status` enum (`SINGLE`,`MARRIED`,`DIVORCED`,`WIDOWED`, nullable), `employees.avatar_media_id` FK `media_objects`, `org_units.master_employee_id` FK `employees` with `master_assigned_at/by`, and `employee_compensation_entries` with checks "`employment_rate > 0 and <= 1`", "amounts `>= 0`", "`hourly_rate is not null or monthly_salary is not null`", "`currency = 'UAH'`", "`corrects_entry_id is null or reason is not null`", correction-date trigger and append-only trigger in `packages/db/src/schema/{identity,org,compensation}.ts` and `packages/db/drizzle/` (covers FR-006, FR-008)
- [ ] T003 Add PostgreSQL invariant tests for the migration: check violations, UPDATE/DELETE rejected on compensation entries, correction date mismatch rejected, master FK (covers AC-023, AC-024)
- [ ] T004 Add pure `packages/domain/src/employee-profile/{compensation,master-state,field-access,zone}.ts` with unit and fast-check tests; export from `packages/domain/src/index.ts` (covers AC-002, AC-019–AC-025)
- [ ] T005 Add zod contracts `packages/contracts/src/employee-profile.ts` (profile view with optional restricted sections, update with `expectedVersion`, compensation entry, unit master) and extend `identity.ts` (covers FR-003, FR-004, FR-006, FR-008)

## User Story 1: Scoped and field-restricted employee data (P1)

**Outcome**: scoped users see only their employees; restricted values never leave the server | **Acceptance criteria**: AC-001–AC-004

- [ ] T006 [US1] Add failing PostgreSQL integration tests for two units and ORG_UNIT/SITE/ENTERPRISE grants across `GET /admin/employees`, `/page`, `/:id` and `/:id/positions`, including unassigned employees (A6), in `apps/api/src/identity/*.test.ts` (covers AC-001)
- [ ] T007 [US1] Apply grant scope by current assignment unit/site in `apps/api/src/identity/employees.service.ts` and `positions.service.ts` using `packages/domain/src/access/scope.ts`; 403 for out-of-scope identifiers (covers AC-001)
- [ ] T008 [US1] Add the role × section serialization helper over `profileFieldAccess`, the `employee.compensation.denied` audit and audit redaction for restricted fields in `apps/api/src/identity/` with tests (covers AC-002–AC-004)
- [ ] T009 [US1] Independent access/privacy review of scope, serialization, audit and logging; record the result in the engineering memory (covers FR-001, FR-002, FR-010)

## User Story 2: Employee profile view (P1)

**Outcome**: one addressable profile with header, contacts and work sections | **Acceptance criteria**: AC-005–AC-010

- [ ] T010 [US2] Add scoped `GET /admin/employees/:id/profile` in `apps/api/src/identity/admin-employees.controller.ts` + `employee-profile.service.ts`, one read transaction, serialized by T008, with an integration test (covers AC-002, AC-006, AC-007)
- [ ] T011 [US2] Add `apps/admin-web/src/features/employee-profile/{model,ui,index.ts}`: query, view-model builders with "not specified" markers, `ProfilePage`, header, contacts (copy/tel/mailto/Telegram) and work sections, async states via `shared/ui/loading-state.tsx`, terminated read-only, route `administration/employees/:employeeId` (covers AC-005–AC-010)
- [ ] T012 [US2] Link employee list rows and names in `apps/admin-web/src/admin/EmployeesTab.tsx` to the profile preserving filters, page and scroll; component tests for navigation, empty markers and async states (covers AC-005, AC-007, AC-008)
- [ ] T013 [US2] Add `packages/i18n/src/employee-profile.ts` strings and tooltips in `uk`/`en`/`ru` (covers FR-010)

## User Story 3: Edit personal data, contacts and avatar (P1)

**Outcome**: HR edits each section in place with validation, audit and conflict detection | **Acceptance criteria**: AC-011–AC-016

- [ ] T014 [US3] Extend `PATCH /admin/employees/:id` editable and audited fields with `birthDate` (not in future, at least 14 years ago) and `maritalStatus`, `expectedVersion` → 409 `EMPLOYEE_VERSION_CONFLICT`, with API tests (covers AC-011–AC-013, AC-016)
- [ ] T015 [US3] Add section editors in a Sheet for identity/contacts/personal with zod inline errors, disabled no-op save, conflict handling that keeps the draft, and component tests in `apps/admin-web/src/features/employee-profile/ui/` (covers AC-011–AC-013, AC-016)
- [ ] T016 [US3] Add `PUT`/`DELETE`/`GET /admin/employees/:id/avatar`: ≤10 MB, JPEG/PNG/WebP by magic bytes, normalize to 512 px WebP with orientation applied and metadata stripped, private object + reference swap + audit in one transaction, after-commit old-object removal; tests for rejection and failure keeping the previous avatar (covers AC-014, AC-015)
- [ ] T017 [US3] Add avatar upload/remove control reusing `apps/admin-web/src/components/app/avatar.tsx`; show avatars in the profile header and employee list (covers AC-014, AC-015)

## User Story 4: Unit master and zone (P1)

**Outcome**: every unit has a visible master; profiles show master and zone | **Acceptance criteria**: AC-017–AC-021

- [ ] T018 [US4] Add `PUT`/`DELETE /admin/org/units/:id/master` (ADMIN, ACTIVE employee, audit) in `apps/api/src/org/` with tests (covers AC-017)
- [ ] T019 [US4] Add master picker and "needs a master" filter to the unit directory in `apps/admin-web/src/admin/` (covers AC-017, AC-018)
- [ ] T020 [US4] Include master state (`unitMasterState`) and derived zone (`profileZone`, D-05) in the profile read model; render warning states with text and icon and the "master of unit" marker (covers AC-017–AC-021)

## User Story 5: Compensation history (P2)

**Outcome**: HR records dated rate, tariff and salary; accounting reads them | **Acceptance criteria**: AC-022–AC-026

- [ ] T021 [US5] Add `GET`/`POST /admin/employees/:id/compensation` (GET ADMIN/HR/ACCOUNTANT, POST ADMIN/HR, scoped, audit with ids only, no automatic retry) with integration tests for effective value, scheduled and corrected entries (covers AC-022–AC-025)
- [ ] T022 [US5] Add `CompensationSection` (current, history, scheduled/corrected markers, add/correct editor with mandatory correction reason; read-only for ACCOUNTANT; absent for others) with component tests (covers AC-022–AC-026)

## User Story 6: Schedule summary (P2)

**Outcome**: next shifts and month plan on the profile | **Acceptance criteria**: AC-027–AC-029

- [ ] T023 [US6] Add the published-only schedule summary (month shift count and planned hours, next shifts with template, times and zone in site time zone) to the profile read model with an integration test for draft exclusion (covers AC-027, AC-028)
- [ ] T024 [US6] Add `ScheduleSection` with "no published schedule" state and "Open in Schedule" preset (unit, month, highlighted employee) (covers AC-027–AC-029)

## Delivery and Evidence

- [ ] T025 Visual QA at 1440 and 390 px on synthetic data (profile, editors, compensation, unit master directory, list avatars); moderated SC-001/SC-004 check; store evidence in the engineering memory (covers AC-010, SC-001, SC-003, SC-004)
- [ ] T026 Update `docs/features/11-admin-panel.md` Employees section and `docs/engineering/features/employee-profile.md` (decisions, Lean completion review, checks, limitations, OD-1–OD-3)
- [ ] T027 Inspect task-owned changes, run remaining required checks, and deliver through the existing master CI/release/announcement path; verify deployed behavior without changing real employees' compensation

## Dependencies and Handoff

T001 → T002 → T003/T004/T005 → US1 (T006–T009) → US2 → US3 → US4 → US5 → US6 → T025–T027.
US1 and the foundation block any exposure of new profile data. US5 and US6 may ship in a later
delivery. Owned files: plan.md "Project Structure and Allowed Files". Blocker: concurrent
birth-date change (T001). Next action: owner authorizes implementation.

## Convergence

Compare code with the accepted spec and plan after implementation. Append only demonstrated gaps
within scope as new numbered tasks; preserve completed history.
