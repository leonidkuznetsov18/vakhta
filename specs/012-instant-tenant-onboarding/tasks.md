# Tasks: Instant tenant onboarding

**Input**: spec.md and plan.md | **Authority**: owner request 2026-09-22
**Writer / index owner**: root Codex | **Checkout**: master
**Evidence**: [Multi-tenant platform](../../docs/engineering/features/multi-tenant-platform.md)

## User Story 1: Automatic provisioning

- [x] T001 [US1] Inspect current provider/source behavior and write specs/012-instant-tenant-onboarding/spec.md and plan.md (AC-001–008).
- [x] T002 [US1] Add gateway transport tests and implementation in apps/tenant-gateway/src/ and asset packaging (AC-001/002/007/008).
- [x] T003 [US1] Update apps/control-api/src/provisioning/steps/surface.steps.ts and config/env.ts for verified wildcard readiness and bounded recovery (AC-001/004/008).
- [x] T004 [US1] Separate bot activation from core provisioning in apps/control-api/src/provisioning/provisioning.service.ts and runner.ts, with real PostgreSQL regressions (AC-003/004).
- [x] T005 [US1] Eliminate new-tenant discovery waits in apps/api/src/infra/tenant-runtime.ts and control public source handling with bounded refresh tests (AC-005).

## User Story 2: Secure routing and compatible delivery

- [x] T006 [US2] Implement gateway authentication/effective host in apps/api/src/infra/tenant-hook.ts and gateway helper; extend tenancy.e2e.test.ts (AC-006/007).
- [x] T007 [US2] Integrate gateway build/deploy in .github/workflows/ci.yml and .railway/railway.ts; preserve existing hosts and announcement flow (AC-002/008).
- [x] T008 [US2] Run scoped type/lint/build/tests and independent review of apps/tenant-gateway, API trust and control provisioning (AC-001–008).

## User Story 3: Live creation benchmark

- [ ] T009 [US3] Deliver tested source and configure wildcard gateway/TLS with safe rollout per docs/runbooks/platform-operations.md (AC-002/008).
- [ ] T010 [US3] Create a labeled QA tenant through Control; measure submit/readiness/welcome/first-login and inspect desktop/mobile screenshots in ignored test-results/tenant-onboarding/ (AC-009/010).
- [ ] T011 [US3] Record durations, manual steps, provider-operation count and QA tenant disposition in docs/engineering/features/multi-tenant-platform.md (AC-009/010).

## Delivery and Evidence

- [ ] T012 Update docs/features/multi-tenant-platform.md and docs/runbooks/platform-operations.md with verified behavior; run speckit-converge against these artifacts.
- [ ] T013 Complete task-owned master delivery and inspect CI/release/deployment/announcement outcomes; report remaining blockers honestly.

## Dependencies and Handoff

T002/T006 establish gateway transport; T003–005 establish core readiness. T007 and T008 precede
T009; T010 follows verified deployment; T011–013 close evidence/convergence. All writes sequential.
Read-only research/review may overlap root work as required by Spec Kit and risk-based review.
Other sessions own bonus/contracts edits; do not stage them. Coordinate before push/deployment.

## Convergence

Source implementation reviewed; deployment and timed browser acceptance remain open. Append only demonstrated remaining gaps.
