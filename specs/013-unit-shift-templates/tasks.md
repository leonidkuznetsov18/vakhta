# Tasks: Unit shift templates

**Input**: spec.md and plan.md | **Authority**: owner request and answers 2026-09-23
**Writer / index owner**: Claude (this session) | **Checkout**: master
**Evidence**: `docs/engineering/features/unit-shift-templates.md` (created in T017; verification section lists every run)
**UI reference**: prototype v2 (throwaway, removed in T017)

## Shared foundation

- [x] T001 Add `SHIFT_PERIODS`/`ShiftPeriod` in packages/domain/src/scheduling/types.ts. Replace `isNight` with `period` in calendar.ts, workload.ts (`fullDayShifts`), time/plan.ts and time/shift-window.ts. Update domain tests (covers AC-018, AC-019).
- [x] T002 Create packages/domain/src/scheduling/shift-templates.ts and its test file with `suggestPeriod`, `validateTemplateTimes`, `templateDisplayName`, `templatesForUnit`, `isTemplateSelectable` and `compareTemplates`. Use fast-check, and cover DST for FULL_DAY and Night (covers AC-005, AC-007, AC-008, AC-012, AC-014).
- [x] T003 Update packages/db/src/schema/scheduling.ts and org.ts. Generate and complete packages/db/drizzle/0053_unit_shift_templates.sql: the period backfill, retirement columns and checks, the composite FK, the partial unique index, and dropping `is_night` (versioning replaced the snapshot, ADR-0017). Update seed-defaults.ts. Add PostgreSQL invariant and backfill tests proving instants do not change (covers AC-008, AC-017, SC-002).
- [x] T004 Update packages/contracts/src/scheduling.ts: view, create/update commands, and the refinement. Add uk/en/ru i18n strings for `kindNames.FULL_DAY`, the Sheet, the form, presets, the picker groups, tooltips and the `SHIFT_TEMPLATE_*` errors (covers AC-005–016).

## US2: Manage unit shifts (API)

- [x] T005 [US2] Implement template list with `usedCount`, plus create, update and delete (hard or soft, ending staffing requirements), ADMIN-only with events, audit and revision. Files: apps/api/src/scheduling/templates.service.ts, admin-schedules.controller.ts and the unit route. Integration tests: 403 for non-ADMIN (masters included), 409 for duplicate name and stale revision, audit rows (covers AC-004, AC-006–011).

## US3: Schedule offers the unit's shifts (API)

- [x] T006 [US3] Apply the scope rule in schedule.service.ts `replaceAssignments`: a retired or foreign template only on an unchanged person-day; template versioning keeps planned hours. Apply the same scope check in staffing.service.ts and open-slots.service.ts (saved patterns are site-level; a retired template in a pattern is repointed on replace and makes a SINGLE pattern unavailable otherwise). Integration tests: template edit then re-save leaves instants unchanged; deleted shift in unchanged vs new items; another unit's shift rejected; borrowed employee (covers AC-010, AC-014, AC-016, AC-017, SC-002, SC-003).

## US4: Downstream readers

- [x] T007 [US4] Scope the template queries in shift.service.ts (arrival inference), overview.service.ts and requests.service.ts `templatesFor`, with tests (covers AC-021–023).
- [x] T008 [US4] Switch message readers to `kindNames[period]` or the display name: telegram/screens.ts, schedule-change-notice.ts, calendar-feed.ts, feed.service.ts, schedule-export.service.ts, i18n schedule-export.ts, and in apps/worker/src/timers events.ts and shift-reminder-policy.ts. Add bot screen tests; the no-close-button test must stay green (covers AC-023, AC-024).

## US1–US3: Panel (following prototype v2)

- [x] T009 [US2] Create apps/admin-web/src/features/unit-settings/ (model, unit-sheet, unit-shifts-section, unit-shift-form, index.ts; deletion uses the shared confirm dialog) and the shared entity `entities/shift-template`. UnitMasterPicker became `employee-profile/UnitMasterField`, composed by the page. Model tests: suggested type until touched, presets, canSave, sorting (covers AC-003, AC-005–011).
- [x] T010 [US1] Wire DirectoriesTab.tsx: remove the button, add the Shifts chip column, use `onRowClick` with a row-menu "Open" for keyboard users. Rename org-structure `onAssignMaster` to `onOpenUnit`. Component tests: row click, Enter, the menu, read-only for non-ADMIN, focus restore (covers AC-001–004).
- [x] T011 [US3] In schedule-management:
  - add a `ShiftPicker` card radiogroup to assignment-editor, with eligibility reasons, greyed-but-selectable cards, the custom-time fallback, "Save as a shift" for ADMIN and a sticky Assign button;
  - use the scoped `templates` in the batch planner, staffing, copy period and slots;
  - update labels, the period colours, the Full-day continuation cell, and hotkeys.

  Add component tests (covers AC-012–015, AC-018, AC-020).

## Verification and delivery

- [x] T012 Run scoped typecheck, lint and test for domain, db, contracts, i18n, api, worker and admin-web, plus clean-code.mjs with no growth in suppressions.
- [x] T013 Visual QA at desktop and 375 px width (panel preview with fixtures; the local API did not boot in this session, see feature memory). Cover the units table, the unit Sheet states, the Schedule picker (greyed option, borrowed employee) and a Full-day card. Compare against prototype v2 and record the inspected screenshots.
- [x] T014 Independent code-reviewer pass over the migration, the versioning transaction, the replaceAssignments scope rule, access and scoping. Fix the demonstrated findings.
- [x] T015 Run speckit-analyze before T005 and speckit-converge after T014.
- [x] T016 Write ADR-0017 in docs/adr: unit shift templates, versioned so planned shifts keep their hours.
- [x] T017 Update docs/features/05-schedule.md, 11-admin-panel.md, docs/engineering/table-filter-standard.md and the AGENTS.md palette. Create docs/engineering/features/unit-shift-templates.md with the competitor reference and the prototype verdict. Delete the prototype file and its preview.tsx hook.
- [ ] T018 Stage only task-owned paths and make one commit, `feat(schedule): unit shift templates`. Push to origin master, then check the CI, release and announcement outcome.

## Convergence (2026-09-24)

The independent review confirmed four defects, now fixed with regression tests:

- A deleted successor is retired instead of deleted, which failed its FK.
- Open slots and swaps on a retired version are kept on their dates.
- An approved extra shift follows `replaced_by` to the current version.
- Coverage and qualifications compare versions through `templateLineage`.

Rolling-deploy risk is covered: `is_night` stays one release as a generated read-only column.
The export gains a "Shift" name column. Spec, plan and product documents match the code.
Open follow-ups:

- Drop `is_night` in the next release.
- Check production templates for `local_start = local_end` before deploying.

## Dependencies and Handoff

- T001–T004 come first.
- T005 comes before T009.
- T006 comes before T011.
- T007 and T008 do not depend on the panel.
- T012–T018 run last.
- All writes are sequential. Do not stage `.claude/launch.json`.
