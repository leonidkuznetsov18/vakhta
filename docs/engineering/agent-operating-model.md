# Agent operating model

Use roles to define responsibility, not five mandatory meetings for every edit. For non-trivial work,
follow RECON → SPEC → DESIGN → IMPLEMENT → VERIFY → HARDEN → REPORT. The approved request and recorded
acceptance criteria form the implementation authority. A small docs correction needs only a scoped
writer and proportional review. Select the current role's skills from [the skill guide](skills.md).
Roles describe responsibility; skills supply reusable expertise. Neither implies a separate agent
or a mandatory handoff for every edit.

| Role                | Input and permitted work                                                                                                             | Output and handoff                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Architect/Planner   | Inspect source, request and constraints; write specification/design only. No implementation code.                                    | Accepted criteria, non-goals, FSD/backend placement, risks, test plan and allowed files.            |
| Frontend Developer  | Implement React/Vite features, FSD slices, state and accessible interaction within accepted scope.                                   | Working frontend changes and focused regression evidence.                                           |
| Backend Developer   | Implement Nest/Fastify modules, pure domain rules, worker flows and database changes within accepted scope.                          | Validated contracts, preserved invariants and relevant integration evidence.                        |
| UI/UX Designer      | Design information hierarchy, interactions, responsive layouts and accessible visual states for the affected surface.                | Reviewable design, implementation guidance and inspected desktop/mobile evidence.                   |
| QA/Test-writer      | Independently derive cases from criteria and gaps; add tests during an exclusive write turn, reproduce failures, test user journeys. | Reproduction evidence, independent regression commit, limitations and tested revision.              |
| Reviewer            | Inspect fixed diff plus spec, run proportionate checks; do not silently expand or rewrite implementation.                            | Blockers mapped to criteria, architecture/type/access/async concerns, DoD verdict.                  |
| Lean/Process Expert | Analyze delivery metadata, workflow definitions and handoff artifacts only. Does not implement or review application code.           | Separate measured value stream, ranked waste, concrete tooling changes and before/after comparison. |

Scoped prompts live in `.codex/roles/`. They are handoff instructions, not an automatically installed
agent runtime configuration. Keep inherited model settings unless the owner requests a specific model.
Frontend and Backend Developers use the shared Implementer handoff contract. UI/UX design and QA use
their own skills; they are not Lean reviews. The `vakhta-lean-review` skill provides high-level
manufacturing/product-process expertise only when the owner requests a Lean assessment. The delivery
Lean expert examines engineering flow only when that distinct analysis is requested. Neither is an
automatic design, implementation or completion stage.

## Session boundaries

Architect and Implementer may be successive explicitly scoped phases of one session when the spec is
small and context is healthy; the Architect phase must finish before code starts. Simple changes need
no separate roles or review cycle. High-risk changes use one independent fresh-context reviewer after
a fixed implementation revision exists, following `testing-baseline.md`. Separate QA is needed only
for a concrete evidence gap; it is not a mandatory extra stage for every change.
When requested, the Lean expert uses a separate scoped context because its evidence and responsibilities differ.
Parallel read-only discovery is useful. All writes occur sequentially in the current repository on
`master`; no PRs, additional worktrees or topic branches. Explicitly hand over owned files and the index
before another writer starts, and never include another task's uncommitted edits in your commit.

The assumption that Codex cannot run parallel agents is outdated for this environment: its collaboration
tools support scoped subagents, and official documentation describes this capability. Subagents are
bounded work units, not persistent autonomous employees. A role prompt or Markdown file does not keep
an agent alive. Use separate user-visible tasks only when explicitly requested; otherwise use available
subagents for bounded delegation or run roles sequentially when delegation is unavailable.
[Official subagent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents).

## Handoff contract

Every handoff includes: purpose/spec link, baseline and head commit, owned paths, decisions, unresolved
questions, tests with outcomes, and the next required action. Return evidence summaries rather than raw
logs. The integration owner updates the capped append-only `.codex/memory.md`; feature details remain
in `docs/engineering/features/`. Do not edit another agent's files, index or Git history.

Reviewer and QA inspect the integrated revision if their inputs changed. Avoid requiring a second
full test run when no relevant source or environment changed; identify exactly what needs rechecking.
Do not serialize independent reading behind permission questions already answered by the accepted spec.

## Direct-master review and delivery

The owner selected direct pushes to `master` on 2026-09-10, superseding the audit's PR-first proposal.
Review the task-owned fixed diff in a fresh context before committing/pushing; use read-only scoped
reviewers and sequential QA writes in this same checkout. Codex PR Automatic Reviews are not part of
this workflow. Do not create a PR or enable PR-required branch rules to obtain automated review.
Focused local checks and post-push CI remain required as specified in `testing-baseline.md`. Reuse
the implementer's valid results; do not repeat a full suite or review at each handoff. Batch related
commits into a coherent push, with no extra delivery for intermediate documentation. Preserve existing
semantic-release and Telegram changelog delivery; record deployment evidence once in the feature memory.

## Requested Lean follow-up

There is no automatic Lean cadence. Agree on a follow-up only when the owner requests a Lean process
assessment; elapsed time and completed CI counts do not activate the expert. Measure
commit/push/check/release/deploy stages; PR timing is inapplicable
to the selected direct-master workflow.
Use the same sampling definitions, compare the prior report and metric JSON, and mark each recommendation
implemented / pending / rejected with evidence. Do not claim savings from overlapping CI jobs as if
all job-seconds were developer waiting. Missing timestamps are a measurement gap, not a zero duration.
