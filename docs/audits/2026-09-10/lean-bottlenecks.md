# Lean delivery bottleneck audit

> Owner update, later on 2026-09-10: the direct-master/current-repository workflow in
> [AGENTS.md](../../../AGENTS.md) supersedes this audit's PR, branch-protection and worktree proposals.
> The audit worktree was removed after its commit was preserved in master. Historical measurements
> remain valid for their recorded sample. Use [the current operating model](../../engineering/agent-operating-model.md).

Date: 2026-09-10. Role: Lean/Process Expert. Baseline: `08979de`.
Scope: the engineering delivery system, not business-code review or production operations.
Recommendation: **Simplify and measure**, while adding the missing correctness gates first.

## Evidence and measurement contract

Read actual workflow/configuration files, commit history, existing engineering memories, GitHub
Actions jobs/steps and failed-run logs. Collection was read-only; no remote settings, deployment,
messages, credentials or business behavior changed. Reproducible observations and aggregates are in
[lean-metrics.json](lean-metrics.json). Workflow sources below are pinned to the inspected commit.

- GitHub returned 155 workflow runs in total; this audit samples the newest 100, created between
  **2026-09-06 19:26:12 UTC and 2026-09-10 09:47:59 UTC**. Of these, 96 are CI/CD push runs:
  91 successful, two failed, two cancelled and one unfinished at collection. Four successful
  scheduled backup runs are excluded from delivery timing.
- Job/step metadata was retrieved for all 95 completed CI/CD runs. The common timing population
  below is **90 successful first-attempt runs**. The one successful rerun is excluded so its initial
  creation timestamp does not masquerade as runner queue time. Failures are analyzed separately.
- Git history from September 6 through the baseline contains 240 commits, including 103 `chore`,
  71 `feat`, 35 `fix`, ten `refactor` and four `revert` subjects. These are classification counts,
  not 240 independent features or 35 escaped defects. Author/committer timestamps can change during
  rebases; they do not measure development effort.
- The all-state PR endpoint returned **zero PRs**. Branch protection returned HTTP 404 with
  `Branch not protected`; repository rulesets returned `[]`. The default branch is `master`.
  There is no observed PR lead-time or review-round population. This does not prove nobody reviews
  work outside GitHub.

Elapsed CI time, accumulated job/step seconds and human touch time are different measures. All human
touch times are unavailable. `updated_at - created_at` is a workflow completion proxy; job timings
use `completed_at - started_at`. Queue time is run creation to check-job start and cannot separate
runner availability from concurrency waiting. P90 uses nearest rank. Parallel jobs and nested steps
overlap: **do not sum the bottleneck rows or present them as hours of developer time saved**.

