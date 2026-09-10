# Required verification and historical testing baseline

## Active policy — owner decision, 2026-09-10

Use only the minimum checks justified by the actual change. This policy supersedes earlier blanket
requirements for full local builds/tests, independent review and all-surface live QA on every edit.

| Change                                                                              | Required checks                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documentation, comments, copy or simple presentation                                | Inspect the diff; check formatting or syntax when relevant. Visually inspect the changed UI if layout/readability could change. No new unit/E2E tests, full build/check or separate reviewer.                         |
| Ordinary application behavior                                                       | Run the affected existing tests and add a regression for a demonstrated behavioral bug. Run affected type/lint checks; build only when compilation, exports or bundling are affected. Check the changed user journey. |
| Money, authorization, attendance/time, transactions, migrations or failure recovery | Focused invariant tests using the real database where atomicity/concurrency matters; relevant failure/retry cases; one independent review of the changed boundary. Verify the affected deployed behavior.             |

- Existing CI is the full integration gate. Do not run the same complete suite locally by default.
  A local full build/check is justified only by a concrete integration risk not covered by focused
  checks, unavailable CI before deployment, or diagnosis of a failure. Run it once per coherent batch.
- Do not delete useful tests, weaken assertions or bypass a failed required CI check to save time.
- After a successful check, rerun only what later edits can affect. A prose change cannot invalidate
  business tests. The reviewer and integration owner reuse valid results rather than rerunning them.
- One reviewer is enough for high-risk code; split independent boundaries only when it saves work.
  Review fixes as a delta. No repeated full reviews of unchanged code or documentation-only handoffs.
- Live QA covers changed surfaces only. A backend recovery change does not require another /help,
  kiosk countdown and unrelated panel visit. Verify its actual recovery outcome instead. Exercise
  the complete panel/kiosk/bot journey only when the change crosses those boundaries.
- Reuse existing fixtures, tools, source research and feature memory. No new framework, broad audit,
  speculative edge-case expansion or mandatory RED ritual for a simple reversible edit.
- Stop when the acceptance criteria and these checks pass. Report exact evidence briefly. Batch
  related commits into one delivery instead of repeated pushes and documentation-only CI cycles.

## Historical audit baseline

Baseline: `08979de`, inspected 2026-09-10. This is a proposal; it installs no new test framework,
coverage gate or browser runner. See the [architecture audit](../audits/2026-09-10/architecture-audit.md)
for source references and the [audit index](../audits/2026-09-10/README.md) for executed results.

## Existing protection

| Package/application | Passing files / tests in the fresh baseline run | Actual protection                                                              |
| ------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Domain              | 18 / 130                                        | Pure rules, FSM, time and property-based invariants                            |
| Contracts           | 1 / 4                                           | Contract validation                                                            |
| i18n                | 1 / 10                                          | Catalog/localization behavior                                                  |
| API                 | 24 / 149                                        | Real PostgreSQL/Redis integration, HTTP E2E, services and selected bot helpers |
| Worker              | 6 / 19                                          | Jobs, notification/outbox and supporting behavior                              |
| Panel               | 16 / 50                                         | Vitest/jsdom components and pure helpers                                       |
| Kiosk               | 0 / 0                                           | No test script or kiosk regression suite                                       |

Total: 66 files, 362 tests. No coverage percentage was collected; no coverage provider or threshold is
configured. A passing test count says nothing about the percentage of supported workflows covered.
API tests named E2E exercise HTTP/services; they do not constitute a real browser or Telegram journey.
Panel tests mock media queries and some overlays, so passing them does not establish mobile focus or
layout correctness. CI exercises integration tests with disposable containers, not production data.

## Test types available for relevant changes

- **Unit/property:** retain fast pure FSM/time/scope tests. Add view-model and state-store tests when
  extracting behavior; test observable rules rather than internal hook calls or component structure.
