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

- [x] T009 [US3] Deliver tested source and configure wildcard gateway/TLS with safe rollout per docs/runbooks/platform-operations.md (AC-002/008).
- [ ] T010 [US3] Create a labeled QA tenant through Control; measure submit/readiness/welcome/first-login and inspect desktop/mobile screenshots in ignored test-results/tenant-onboarding/ (AC-009/010).
- [x] T011 [US3] Record durations, manual steps, provider-operation count and QA tenant disposition in docs/engineering/features/multi-tenant-platform.md (AC-009/010).

## Delivery and Evidence

- [x] T012 Update docs/features/multi-tenant-platform.md and docs/runbooks/platform-operations.md with verified behavior; run speckit-converge against these artifacts.
- [ ] T013 Complete task-owned master delivery and inspect CI/release/deployment/announcement outcomes; report remaining blockers honestly.

## Dependencies and Handoff

T002/T006 establish gateway transport; T003–005 establish core readiness. T007 and T008 precede
T009; T010 follows verified deployment; T011–013 close evidence/convergence. All writes sequential.
Read-only research/review may overlap root work as required by Spec Kit and risk-based review.
Other sessions own bonus/contracts edits; do not stage them. Coordinate before push/deployment.

## Convergence

Source and live gateway deployment verified. Timed core creation and missing-bot task correction
verified. Browser first-login acceptance and recurring gateway CI publication remain open; see the
engineering evidence and convergence tasks below.

## Owner correction

- [x] T014 Restore an outstanding Add bot token task for enabled WORKER_BOT without a token, including existing tenants; cover token save, disabled modules and preserved completed jobs in control-web workspace regressions; inspect desktop/mobile production UI (AC-003).

## Phase 1: Convergence

Reviewed 5 functional requirements, 10 acceptance criteria, 4 success criteria, 6 design decisions
and 5 constitution principles. Two HIGH partial findings; no missing/contradicting/unrequested
application behavior remains in the reviewed scope. No extension hooks are installed.

- [ ] T015 Install the prepared account-scoped Workers Scripts token in GitHub production secrets after the owner's explicit browser confirmation, enable TENANT_GATEWAY_ENABLED, and verify a CI gateway publication per plan: shared asset delivery and AC-008 (partial).
- [ ] T016 Finish authenticated desktop/mobile browser acceptance after the extension handoff, repeat a clean end-to-end creation measurement after correcting local production build inputs, and update the existing engineering evidence per FR-005 / AC-009/010 / SC-002/003 (partial).