The [Lean Enterprise Institute's value-stream mapping guidance](https://www.lean.org/lexicon-terms/value-stream-mapping/)
supports observing the current information/work flow before designing a future one. Its
[waste definition](https://www.lean.org/lexicon-terms/waste/) distinguishes removable work from
currently necessary work. The seven software categories below are the owner's requested adaptation;
test duration alone is not evidence that testing is waste. No complete Lean book was read for this
delivery audit.

## 1. Observed value stream

```text
Idea -> specification/decisions -> implementation -> local checks/review
  [timestamps unavailable]                [PR review not observed]
                  -> push master -> check -> semantic release
                       queue                 |-> image api ----|
                                             |-> image worker -|-> suite green
                                             |-> Pages build --|
                                             |-> announcement -|
                  -> Railway deployment (configured to wait for checks; not measured)
                  -> panel/kiosk live deployment (not proven by these Actions runs)
```

| Stage                          | Actual evidence                                                                                     | Measured elapsed / limitation                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Idea and spec                  | Architecture plan, ADRs and feature documents exist; no issue/spec state timestamps were collected. | Unavailable; do not substitute commit spacing.                                                                                             |
| Implementation                 | Commits are recorded, including features, fixes and reversals.                                      | Touch time and start-to-done time unavailable.                                                                                             |
| Review                         | Zero PRs; root rules require checks, but no protected-branch enforcement was observed.              | Review waiting and re-review count unavailable, not zero.                                                                                  |
| Integration                    | All 96 sampled CI runs have `push` events; CI is triggered on `master`.                             | No PR merge interval. Direct-push workflow is observed.                                                                                    |
| Wait for check                 | Workflow creation to check-job start.                                                               | Median **4 s**, P90 **85 s**, maximum **339 s**.                                                                                           |
| Automated check                | Build, typecheck, lint, format and tests run serially inside one job.                               | Median **222.5 s**; tests alone median **134 s**.                                                                                          |
| Version/release                | Semantic release depends on successful check, including a fresh checkout/install.                   | Job median **28 s**; run creation to release completion median **258 s**.                                                                  |
| Images / Pages                 | Image matrix and Pages job follow release.                                                          | Run to Pages **build** completion median **305 s**. Both deployment steps were skipped in **all 91 successful runs**, including the rerun. |
| Suite completion               | Image jobs finish last in **85/90** first-attempt successes.                                        | Workflow median **401.5 s**, P90 **502 s**; median tail after Pages job **85 s**.                                                          |
| Live deployment and acceptance | Railway configuration waits for check suites; existing QA memory confirms live product sessions.    | Actual Railway build/health completion and live frontend commit provenance are unavailable. A green Pages build is not a deployment.       |

Sources: [CI trigger, ordering and concurrency](https://github.com/leonidkuznetsov18/vakhta/blob/08979de/.github/workflows/ci.yml#L7-L43),
[image dependencies](https://github.com/leonidkuznetsov18/vakhta/blob/08979de/.github/workflows/ci.yml#L111-L149),
[Pages guard and deploy conditions](https://github.com/leonidkuznetsov18/vakhta/blob/08979de/.github/workflows/ci.yml#L151-L199),
[Railway check-suite configuration](https://github.com/leonidkuznetsov18/vakhta/blob/08979de/.railway/railway.ts#L17-L19),
[existing product QA evidence](../../engineering/features/worker-bot-qa.md).

The deploy guard tests whether the Cloudflare token is present and skips both upload steps when it
is absent. Logs/step status establish skipped deployment, not the reason for any alternative live
hosting path. Determine whether Cloudflare independently builds from GitHub before changing this
path. Do not add a second production deployer blindly.

## 2. Five measured bottlenecks

Ranked by accumulated observed duration within the **same 90-run population**, not by promised
savings. Frequency and baseline seconds are known; removable fractions are not. Correctness gaps
below can outrank these timing improvements in the migration backlog.

| Rank / ID | Bottleneck and evidence                                                                                                                                                            | Observed time cost                                                                                                           | Waste category and concrete action                                                                                                                                                                                                                                                                                                                                                   |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 / L1    | Tests dominate the serial check: median 134 s of a 222.5 s job.                                                                                                                    | **12,389 step-seconds** (206.5 min), median 134 s/run. This includes valuable regression protection.                         | Waiting. **SIMPLIFY**: preserve all assertions; add suite timing artifacts, then trial separate unit/integration jobs or bounded test sharding in `.github/workflows/ci.yml`. Compare required-check critical path and total runner time before adopting. Never make integration checks optional to improve the number.                                                              |
| 2 / L2    | Images determine suite completion in 85/90 runs; Railway is configured to wait for that suite and then build its own Dockerfiles. GHCR images also have documented rollback value. | **7,560 elapsed seconds** (126 min) of tail after Pages build, median 85 s/run. Actual Railway delay remains unmeasured.     | Waiting / candidate over-processing. **SIMPLIFY**: first record Railway wait/build timestamps for matching SHAs. Then test a single deliberate image-delivery strategy or selective artifact builds. Preserve immutable rollback images; do not eliminate their path on speculation.                                                                                                 |
| 3 / L3    | Every successful push traverses a separate release job before images and Pages, even if no version is published.                                                                   | **2,635 job-seconds** (43.9 min), median 28 s/run. Some is required versioning work.                                         | Over-processing / waiting. **AUTOMATE**: preserve semantic-release; trial dependency-store reuse or a verified shared build/release artifact contract. Measure release critical path; do not change version semantics or use stale build-time version values.                                                                                                                        |
| 4 / L4    | Pushes share a concurrency group and do not cancel active master runs; observed check-start delays have a long tail.                                                               | **2,265 elapsed seconds** (37.75 min), median 4 s, P90 85 s, max 339 s. Runner and concurrency portions cannot be separated. | Waiting / WIP pressure. **SIMPLIFY**: use one ready, reviewed PR per coherent change and record queued/start timestamps; retain serialized releases. Do not enable cancellation midway through release or deployment. Confirm contention before adding runner capacity.                                                                                                              |
| 5 / L5    | Production-configured panel/kiosk builds run in the Pages job, while every sampled successful run skips both deploy steps. Check also builds the apps.                             | **2,257 build-step seconds** (37.6 min), median 26 s/run. Overlaps image jobs; not automatically 26 s off delivery.          | Over-processing / ambiguous delivery status. **ELIMINATE** the redundant upload path only after identifying the actual frontend deploy owner. If this job is deliberately a production-config build check, rename/document it and retain its validation value. Otherwise **ADD** a required explicit deployment result, never a success that implies upload when upload was skipped. |

Example full run: [34362684973](https://github.com/leonidkuznetsov18/vakhta/actions/runs/34362684973).
Every aggregate has per-run measurement rows in the evidence file. Full-stack `pnpm build` and
production-specific Pages builds have different environment inputs; identical-looking build commands
are not sufficient proof that an artifact can safely be reused.

### Correctness blockers and observed rework

**L6 — ADD required integration checks on `master`.** The absence of branch protection/rulesets is
verified. Adopt a PR requirement and the existing `Build, lint, test` check, with appropriate release-bot
permissions and a deliberate emergency path. Reviewer configuration is a separate setting. No remote
policy is enabled by this audit. Savings are unknown; the purpose is to catch defects before integration.

There are concrete rework incidents, but they do not prove protection would prevent every failure:

- [Run 34219269699](https://github.com/leonidkuznetsov18/vakhta/actions/runs/34219269699)
  failed in `bonus.service.test.ts`. Run elapsed was **13 min 43 s**; the next successful CI run
  finished **12 min 33 s** later. This is a chronological recovery window, not measured repair labor.
  [Commit 8ec3920](https://github.com/leonidkuznetsov18/vakhta/commit/8ec3920)
  already records and fixes a background-evaluation/test-cleanup race. Keep the fix and monitor
  recurrence; do not put its already-completed implementation back into the backlog. The commit's
  claim of a one-in-three failure rate is historical author testimony, not this audit's measured rate.
- [Run 34190581015](https://github.com/leonidkuznetsov18/vakhta/actions/runs/34190581015)
  failed formatting in `apps/admin-web/src/preview.tsx` after **75 s**. The next successful run
  completed **7 min 56 s** later. **AUTOMATE** changed-file Prettier before commit and keep the CI check;
  **SIMPLIFY** check ordering so cheap formatting feedback arrives before a full build where feasible.
- [Run 34175894452](https://github.com/leonidkuznetsov18/vakhta/actions/runs/34175894452)
  succeeded on attempt two; attempt one failed its test job after **189 s**. Failure cause was not
  established from the retained metadata. One rerun is not a measured flaky-test rate.
- Four `revert` subjects in the broader git window describe changes to activation, sign-in, bot
  labeling and schedule navigation. They establish reversal, not defect severity or lost labor.
  **ADD** a small approved spec and before/after worker-flow evidence to UI PRs, with a reason recorded
  for each reversal, to distinguish learning from preventable specification churn.

**L7 — ADD deployment provenance and representative journey evidence.** All 91 Pages uploads were
skipped, while product QA documents working live sessions. Time from accepted commit to verified live
behavior therefore cannot be measured here. Record frontend/API/worker deployed SHAs, health and the
critical bot/kiosk/panel acceptance outcome in the deployment artifact. Keep browser credentials in
1Password and use the approved identity/terminal without treating them as isolated fixtures. Actual
camera-to-Telegram and inline-button verification remains incomplete in the existing QA record.

## Seven-waste check

| Software waste            | Observed evidence / uncertainty                                                                                                                                                | Concrete response                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Waiting                   | L1–L4 measure automated critical-path/queue contributions; human PR waiting unavailable.                                                                                       | Timing artifact and protected, short PR workflow; optimize only measured critical-path work.                                                                                  |
| Rework                    | Two terminal failures, one rerun and four revert subjects; known bonus race already fixed.                                                                                     | Preserve the fix; label rerun reason in PR/CI notes and track same-SHA repeat failures.                                                                                       |
| Over-processing           | Separate release/install/build stages; a second frontend build with skipped upload.                                                                                            | L3/L5: compare inputs, establish deploy ownership, then remove only verified duplication.                                                                                     |
| Handoff/context switching | Previous feature memory explicitly records concurrent shared-checkout work and incomplete QA handoff. Human time unavailable.                                                  | **ADD** one bounded handoff record: spec, owned paths, baseline SHA, verification, open questions. Use separate worktrees for concurrent writers.                             |
| Excess WIP                | Zero open PRs, no remote topic branches listed locally; overlapping workflow timestamps and queue delay are observed. Invisible local WIP cannot be counted.                   | **SIMPLIFY** to one active implementation slice per implementer; measure rather than claim excessive branch inventory.                                                        |
| Unnecessary motion        | Standards, product help, engineering memory and runtime QA are separate inputs; prior task needed manual authentication and phone handoff. Search/navigation time unavailable. | **AUTOMATE** environment preflight and provide one documentation index; keep secrets/setup instructions in the existing QA runbook. Do not duplicate root rules in each role. |
| Defects                   | Formatting failure, test isolation failure and incomplete deploy/journey proof. Number of production defects unknown.                                                          | L6/L7 required checks and explicit runtime evidence; regressions at the cheapest meaningful layer.                                                                            |

## 3. Quick wins: each scoped below one working day

These are implementation-size judgments, not measured completion promises.

1. **ADD (L6):** prepare and review branch-rule settings using existing check names; reconcile
   semantic-release bot writes before activation. Payoff: integration gate becomes enforced.
2. **AUTOMATE:** add an opt-in/pre-commit changed-file formatting command and document the existing
   full `pnpm check`. Payoff: avoids the demonstrated 75-second late format failure pattern.
3. **ADD (L5/L7):** distinguish `built`, `deployed`, `skipped` in workflow summary and link the actual
   frontend deployment owner. Payoff: avoids investigating a green build as if it proves live delivery.
4. **ADD:** export run/job/step timing and rerun-reason metadata into a compact audit artifact.
   Payoff: makes the next comparison possible without speculative speed claims.
5. **SIMPLIFY:** one linked handoff template and reproducible setup preflight. Payoff: reduces repeated
   discovery/clarification; human minutes saved need measurement before a claim is made.

## 4. Structural fixes and experiments

- **L1, medium:** separate meaningful unit/integration workload and evaluate bounded parallelism.
  Baseline: test median 134 s; measure at least 20 comparable PR runs. Success: lower required-check
  median/P90 without missing suites, new isolation failures or unreasonable runner growth. Any new
  flaky failure invalidates a speed-only success claim.
- **L2/L5/L7, medium:** one explicit deployment contract per service, stable commit provenance and
  immutable rollback artifact. Measure Railway/API and actual Cloudflare completion before choosing
  image reuse or removing a delivery branch. This is deployment architecture work, not a quick YAML trim.
- **L6, small to medium:** introduce spec-linked PRs, independently scoped review and QA, maintaining
  short feedback loops. Do not require five synchronous meetings or five agents for a documentation fix.
- **L7, medium:** add isolated critical-journey fixtures and browser/bot E2E evidence. Automated API
  tests and mocked components cannot prove real phone camera handoff or Telegram usability.
- **Feature ownership, incremental:** future FSD slices and explicit interfaces can reduce handoff/search
  friction, but there is no measured time saving that justifies a big-bang rewrite. Follow the architecture
  audit's risk ordering and keep pure domain/backend boundaries intact.

## Repeat and compare

Run this role **monthly or after 20 merged PRs**, whichever comes first; until PR adoption, use 20 new
completed CI runs. This is a documented cadence proposal, not a created scheduler/automation.

1. Freeze baseline SHA and UTC capture time. Read prior `lean-bottlenecks.md` and `lean-metrics.json`.
2. Use read-only `gh api` for workflow runs, per-run jobs, each rerun attempt, all-state PRs, PR reviews,
   branch protection and rulesets. Paginate to cover the declared window; distinguish scheduled backups
   from delivery. Never collect secret values or whole production logs into the repository.
3. Report sample counts and separate successful first attempts, failures, cancellations and reruns.
   Calculate creation-to-check, stage durations, actual critical path, PR open-to-merge and review rounds.
   Missing dates remain unavailable. Obtain actual deployment status/SHAs separately before calculating
   commit-to-live time. Record human touch time only when explicitly observed and consented.
4. Compare medians/P90, failures per run and deployment-verification completeness against this baseline.
   Match workloads where possible; report changed suite size/hardware and avoid causal claims from
   before/after numbers alone. Store a new dated report rather than rewriting this one.
5. For L1–L7 record `not started`, `implemented, awaiting measurement`, `improved`, `no improvement` or
   `rejected with reason`, linking the PR and measurements. Flag recommendations repeated without action.

There is no prior delivery-timing audit in the inspected baseline, so cycle-time improvement cannot yet
be claimed. Existing [development workflow memory](../../engineering/features/development-workflow.md)
recommended persistent instructions and repeatable QA; instructions and the credential launcher now
exist. The [worker-bot QA follow-up](../../engineering/features/worker-bot-qa.md) adds approved targets
and command checks, while camera handoff/inline navigation remain pending. This is evidence of partial
follow-through, not proof that worker stress or production downtime decreased.
