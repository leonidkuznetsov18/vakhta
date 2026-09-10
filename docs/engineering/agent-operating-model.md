# Agent operating model

Use roles to define responsibility, not five mandatory meetings for every edit. For non-trivial work,
follow RECON → SPEC → DESIGN → IMPLEMENT → VERIFY → HARDEN → REPORT. The approved request and recorded
acceptance criteria form the implementation authority. A small docs correction needs only a scoped
writer and proportional review.

| Role                | Input and permitted work                                                                                                     | Output and handoff                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Architect/Planner   | Inspect source, request and constraints; write specification/design only. No implementation code.                            | Accepted criteria, non-goals, FSD/backend placement, risks, test plan and allowed files.            |
| Implementer         | Execute accepted scope inside one feature boundary and one worktree; write implementation and developer tests.               | Fixed base/head, change summary, criteria evidence, questions and regression results.               |
| QA/Test-writer      | Independently derive cases from criteria and gaps; add tests in a separate worktree, reproduce failures, test user journeys. | Reproduction evidence, independent regression commit, limitations and tested revision.              |
| Reviewer            | Inspect fixed diff plus spec, run proportionate checks; do not silently expand or rewrite implementation.                    | Blockers mapped to criteria, architecture/type/access/async concerns, DoD verdict.                  |
| Lean/Process Expert | Analyze delivery metadata, workflow definitions and handoff artifacts only. Does not implement or review application code.   | Separate measured value stream, ranked waste, concrete tooling changes and before/after comparison. |

Scoped prompts live in `.codex/roles/`. They are handoff instructions, not an automatically installed
agent runtime configuration. Keep inherited model settings unless the owner requests a specific model.
The existing `vakhta-lean-review` skill remains a **manufacturing product/workflow advisor**. It examines
worker value and UX; the delivery Lean expert examines how engineering work moves through this repo.

## Session boundaries

Architect and Implementer may be successive explicitly scoped phases of one session when the spec is
small and context is healthy; the Architect phase must finish before code starts. Independent QA and
review use a fresh-context subagent or separate task after a fixed implementation revision exists.
The Lean expert uses a separate scoped context because its evidence and responsibilities differ.
Parallel read-only discovery is useful; parallel writers need separate worktrees and disjoint ownership.

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

## GitHub review integration

Recommend enabling Codex Code Review and Automatic Reviews for this repository once the PR workflow
is used. Current account-level enablement was not verified; no setting was changed in this setup.
Root/nested `AGENTS.md` encode review rules. AI findings supplement deterministic checks and domain
review; they do not establish a required GitHub check by themselves. Configure branch rules separately.
[Official GitHub integration](https://learn.chatgpt.com/docs/third-party/github).

## Lean cadence

Run after 20 merged PRs or monthly, whichever comes first; until PR adoption, use 20 completed CI runs
as the sample trigger. This is an operating recommendation, not an automation installed by this PR.
Use the same sampling definitions, compare the prior report and metric JSON, and mark each recommendation
implemented / pending / rejected with evidence. Do not claim savings from overlapping CI jobs as if
all job-seconds were developer waiting. Missing timestamps are a measurement gap, not a zero duration.
