# Vakhta onboarding: recon, audit and setup

> Owner update, later on 2026-09-10: the direct-master/current-repository workflow in
> [AGENTS.md](../../../AGENTS.md) supersedes this audit's PR, branch-protection and worktree proposals.
> The audit worktree was removed after its commit was preserved in master. Historical measurements
> remain valid for their recorded sample. Use [the current operating model](../../engineering/agent-operating-model.md).


Date: 2026-09-10. Inspected baseline: `08979de0c9c9c72b79bd03f74c2b8b500cf438ad`.
Prepared in isolated branch `codex/recon-audit-setup`; the other active checkout was left to its owner.
This package contains findings and engineering setup, not a business implementation or rewrite.

## 1. RECON summary — observed facts

Vakhta records employee presence, shifts, activity intervals and related production workflows through
Telegram, an admin panel and paired QR kiosks. It has four apps and five packages: NestJS/Fastify API,
standalone BullMQ worker, React 19/Vite panel, vanilla Vite kiosk, and shared domain/contracts/DB/i18n/config.
The pure FSM and transactional event/history constraints are important existing boundaries.

pnpm 10.9.0, Node 22, Turborepo and strict TypeScript are already configured. React Compiler, TanStack
Query, Zustand, Tailwind and copied shadcn primitives exist. FSD ownership is partial; table and routing
are custom, and some screen logic remains in components. Next.js/RSC are absent.

The syntax inventory found no explicit TypeScript `any` nodes or suppression directives in the inspected
373 TS/TSX files, but found 12 nested assertions (five production, seven tests) and 379 non-null assertions,
including tests. The panel has 110 direct calls to the four locally prohibited hooks in 36 files,
including eight calls in copied primitives. These counts are debt inventory, not automatic defect counts.

CI builds, typechecks, lints, formats and tests. Read-only GitHub inspection found an unprotected `master`,
no rulesets and zero PRs in the all-state inventory. The sample contains 100 workflow runs; the Lean report
uses 90 successful first-attempt CI runs for comparable timing. All 91 successful sampled CI runs skipped
both Pages upload steps. This does not establish how an independent frontend hosting integration behaves.