- **Integration:** keep actual PostgreSQL and Redis for transaction, idempotency, concurrency, queue
  recovery and tenant/scope behavior. Inject failures at external boundaries with controlled fakes.
- **Component:** retain user-oriented panel tests; check pending, success, failure and stale-response
  behavior using deterministic deferred promises. Avoid testing only happy paths with resolved mocks.
- **Browser E2E:** add one maintained browser runner after checking existing tooling. A small Playwright
  proposal fits desktop/mobile viewport, keyboard and session-isolation cases; selecting/installing it
  belongs to a follow-up change. There is currently no `test:e2e` command to run.
- **Telegram/kiosk journey:** drive a local bot harness with synthetic updates and a fake Telegram API;
  cover actual callback payloads and keyboards without contacting employees. Separately verify camera
  handoff, inline actions and understandable status/recovery messages in the authorized live QA flow.
  A username and production terminal are authorized QA targets, not disposable fixtures.

## Five urgent regression targets

These are source-inferred risks to reproduce, not claims of demonstrated production failures. Tests
should establish behavior before the implementer changes it. Independent QA derives assertions from
acceptance criteria and takes a sequential write turn in the current checkout; the integration owner reviews the combined revision.

| Priority / primary file                           | Required case and assertion                                                                                                                                                                       | Why / scope                                                                                                                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. `apps/admin-web/src/auth/useSession.ts`        | Load account A, sign out, sign in as B. Old queries and persisted schedule drafts must not render under B. Include an in-flight A response resolving after sign-out.                              | QueryClient persists at the root and sign-out currently resets only session state; verify isolation through the app, query client and schedule store. API authorization remains a separate server requirement. |
| 2. `apps/admin-web/src/schedule/SchedulePage.tsx` | Request A, select B, resolve B then A; selected detail and versions must remain B. Cover rejection, unmount and pending controls with deferred promises.                                          | Current asynchronous setters do not consistently guard response ownership; source inference needs deterministic reproduction.                                                                                  |
| 3. `apps/qr-kiosk/src/main.ts`                    | Switch terminals while a challenge is pending; late old-terminal responses must never replace the selected terminal's QR. Repeated expiry ticks must not create uncontrolled concurrent requests. | Attendance QR provenance is a correctness boundary; no kiosk suite exists. Test a narrow extracted controller only when its implementation change is authorized.                                               |
| 4. `apps/api/src/telegram/bot.factory.ts`         | Deliver a synthetic update, fail after the dedup claim, then redeliver it. Assert the documented retry/recovery outcome and at most one committed transition.                                     | `update-dedup.ts` claims before handlers execute. Existing helper tests do not prove end-to-end orchestration recovery. Define retry policy before changing claim semantics.                                   |
| 5. `apps/api/src/shift/shift.service.ts`          | Commit a transition, fail deferred queue publication, retry the same request. Assert exactly one transition and eventual required timer work, or an explicitly observable recoverable failure.    | Database commit and Redis effects are separate; idempotent response replay alone does not prove side-effect recovery. Use real DB and a controllable queue boundary.                                           |

Next extend existing Operations tests for concurrent commands/cache invalidation and DataTable tests for
selection-contract behavior; avoid replacing useful existing coverage. Outbox Telegram-send/DB-commit
failure deserves integration coverage but cannot prove exactly-once delivery across separate systems.

## Commands and measurement

Existing root commands are `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`,
`pnpm format:check` and `pnpm check`. The last command runs typecheck, lint, tests and formatting.
Use `pnpm exec turbo run test --force` only when fresh execution is required instead of cached results;
Turborepo also runs prerequisite package builds. Docker must be available for the full suite.

Add coverage reporting in a small change with the Vitest-compatible provider version, record line/branch
baselines by package and inspect meaningful untested branches before choosing thresholds. Do not begin
with an arbitrary global percentage or exclude difficult code to obtain a green gate. Preserve all
existing assertions when experimenting with CI parallelism, and compare timing with the Lean baseline.
