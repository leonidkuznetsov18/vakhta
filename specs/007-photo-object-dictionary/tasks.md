# Tasks: Photo object dictionary

**Input**: [spec.md](spec.md), [plan.md](plan.md)
**Authority**: Owner request | **Writer / index owner**: root Codex | **Checkout**: master
**Evidence**: [Photo inspection dataset](../../docs/engineering/features/photo-inspection-dataset.md)

## Phase 1: Shared research and contracts

- [x] T001 Complete primary-source comparison and live API evidence in `specs/007-photo-object-dictionary/research.md`; define bounded dictionary contracts and regression tests in `packages/contracts/src/photo-object-dictionary.ts` and `photo-object-dictionary.test.ts` (FR-001–009).

## Phase 2: US1 — Find the intended object

- [x] T002 [US1] Implement free dictionary search/details, reviewed multilingual seeds, bounded requests/cache/cooldown and provider regressions in `apps/api/src/photo-inspection/photo-object-dictionary*.ts`; register guarded endpoints in the existing module/controller (AC-001/002/004).
- [x] T003 [US1] Implement accessible localized dictionary picker and explicit English manual entry in `apps/admin-web/src/features/checklist-photo-rules/ui/` with Query API/model ownership and focused component tests; update all three `packages/i18n/src/` catalogs (AC-001–004/011).

## Phase 3: US2 — Review and preserve enrichment

- [x] T004 [US2] Preserve structured snapshots, existing notes/IDs and meaningful dirty/revert behavior in `packages/contracts/src/checklist-photo-rules.ts` and `apps/admin-web/src/features/checklist-photo-rules/model/rules-draft.ts`; integrate editable variants/read-only details into rule UI and add regressions (AC-005–008).

## Phase 4: US3 — Send the saved English meaning to AI

- [x] T005 [US3] Carry English enrichment through existing API persistence and immutable admission snapshots; update `apps/worker/src/photo-inspection/gemma.ts`, prompt version and focused API/worker tests (AC-009/010).

## Phase 5: Verification and delivery

- [x] T006 Run affected contract/API/panel/worker checks and capture/inspect desktop/mobile Administration screenshots; record live provider versus fixture evidence and independent review in `docs/engineering/features/photo-inspection-dataset.md` (AC-001–011).
- [x] T007 Update `docs/features/photo-inspection.md` and existing engineering memory with research decisions, Lean review and limitations; run Spec Kit convergence against this spec/plan and append only demonstrated gaps to `specs/007-photo-object-dictionary/tasks.md`.
- [ ] T008 Deliver task-owned changes through one normal commit/push to `origin master`, verify CI/release/announcement and relevant deployed endpoint, and reconcile GitHub tasks with evidence in `specs/007-photo-object-dictionary/issues.md`.

## Dependencies and Handoff

T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008. Read-only research/review may run independently; all writes/index operations are serialized. Existing `.claude/launch.json` is unrelated. Never mark checks complete from task checkboxes alone. No PRs, branches or worktrees. Plan and scope consistency reviewed before implementation: each of nine functional requirements maps to a story/verification task; English storage and legacy identity have distinct acceptance cases.
