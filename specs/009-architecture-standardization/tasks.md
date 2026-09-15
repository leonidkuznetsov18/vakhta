# Tasks: Architecture standardization

Authority: [accepted spec](spec.md). Design: [plan](plan.md). Writer/index owner: root Codex, master.
Evidence: [development workflow](../../docs/engineering/features/development-workflow.md).
Implementation, conditional evaluations and the delivery gate are complete; evidence is recorded below. All writes are sequential.

## First delivery: protocol adapters and dependency foundation

- [x] T001 Inspect source, audit and dependency APIs; create spec.md, plan.md and requirements checklist.
- [x] T002 Add exact runtime dependencies to apps/admin-web/package.json and apps/api/package.json and regenerate pnpm-lock.yaml.
- [x] T003 [US1] Add parser/limit/header regression tests in apps/admin-web/src/features/employee-import/model/preview.test.ts (AC-001,002).
- [x] T004 [US1] Implement contract-driven Papa Parse preview in apps/admin-web/src/features/employee-import/model/preview.ts (AC-001,002).
- [x] T005 [US1] Add stale-read, close and failure tests and implement apps/admin-web/src/features/employee-import/model/file-selection.ts (AC-003).
- [x] T006 [US1] Move ImportDialog into apps/admin-web/src/features/employee-import/ui/import-dialog.tsx, expose index.ts, update EmployeesTab.tsx and delete lib/csv.ts (AC-004,010).
- [x] T007 [US1] Add three-language import feedback in packages/i18n/src/{messages,en,uk,ru}.ts and UI regression tests in features/employee-import/ui/import-dialog.test.tsx (AC-002–004).
- [x] T008 [US2] Implement/test apps/api/src/common/csv.ts and csv.test.ts; integrate losses.service.ts and bonus.service.ts serializers (AC-005,010).
- [x] T009 [US2] Verify the real bonus export metadata regression (AC-005). CI exposed a fixture effective-date mismatch; corrected to the period boundary and the focused PostgreSQL case passed. Colima recovered without deleting database volumes.
- [x] T010 [US3] Implement/test apps/api/src/scheduling/calendar-feed.ts and integrate feed.service.ts; delete handwritten encoding (AC-007,010).
- [x] T011 [US2] Update apps/api/package.json SheetJS source and verify existing scheduling/losses/bonus XLSX round trips (AC-006).
- [x] T012 [US3] Run existing personal feed integration cases in apps/api/src/scheduling/schedule.service.test.ts (AC-008).
- [x] T013 [US4] Centralize compatible shared ranges in pnpm-workspace.yaml and workspace package.json files; frozen-lock installation and resolution comparison (AC-009).
- [x] T014 Run affected typecheck, lint, formatting and builds; record outcomes in docs/engineering/features/development-workflow.md.
- [x] T015 [US1] Capture and visually inspect desktop/mobile import screenshots with fixture data under test-results/architecture-standardization (AC-004).
- [x] T016 Independently review export compatibility and resolve demonstrated findings; update specs/009-architecture-standardization/tasks.md and existing product/evidence docs.
- [x] T017 Deliver verified implementation through master check/release/announcement: source `331009a`, run `34973454627`, release `v1.15.4`; the full check job and Telegram post step succeeded. See development-workflow.md for local versus deployment evidence.

## Following delivery: forms and contracts

- [x] T018 [US5] Select ordinary form and representative CRUD/paginated resource from live source; refine exact acceptance/allowed paths in specs/009-architecture-standardization/plan.md before editing (AC-011).
- [x] T019 [US5] Implement TanStack Form/Zod pilot in the selected feature model/ui with edit-revert, conflict/error and compiler tests; record paths/evidence in plan.md (A2, AC-011).
- [x] T020 [US5] Implement compatible Nest/Zod/OpenAPI and generated transport pilot with runtime validation, cancellation and retained errors; record exact paths/generation checks in plan.md (A1, AC-011).
- [x] T021 [US5] Verify desktop/mobile and endpoint compatibility; remove superseded pilot code and document selected standards in docs/engineering/standards.md (AC-011).

## Following delivery: enforce ownership and verification

- [x] T022 [US6] Specify/migrate first generic persisted UI state slice with actor/schema/version/recovery tests; retain exact owned paths in plan.md (A3, AC-012).
- [x] T023 [US6] Add scoped architecture/public-API/hook checks in eslint.config.js and assess Steiger/Knip with explicit legacy/runtime entrypoints (A4,A14, AC-012).
- [x] T024 [US6] Introduce MSW fixtures and minimal Playwright/axe journeys for pilot surfaces; record exact configs/scripts in plan.md (A7, AC-012).
- [x] T025 [US6] Codify date/time, query-options and SSE ownership in docs/engineering/standards.md and implement demonstrated pilot gaps with tests (A13, AC-012).

## Following delivery: operational contracts and conditional choices

- [x] T026 [US7] Refine logging/correlation scope in plan.md and integrate redacted nestjs-pino request/task context with tests (A8, AC-013).
- [x] T027 [US7] Specify inbox/outbox/idempotency failure guarantees in plan.md; implement independently reviewed recovery changes with PostgreSQL fault tests (A9, AC-013).
- [x] T028 [US7] Evaluate pg-boss against those tested guarantees and record adopt/retain outcome in docs/engineering/features/development-workflow.md before any queue migration (A10, AC-013).
- [x] T029 [US7] Evaluate dnd kit, i18next and conditional virtualization against actual workflows; record pilot/retain/defer decisions and evidence in plan.md (A11,A12,A13, AC-014).
- [x] T030 Reconcile all audit A1–A14 outcomes and remaining migrations in specs/009-architecture-standardization/tasks.md; finish program only after the accepted outcomes and required evidence exist.

## Dependencies and Convergence

T003→T004→T005→T006→T007; T008→T009; T010→T012; T002 precedes dependency consumers.
T011 precedes final XLSX checks; T013 precedes T014; T014/T015→T016→T017. Subsequent scopes were refined before implementation; decisions and evidence are recorded in plan.md
and development-workflow.md. T017 passed the remote integration/release gate. Preserve completed evidence;
append numbered tasks only for demonstrated gaps. No parallel writers or automatic intermediate releases.

## Final reconciliation

All A1–A14 have an implemented pilot or explicit retain/defer decision in the engineering evidence
table. Remaining migrations are boundaries of the accepted incremental plan, not silently completed
work: legacy endpoint wrappers/forms/persistence, full-panel FSD, durable payload inbox and legacy
command receipts. pg-boss, dnd kit, i18next and virtualization require the recorded adoption triggers.
No end-to-end exactly-once or production employee journey is claimed. T017 is backed by the successful full check job, published release and verified announcement step
for source `331009a`.
