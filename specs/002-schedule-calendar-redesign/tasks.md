# Tasks: Schedule calendar redesign

**Input**: [spec.md](spec.md), [plan.md](plan.md) | **Checkout**: master
**Writer/index owner**: 01a09769-91c2-7490-a16f-29d7e2b6a44f
**Evidence**: [existing engineering memory](../../docs/engineering/features/schedule-calendar-redesign.md) and [acceptance.md](acceptance.md).

All writing is sequential. Policy-dependent work remains blocked only at its dependency. Paths beginning apps/ or packages/ are relative to repository root. Each phase must update this file and the existing engineering memory before moving on. No issue is completed by its publication catalog.

## Phase 1: Policy and baseline — #4

**Story**: US1 | **Dependencies**: None | **Checks**: all issue acceptance; mapped SC/AC/UX in acceptance.md.

- [ ] T001 [US1] Record D-01–06 answers and benchmark the existing synthetic planning/replacement/recovery tasks with planner/day/night masters in spec.md and ../../docs/engineering/features/schedule-calendar-redesign.md (#4).
- [ ] T002 [US1] Record approved first-stage scope and actor/action rules in spec.md; retain unresolved gates for dependent work (#4).
- [ ] T003 [US1] Verify accepted policy and measured participant evidence in acceptance.md; automated benchmark is not a substitute (#4).

## Phase 2: Calendar component — #5

**Story**: US1 | **Dependencies**: #4 for prototype scope | **Checks**: all issue acceptance; mapped SC/AC/UX in acceptance.md.

- [x] T004 [US1] Prototype controlled resource/date/item API and zone/person/day/week/cross-month projections in apps/admin-web/src/shared/ui/resource-calendar/ and apps/admin-web/src/preview/calendar-prototype.tsx (#5).
- [x] T005 [US1] Measure 500-person fixture, inspect desktop/390px and keyboard Move/custom interval/segment/conflict demonstrations in apps/admin-web/src/preview.tsx (#5).
- [x] T006 [US1] Record chosen API, official license/capability matrix, performance evidence and alternatives in research.md and docs/adr/ (#5).

## Phase 3: Calendar workspace — #6

**Story**: US1 | **Dependencies**: #4/#5 | **Checks**: all issue acceptance; mapped SC/AC/UX in acceptance.md.

- [x] T007 [US1] Add prepared calendar model, period/grouping state and contextual actions in apps/admin-web/src/features/schedule-management/model/calendar.ts (#6).
- [x] T008 [US1] Connect zone/person/day/week/mobile calendar to existing editors, feedback and trilingual labels in apps/admin-web/src/features/schedule-management/ui/ and packages/i18n/src/ (#6).
- [ ] T009 [US1] Test context defaults, grouping parity, unknown/pending/retry, full writes and no-op controls; inspect desktop/390px uk/en/ru in schedule-workspace.test.tsx and acceptance.md (#6).

## Phase 4: Preserved workflows — #7

**Story**: US1 | **Dependencies**: #6 | **Checks**: all issue acceptance; mapped SC/AC/UX in acceptance.md.

- [ ] T010 [US1] Audit preserved lifecycle/communication against SC-08/09/18/19/20/24/25/28 in apps/api/src/scheduling/schedule.service.ts and apps/worker/src/ (#7).
- [ ] T011 [US1] Integrate acknowledgement/reminder evidence and exact publication/history views in apps/admin-web/src/features/schedule-management/api/ and ui/ (#7).
- [ ] T012 [US1] Run focused scheduling/worker/workspace regressions for historical times, delivery failure, superseded acknowledgement/reminders and draft recovery; record acceptance.md (#7).

## Phase 5: Draft reliability — #9

**Story**: US1 | **Dependencies**: #6 | **Checks**: all issue acceptance; mapped SC/AC/UX in acceptance.md.

- [x] T057 [US1] Complete validated employee directory cursor reads and Schedule aggregation, paginated selection, employee-205 preservation regression and desktop/mobile evidence (#9, SC-23 read increment).
- [x] T058 [US1] Add all-writer revision advancement, mandatory public stale-write preconditions, consistent detail reads, persisted draft revisions and lifecycle/legacy compatibility regressions (#9, stale-write increment).
- [x] T061 [US1] Isolate draft/preset ownership and Schedule caches by actor and scope, reject old workspace callbacks, quarantine unowned legacy edits, and verify desktop/mobile recovery (#9).
- [ ] T013 [US1] Add validated complete roster and revision/command receipt contracts with additive schema/migration in packages/contracts/src/scheduling.ts and packages/db/src/schema/scheduling.ts (#9).
- [ ] T014 [US1] Enforce expected revision and idempotency across writers in apps/api/src/scheduling/; persist actor-scoped uncertain intents/reconciliation in schedule-management/model/store.ts and use-workspace.ts (#9).
- [ ] T015 [US1] Verify employee beyond 200, filtered metadata preservation, real-DB concurrent stale saves, uncertain duplicate retry and session isolation in scheduling/schedule.service.test.ts and schedule-management tests (#9).

## Phase 6: Master authority — #8

**Story**: US1 | **Dependencies**: D-01/#7 | **Checks**: all issue acceptance; mapped SC/AC/UX in acceptance.md.

- [ ] T016 [US1] Refine accepted actor/zone/action matrix in spec.md; implement commit-time grant/scope checks in apps/api/src/scheduling/ and packages/domain/src/access/ (#8).
- [ ] T017 [US1] Enable only accepted scoped proposal/prepare/submit UI through schedule-management/model/ and approval owner (#8).
- [ ] T018 [US1] Test direct API denied scopes, withdrawn grants, field privacy, publication and attendance boundaries in apps/api/src/scheduling/ tests (#8).

## Phase 7: Cross-month periods — #10

**Story**: US1 | **Dependencies**: D-05/#9 | **Checks**: all issue acceptance; mapped SC/AC/UX in acceptance.md.

- [ ] T019 [US1] Define coordinated version command and complete day/week/fortnight/month read contracts in packages/contracts/src/scheduling.ts (#10).
- [ ] T020 [US1] Implement all-version transaction/locks and range projection in apps/api/src/scheduling/ and schedule-management/model/calendar.ts (#10).
- [ ] T021 [US1] Test month/year/DST, hidden assignments, scope denial, one stale version and all-version rollback using real DB and calendar model tests (#10).

## Phase 8: Demand and qualifications — #11

**Story**: US2 | **Dependencies**: D-02/#9 | **Checks**: all issue acceptance; mapped SC/AC/UX in acceptance.md.

- [ ] T022 [US2] Define dated owner/audit/expiry contracts and additive demand/qualification schema in packages/contracts/src/scheduling.ts and packages/db/src/schema/scheduling.ts (#11).
- [ ] T023 [US2] Implement audited configuration and time/role coverage in apps/api/src/scheduling/, packages/domain/src/scheduling/ and schedule-management/ (#11).
- [ ] T024 [US2] Test unknown norms, 4 required/3 eligible, partial interval gaps, expiry, role uniqueness and unauthorized configuration in domain and scheduling tests (#11).

## Phase 9: Eligibility — #12

**Story**: US2 | **Dependencies**: D-03/#10/#11 | **Checks**: all issue acceptance; mapped SC/AC/UX in acceptance.md.

- [ ] T025 [US2] Define one full-plan evaluation with stable eligible/warning/blocked/unknown reasons in packages/domain/src/scheduling/ and packages/contracts/src/scheduling.ts (#12).
- [ ] T026 [US2] Implement overlap serialization, rest/hour configuration, dated preferences, complete candidate evaluation and explanations in apps/api/src/scheduling/ and schedule-management/ (#12).
- [ ] T027 [US2] Test concurrent cross-unit overlap, adjacency, boundary periods, full-batch conflicts, expired qualifications/absence and stale evidence using real DB and pure tests (#12).

## Phase 10: Open slots and interest — #13

**Story**: US2 | **Dependencies**: D-06/#7/#12 | **Checks**: all issue acceptance; mapped SC/AC/UX in acceptance.md.

- [ ] T028 [US2] Define internal slot/offer/interest/selection transitions and SQL invariants in packages/db/src/schema/scheduling.ts and packages/contracts/src/scheduling.ts (#13).
- [ ] T029 [US2] Implement deliberate offers, audience/approval checks, atomic selection and existing durable bot communication in apps/api/src/scheduling/, apps/worker/src/ and schedule-management/ (#13).
- [ ] T030 [US2] Test simultaneous selection, cancellation/re-offer, stale audience/eligibility and delivery retry preserving losing draft and response history (#13).

## Phase 11: Patterns and accessible moves — #14

**Story**: US1 | **Dependencies**: #9/#10/#12 | **Checks**: all issue acceptance; mapped SC/AC/UX in acceptance.md.

- [ ] T031 [US1] Add versioned saved-pattern contracts/persistence and exact occurrence/range/fill/replace diff in scheduling and schedule-management/model/planning.ts (#14).
- [ ] T032 [US1] Connect drag and explicit Move to the same evaluated intent and preview in shared/ui/resource-calendar/ and schedule-management/ui/ (#14).
- [ ] T033 [US1] Test full-result conflicts, hidden records, inactive refs, undo/recovery and keyboard/touch parity in schedule-management model/UI tests (#14).

## Phase 12: Custom time and segments — #15

**Story**: US3 | **Dependencies**: D-04/#10/#12 | **Checks**: all issue acceptance; mapped SC/AC/UX in acceptance.md.

- [ ] T034 [US3] Specify parent/segment identities, break/gap semantics and additive stable-history migration in scheduling contracts/schema; inventory dependent attendance/reminder/report consumers (#15).
- [ ] T035 [US3] Implement whole/part preview, stored custom intervals/provenance and compatible consumer behavior in scheduling, domain, schedule-management and affected worker/attendance files (#15).
- [ ] T036 [US3] Test midnight/DST, parent/hidden segment duration, stable historical assignment links, custom reminder/admission/closure and old-writer compatibility using DB/worker/UI tests (#15).

## Phase 13: Workload and relief — #16

**Story**: US3 | **Dependencies**: D-04/#12/#15 | **Checks**: all issue acceptance; mapped SC/AC/UX in acceptance.md.

- [ ] T037 [US3] Implement planned break/relief intervals and explicit cohort/units workload model in packages/domain/src/scheduling/ and scheduling contracts/schema (#16).
- [ ] T038 [US3] Expose break editing and distribution without fairness verdict or actual-event changes in schedule-management/model/ and ui/ (#16).
- [ ] T039 [US3] Test coverage loss during break, valid relief, no double relief, omitted-break preservation and reporting-period hours in domain/API/UI tests (#16).

## Phase 14: Operational context — #17

**Story**: US2 | **Dependencies**: D-06/#8/#12/#13 | **Checks**: all issue acceptance; mapped SC/AC/UX in acceptance.md.

- [ ] T040 [US2] Expose scoped absence/presence/request context through owning APIs in apps/api/src/requests/ and scheduling; preserve unknown freshness/private fields (#17).
- [ ] T041 [US2] Compose public Requests/Operations APIs above features; atomic swap/borrowing decisions and source coverage in apps/api/src/requests/ and scheduling (#17).
- [ ] T042 [US2] Verify current approval step, approved/pending/rejected privacy, missing-QR unknown, two-sided swap and borrowing rollback with real DB and affected worker/UI tests (#17).

## Phase 15: Records and output — #18

**Story**: US3 | **Dependencies**: #10/#15/#17 | **Checks**: all issue acceptance; mapped SC/AC/UX in acceptance.md.

- [ ] T043 [US3] Define scoped note/typed-field audiences and versioned historical values plus permitted record links in scheduling contracts/schema and schedule-management/ (#18).
- [ ] T044 [US3] Implement complete authorized retrospective print/export with identity/timezone/version/units and formula-safe cells in scheduling and schedule-management/ (#18).
- [ ] T045 [US3] Test long text, hidden/private data, complete output beyond pagination, unknown actual departure and historical field/template changes in API/model/UI tests (#18).

## Phase 16: Personal feeds and proposals — #19

**Story**: US3 | **Dependencies**: #12/#13/#18 | **Checks**: all issue acceptance; mapped SC/AC/UX in acceptance.md.

- [ ] T046 [US3] Implement own-published-only stable calendar identities and hashed revocable personal feed access in scheduling schema/contracts/API (#19).
- [ ] T047 [US3] Implement explainable allocation on existing slots with complete-plan revalidation and human-edited/rejected preview in domain/scheduling/schedule-management (#19).
- [ ] T048 [US3] Test revoked/private feed, stable updates, unresolved slots, hard-constraint precedence, stale proposal and no auto-publication in API/domain/UI tests (#19).

## Phase 17: Forecasts and costs — #20

**Story**: US4 | **Dependencies**: D-07/actual data and contracts | **Checks**: all issue acceptance; mapped SC/AC/UX in acceptance.md.

- [ ] T049 [US4] Record separate go/defer/reject for SC-46–49 in spec.md and existing issue #20 with actual sources/systems/owners (#20).
- [ ] T050 [US4] For each approved extension refine bounded input/rate/currency/reconciliation/retry contract in plan.md, then implement owning API/domain/UI boundary; no guessed values (#20).
- [ ] T051 [US4] Run accepted financial/privacy/integration invariants and independent review; keep unapproved remainder open in acceptance.md and #20 (#20).

## Phase 18: Rollout and acceptance — #54

**Story**: US5 | **Dependencies**: All agreed children; #20 only accepted extensions | **Checks**: all issue acceptance; mapped SC/AC/UX in acceptance.md.

- [ ] T052 [US5] Maintain SC/AC/UX/twelve-scenario evidence matrix in acceptance.md and versioned cutover/recovery runbook in docs/runbooks/schedule-calendar-rollout.md (#54).
- [ ] T053 [US5] Verify integrated desktop/mobile/worker journeys, migrations/lineage and single compatible writer; execute real participant comparison and explicitly selected unit pilot (#54).
- [ ] T054 [US5] Record go/hold, exact supported capabilities, CI/release/announcement/deployed evidence in existing feature docs and issues; close only fully accepted scope (#54).

## Delivery and handoff

- [x] T055 Read all 18 live children, dependencies, repository conventions and current Schedule code; record source-inventory.json.
- [x] T056 Complete spec/plan/tasks coverage analysis for independent stage and record gated policies in spec.md.
- [ ] T059 Review each high-risk fixed diff independently, run remaining affected checks, commit only owned paths and push master through existing CI/release/announcement.
- [ ] T060 Update product/engineering docs and existing issues with exact evidence and final scope; converge repeatedly until agreed requirements pass.

## Dependencies and handoff

Begin T004–T006 prototype and T052 matrix/runbook while policy answers and human baseline are pending. First stage preserves existing roles/templates/month writes. Resume from the first unchecked task whose prerequisites are met. Read .specify/feature.json and explicitly select this directory for every skill helper. T055 is recon only, not runtime proof.