Full factual evidence, state ownership, package boundaries, history and test details:
[Architecture audit, section 1](architecture-audit.md#1-recon--facts-only).

## 2. AUDIT and migration risk

[Architecture and Codebase Audit](architecture-audit.md) compares actual source with each target standard,
assigns migration risk, identifies specific files and separates source-inferred risks from reproduced
failures. Preserve Nest modules and the pure domain; migrate frontend FSD by coherent slices.
React 19 still supports the four hooks: the ban is this project's policy, not a framework deprecation.
React Compiler does not replace subscription cleanup or asynchronous ownership.

Correctness investigations precede UI cleanup: session/cache isolation, terminal/schedule stale replies,
Telegram dedup recovery and committed shift side effects. HTTP/stored-data parsing, typed UI state,
mobile/browser proof and explicit slice APIs follow. No observed bundle size is presented as a latency
benchmark, and no test count is presented as a coverage percentage.

## 3. Files created or updated

Paths below are relative to the repository root. All files are part of this local change; a hosted PR
and remote settings are not created merely by adding them.

| File                                           | Purpose                                                                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` (updated)                          | Reconciled root rules, ordered priorities, SPEC OPS, scoped ownership, Definition of Done, async/review and commit rules; below 300 lines |
| `packages/domain/AGENTS.md`                    | Pure domain and Node-export boundary rules                                                                                                |
| `apps/api/AGENTS.md`                           | Nest injection, validated input, scope and transaction constraints                                                                        |
| `apps/worker/AGENTS.md`                        | Standalone worker, job validation and non-atomic delivery constraints                                                                     |
| `apps/qr-kiosk/AGENTS.md`                      | Vanilla kiosk, pairing and stale challenge response boundaries                                                                            |
| `CONTRIBUTING.md`                              | Actual toolchain/check commands, worktrees and existing release conventions                                                               |
| `.github/PULL_REQUEST_TEMPLATE.md`             | Problem, specification, verification and risk evidence for small PRs                                                                      |
| `docs/templates/spec.md`                       | Bounded problem, acceptance criteria, ownership, design and test handoff                                                                  |
| `.codex/setup.sh`                              | Executable draft for pinned install/build and optional Docker image preload                                                               |
| `.codex/memory.md`                             | Capped append-only architectural decisions and open questions with archive rule                                                           |
| `.codex/roles/architect.md`                    | Specification/design-only role prompt                                                                                                     |
| `.codex/roles/implementer.md`                  | Accepted-scope implementation role prompt                                                                                                 |
| `.codex/roles/reviewer.md`                     | Independent fixed-revision review role prompt                                                                                             |
| `.codex/roles/qa.md`                           | Independent regression and journey verification role prompt                                                                               |
| `.codex/roles/lean-process-expert.md`          | Delivery-system measurement role; no business-code implementation/review                                                                  |
| `docs/engineering/agent-operating-model.md`    | Role sequencing, scoped subagents/tasks, handoff and review settings proposal                                                             |
| `docs/engineering/cloud-environment.md`        | Setup/runtime network requirements and unverified hosted Docker limitations                                                               |
| `docs/engineering/testing-baseline.md`         | Existing tests, missing layers and five urgent regression targets                                                                         |
| `docs/audits/2026-09-10/README.md`             | This seven-part audit index and validation record                                                                                         |
| `docs/audits/2026-09-10/architecture-audit.md` | Factual recon, gap matrix, risk and source citations                                                                                      |
| `docs/audits/2026-09-10/lean-bottlenecks.md`   | Independent Lean/Process Expert's value stream and actionable waste report                                                                |
| `docs/audits/2026-09-10/lean-metrics.json`     | Per-run observations, measurement definitions and comparable aggregates                                                                   |
| `docs/audits/2026-09-10/migration-backlog.md`  | Small ordered follow-up PRs with size, dependencies and rationale                                                                         |
| `docs/README.md` (updated)                     | Discoverable links to this audit and new engineering guidance                                                                             |

The existing `CLAUDE.md` adapter, manufacturing Lean skill, 1Password QA runbook and feature memories
remain authoritative where applicable. Product-facing feature documents are not used as a dump for
engineering audit internals because the support assistant reads them.

## 4. Multi-agent operating model

[Operating model](../../engineering/agent-operating-model.md): Architect defines accepted scope;
Implementer owns one bounded change; independent QA derives regressions; a fresh Reviewer checks a
fixed integrated revision. A separately scoped Lean expert examines delivery evidence, not business
code. The existing manufacturing Lean advisor continues to evaluate employee workflow and effort.

Codex supports scoped parallel subagents in this environment. Roles are not persistent workers, and
Markdown prompts do not install or schedule them. Separate worktrees isolate concurrent writers;
user-visible separate tasks require explicit user direction. Recommend Codex Code Review/Automatic
Reviews alongside deterministic branch checks; account enablement was not inspected or changed.

## 5. Lean report

[Standalone Lean report](lean-bottlenecks.md) was produced by the dedicated process role from workflows,
Git history and read-only GitHub runs/jobs/steps. It contains the value stream, all seven requested
software-waste categories, evidence limits, quick wins, structural fixes and repeat measurement policy.

For 90 comparable successful first attempts, median CI elapsed is 401.5 s and median check duration
222.5 s. The top five observed duration burdens are tests (12,389 step-seconds), image tail (7,560 elapsed
seconds), release (2,635 job-seconds), check queue (2,265 elapsed seconds) and Pages builds (2,257
step-seconds). They overlap, so they are neither additive savings nor developer labor measurements.
Human idea/spec/implementation/review touch times, PR review rounds and live Railway deployment duration
are unavailable. Required checks and deployment provenance outrank speed experiments.

## 6. Prioritized backlog

[Migration backlog](migration-backlog.md) orders individually reviewable follow-ups by correctness,
then measured time/effort, then low-to-high structural migration risk. It includes sizes, acceptance
outcomes and source targets. Begin with required integration checks, deployment truth and the five
regression investigations. Cheap formatting/timing/cache improvements precede lower-impact FSD cleanup.
A monthly or 20-PR comparison is proposed; no recurring automation is installed.

## 7. Verification and unchanged scope

Executed locally against the isolated baseline plus docs/setup changes:

- `pnpm install --frozen-lockfile`: passed; the lockfile remains unchanged.
- `pnpm build`: passed; Vite reports a large-chunk warning, documented in the architecture audit.
- `pnpm check`: passed on the final setup tree, including formatting; test tasks reused the verified cache.
- `pnpm exec turbo run test --force`: passed, 10 tasks, zero cached, 66 test files / 362 tests.
  Test-task elapsed time was 75.967 s on this local machine; it is not a comparable hosted CI benchmark.
- `bash -n .codex/setup.sh`: passed. `bash .codex/setup.sh`: frozen install/build completed locally;
  optional container preloading was not enabled. This does not prove a Codex Cloud deployment exists.

Final Prettier checks, local Markdown target validation and `git diff --check` passed. An independent
Reviewer verified setup safety, scope, source consistency and every Lean timing aggregate; no blocking
findings remain. The final diff contains only the 24 documented Markdown/JSON/setup files.
No coverage percentage was generated. This setup pass did not repeat the earlier live panel/bot/kiosk
QA; real camera-to-Telegram and inline-button evidence remains limited as recorded in its feature memory.

Business logic, public APIs/callback codes, DB schema/migrations, UI behavior, dependencies/lockfile and
existing test expectations are unchanged. GitHub branch protection, Codex account settings, production
configuration, deployments, announcements, credentials and employee records were not modified. These
require separately scoped implementation or owner-applied settings, and altering them would invalidate
a clean recon baseline. Local artifacts and their test results do not certify the deployed revision.
