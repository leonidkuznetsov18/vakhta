# Feature: development standards and product verification

## Outcome and scope

Record the owner's engineering requirements so future changes preserve simple worker flows, minimal
React presentation code, feature ownership and repeatable verification. This change configures the
development workflow; it does not migrate all existing screens or change production behavior.

## Ownership and decisions

`AGENTS.md` is canonical; `CLAUDE.md` imports it. Detailed standards live in
`../standards.md`. The existing `docs/features/` folder is a support-assistant input, so developer
memory, unfinished behavior and agent instructions live outside it. No user-facing feature document
is needed for this developer-only workflow.

The Lean review skill is `.agents/skills/vakhta-lean-review/SKILL.md`; the Claude subagent points to
that same source. Since 2026-09-17 it is used only for owner-requested Lean expertise; the earlier
assessments below are historical. [Skill selection](../skills.md) routes engineering work to its own
specialists. Feature memory uses `../../templates/feature-memory.md`. The React hook ban is an
explicit project policy; React 19 has not deprecated those APIs. Existing hook usage and legacy
non-FSD folders remain migration debt. New work and touched slices follow the standard; the current
ESLint configuration does not enforce all these architecture rules automatically.

The credential launcher is a package script around the official 1Password CLI, with a tracked example
containing placeholders and an ignored local file containing field references. No custom secret vault,
new runtime dependency or browser authentication framework was introduced. See
`../../runbooks/product-qa.md` for setup and the verification protocol.

## Lean review

Recommendation: Proceed. Persistent decisions reduce repeated clarification and inconsistent changes.
Keep reviews short and focused on worker value; avoid creating mandatory ceremonies for trivial edits.
Measure whether future feature changes include clear source ownership and repeatable journey evidence.
Do not interpret a green unit suite as evidence of lower production downtime or better worker UX.
The next useful experiment is one isolated worker journey checked across bot, kiosk and panel.

## Verification: 2026-09-10

Repository baseline: `694ef03` (package version 0.69.0). The shared checkout is being edited by another
task; its report-screen changes are outside this workflow change.

- `pnpm check` passed: typecheck, lint, tests and formatting. The suite reports 362 tests across
  66 files, with Turborepo cache reuse. This includes API E2E tests, not a browser/Telegram E2E suite.
- The Lean skill passed `quick_validate.py` using an isolated `uv run --with pyyaml` environment.
- Official 1Password CLI 2.39.0 was installed and desktop-backed sign-in succeeded. The package
  launcher resolved the development password reference into a child process; the verification checked
  a non-empty resolved value and the expected email without printing the password.
- The live panel's overview and profile were inspected. Profile showed `dev@vakhta.xyz`, Dev Agent,
  administrator scope for the enterprise. The live UI displayed version 0.70.0, distinct from the local
  package version. Credential form automation encountered clipboard/session limitations; this is
  authenticated-session evidence, not a proven fully unattended browser-login script.
- `kiosk.vakhta.xyz` displayed the unpaired terminal screen. Its 390 x 844 view was visually inspected:
  the pairing field, action and language controls were visible. No device pairing or QR scan was run.
- Authenticated mobile panel behavior and real Telegram bot interactions remain unverified. A dedicated
  Telegram test identity and QA terminal are being clarified with the owner. Do not treat these as passed.

No production shift or employee record was changed. No credential values or QR payloads were added to
repository files. Session artifacts and test reports are ignored.

## Remaining work

The owner subsequently confirmed `@cryptoleonid` and terminal `Основний`; follow-up runtime evidence
is recorded in `worker-bot-qa.md`. Complete the remaining cross-surface journey checks there.
Migrate legacy React hooks and frontend folder boundaries with affected features. Add browser E2E
coverage for critical journeys; the secret launcher only supplies credentials to test commands.

## Spec Kit adoption: 2026-09-12

The owner authorized project setup after installing the global skills. Scope: initialize Spec Kit,
reuse accepted rules, define artifact ownership and verify the setup. No application behavior or
product document changes are part of this adoption. The first product change remains to be selected.

Official Specify CLI 1.0.6 generated the tracked Codex/Bash integration. The constitution starts at
1.0.0: five principles derived from existing policy, artifact ownership, direct-master workflow and
governance. No policy relaxation or unresolved placeholder remains. Upstream assets retain their
managed hashes; the upstream MIT notice is in `.specify/UPSTREAM-LICENSE`. Local spec/plan/task
overrides remove greenfield scaffolding, optional-test defaults and parallel-writer examples.
The formatter excludes managed assets only; authored guidance remains checked.

[The Spec Kit guide](../spec-kit.md) owns usage and maintenance instructions. Change contracts live
under `specs/<change>/`; product documentation remains current behavior and this feature memory keeps
durable evidence. Existing standards remain canonical. No new Git extension, runtime dependency,
unattended agent or recurring automation was installed. The active feature pointer is absent until
a real task is selected and is ignored by Git.

Lean recommendation: Proceed with the bounded setup, then evaluate it on one real change. Reuse
the existing documents, skip empty phases and optional ceremonies, and keep one writer/index owner.
Expected benefit is fewer repeated decisions and scope mismatches; no measured time saving or
production improvement is claimed. Stop expanding the setup if it creates duplicate documentation.

Local verification passed:

- `specify integration list`: Codex installed and default; CLI reports 1.0.6.
- SHA-256 integrity of 22 managed files and metadata for all 10 local skills.
- `bash -n` for all six helpers and resolution of all three project template overrides.
- Temporary fixture: missing plan/tasks reported as errors; plan/task helpers use local overrides;
  repeated plan setup preserves authored content; prerequisite output includes the task document.
- Explicit feature-directory selection leaves the shared pointer unchanged; the real checkout's
  pointer remains absent and ignored. Constitution values and local documentation links resolve.
- Focused Prettier check for all authored guidance/overrides and `git diff --check` passed.

Application tests, build and product visual/live QA are inapplicable to this tooling/documentation
change. No employee actions were performed. CI/release and deployment evidence are separate from
these local checks; the existing pipeline remains the integration gate.

## Architecture standardization: 2026-09-15, first increment

[Spec, plan and tasks](../../../specs/009-architecture-standardization/spec.md) own the full program.
Baseline: `be779fc`; the first increment replaces file protocols and centralizes dependency versions.
Form/API pilots, typed persistence, architecture gates, network/browser tooling and operational
contracts remain pending (T018–T030). Existing frameworks and pure business rules remain authoritative.

Implemented:

- Employee import is an FSD feature with Papa Parse 5.7.0, shared Zod validation, explicit Zustand
  read ownership and Query mutations without automatic retry. It accepts at most 2 MiB/1,000 data
  rows, keeps leading zeros and invalid-row previews, and rejects broken/oversize files visibly.
  New selection/close invalidates reads. Failed submissions retain the preview. A clicked opener
  owns keyboard-focus return; desktop/mobile dialog content scrolls independently of its actions.
- `csv-stringify` 6.8.3 handles losses, bonus history, closed-period records and metadata. Existing
  delimiter/newline/BOM policies stay intact. Formula-like strings are protected; actual numbers
  retain their representation. Delimiters/newlines in rule labels stay inside their metadata cell.
- `ical-generator` 11.1.1 owns escaping and Unicode folding. Feed queries, tokens, UID, revision,
  timestamps, UTC and three-hour refresh remain intact. The library also emits standard NAME.
- SheetJS uses the official 0.20.3 tarball with a verified SHA-512 in the lockfile. The bonus sheet
  is `Bonus history`: Excel reserves `History`, which the supported library rejects. Other workbook
  semantics are retained. pnpm catalogs centralize 18 shared direct dependencies at current versions;
  comparison confirmed all 147 direct resolutions unchanged by catalog consolidation.

Fresh local evidence:

- Employee-import parser/store/UI plus AdminPage: 30 tests passed; includes three-language template
  round trips, stale reads, read/submit failure, retry, duplicate-submit guards and focus restoration.
- CSV/calendar adapters: 16 tests passed. PostgreSQL losses: 16 passed; bonus: 25 passed after the
  SheetJS compatibility correction. Scheduling: 10 relevant saved-version export, retrospective and
  personal-feed cases passed; 51 unrelated cases were deliberately deselected. i18n: 13 passed.
- Contracts/i18n builds, API typecheck/build and panel typecheck/production build passed. Changed-source
  ESLint, authored-file Prettier and frozen-lock installation passed. The SheetJS digest remains in
  the lockfile after installation. Existing Docker build contexts already copy the catalog file.
- Real browser fixture journey at 1440×1000 and 390×844: valid/invalid rows, paging, malformed/empty
  files, created/skipped result, disabled submit and Escape/focus return. Screenshots captured and
  visually inspected under ignored `test-results/architecture-standardization/`. Read failures are
  injected in automated tests. No real employee was imported and no production request was submitted.
- Independent read-only review covered exports/feed/import boundaries. Its missing tarball-integrity
  finding was resolved; the final metadata-quoting delta also passed review without further findings.

Limits and remaining verification:

- The final metadata-quoting change extends the existing real bonus export test. Its two-case rerun
  could not start PostgreSQL: Docker returned a containerd temporary-directory I/O error after the
  host ran out of disk space. Earlier bonus results do not claim execution of that final assertion.
  CI must run it before T009/T017 are closed. Existing serializer fixtures cover delimiter/newline
  quoting; no transaction or calculation changed in that delta.
- Panel build retains upstream Zod annotation and large-chunk warnings. The local preview logged
  missing GET /preview.html fixtures during dev reloads, with no import runtime errors. A stale ignored
  preview entry also caused a dev dependency-scan warning. Neither is production verification.
- Low host disk space interrupted one repeat build/i18n start; removing only this task's generated
  panel output/cache allowed both to pass. Other Docker workloads/data were preserved.
- Post-push full CI, release/announcement and deployed import/export checks are separate pending
  evidence. Do not infer deployment from local tests or close the whole program after this increment.

Lean recommendation: Proceed with the bounded increment. Keep select → preview → import → report;
catch broken/stale files early and keep mobile actions reachable. No extra worker step or permission
ceremony was added. Correctness is demonstrated with fixtures, not claimed as measured time savings.

## Architecture standardization: completed implementation and evaluations

Active feature remains `specs/009-architecture-standardization`. This section supersedes the earlier
pending-pilot and host-Docker notes. The earlier source `87fc017` reached CI run `34969938815`, whose
bonus metadata assertion exposed an invalid fixture effective date. The fixture now starts at the
period boundary used by closePeriod; the focused real PostgreSQL export case passed. No bonus rule
or financial calculation changed. Existing Colima was started successfully; no database volume was
removed. Final delivery/CI evidence is recorded separately below.

| Audit | Outcome                                  | Implemented boundary / remaining migration                                                                                                                                                                              |
| ----- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1    | Adopt Axios + Nest/Zod/OpenAPI + Orval   | Panel domain API calls use the shared Axios transport; employee page/import are generated and runtime validated. Legacy endpoint wrappers remain thin compatibility callers, migrating by resource.                     |
| A2    | Adopt TanStack Form + Zod                | Profile section form retains normalized no-op/reset, failed draft, version acknowledgement and explicit retry. Complex Schedule workflows retain domain models.                                                         |
| A3    | Adopt typed Zustand persistence          | Audit facets are actor-keyed, versioned and validated with corruption/storage recovery. Generic legacy search/open-row/session persistence remains separate migration work.                                             |
| A4    | Adopt scoped ESLint boundaries           | Employee import/profile, audit filters, employee entity and shared API/config are enforced. Legacy root dependencies remain inventoried.                                                                                |
| A5    | Adopt Papa Parse / csv-stringify         | First delivery replaced handwritten CSV import and report serialization.                                                                                                                                                |
| A6    | Adopt ical-generator / supported SheetJS | First delivery replaced feed encoding and unsupported distribution; bonus sheet name compatibility documented above.                                                                                                    |
| A7    | Adopt MSW / Playwright / axe             | Real transport fixtures and desktop/mobile profile journeys run in CI; no production employee actions.                                                                                                                  |
| A8    | Adopt nestjs-pino                        | Safe HTTP IDs and durable timer producer/worker identity. Broader legacy worker logging and distributed tracing remain outside this pilot.                                                                              |
| A9    | Adopt explicit recovery contracts        | Per-row outbox commit/fault tests, Telegram diagnostic outcomes, scheduling command receipt reference. Full payload inbox, legacy Requests/Incidents receipts and external exactly-once are not implemented or claimed. |
| A10   | Retain current task engine               | pg-boss source evaluation did not establish equivalent per-attempt fencing without custom machinery. No unverified queue migration.                                                                                     |
| A11   | Defer dnd kit                            | Existing explicit Move editor serves keyboard/mobile. Reconsider for a demonstrated sensor/drag requirement and equivalent workflow tests.                                                                              |
| A12   | Retain typed locale catalogs             | Reconsider i18next for plural/namespace/translator requirements; retain explicit locale isolation.                                                                                                                      |
| A13   | Standardize existing tools               | Domain Luxon/time rules, reusable employee queryOptions and cursor-cycle rejection, EventSource invalidation ownership. Virtualization awaits a measured bottleneck.                                                    |
| A14   | Adopt catalogs / advisory Knip           | Existing resolutions retained; entrypoints include previews, worker/bot/kiosk, scripts and DB migration/seed. No automatic deletions.                                                                                   |

Why Axios: the preceding increment reused the existing apiFetch and had not performed a transport
comparison. The owner's follow-up prompted the comparative evaluation recorded in plan.md. Axios led
npm's measured monthly downloads among Axios/ofetch/Ky/Wretch and supplies maintained cancellation,
HTTP error discrimination and Orval integration. Query still owns retries; no axios-retry or second
server cache was added. Four direct authenticated fetch paths now use the shared transport. Static
build-version HTML checks and EventSource remain distinct protocols. ApiError preserves HTTP/domain
identity without retaining unsafe Axios configuration/payloads.

The generated client uses the actual shared mutator entrypoint so Orval infers signal/timeout options.
Generation applies repository Prettier after Orval and commits the OpenAPI 3.1 document/models. Nest
serialization validates output; client entity APIs also validate unknown responses. The pilot keeps
existing status codes, authorization/scope behavior and error envelopes. Contract generation is a
reflection-only process without a live server or database.

Advisory assessment: Knip reported 84 file groups: 113 exported values, 24 types, four development
packages, three duplicate exports, three unlisted packages and two external binaries; no unresolved
imports or unused runtime dependencies. Known dynamic uses include Pino's pino-pretty target, the
release preset and Railway config. `op`/ffmpeg are external tools; release/doc scripts access nested or
workspace dependencies. These are review leads, not deletion authority. Generated/public contract
exports and shadcn APIs remain deliberate. Steiger reported eight findings: seven insignificant-slice
suggestions miss legacy callers or conflict with coherent feature ownership; app/ui composition is
accepted project structure. Its missing shared/config entrypoint was fixed. Scoped ESLint supplies the
blocking boundary gate while these whole-tree tools remain advisory.

Fresh verification for this increment:

- Full panel suite: 77 files, 500 tests passed. Subsequent baseline-reset/persistence/query refinements:
  21 focused tests passed. Transport includes 16 cases; generated MSW API five; API contract/auth/output
  validation eight; persistence seven. No mocked type-only guarantee substitutes for boundary parsing.
- Profile browser journeys: four desktop/mobile Chromium tests passed with axe checks; screenshots
  captured under `apps/admin-web/test-results/browser` and inspected for validation, failed drafts and
  conflict disclosure. Keyboard/desktop/mobile behavior is fixture evidence, not authenticated production QA.
- Outbox and timer suites: 41 PostgreSQL tests passed, including partial-batch receipt failure,
  concurrent relay, zero-delay retry, stable task IDs across retry/recovery, and observer failure after
  persistence. Telegram outcome tests: five passed; existing QR departure/bot compatibility: 16 passed.
- Logger and task producer: five tests passed, proving concurrent ID isolation, both error-key
  redaction, implicit-message sanitization, persisted task identity and rollback semantics. Independent
  reviews found a stale Reset baseline and a missing HTTP error serializer; both were corrected and
  covered by focused regression checks. Reviewers did not duplicate the writer's test execution.
- Architecture rule fixtures: three passed. Root ESLint and affected API/worker/panel typechecks passed.
  API, panel and worker production builds passed; generated output formatting was aligned with the
  repository formatter. Five existing PostgreSQL scheduling receipt/replay/fault cases also passed.
  Generated contract drift check passed after staging; remote CI status is recorded at delivery,
  not inferred from local results.

Operational limits: a Telegram-accepted message whose receipt cannot commit remains ambiguous and may
repeat once on retry. Each send still holds a database row transaction. PROCESSING after interruption
is not success; FAILED does not automatically replay partially applied effects. The existing webhook
still acknowledges handler/admission failures according to its previous policy; a replayable durable
inbox needs per-handler recovery and a safe admission-failure response. New outcomes improve diagnosis
without closing the older critical-reliability #4. No production fault injection, real notification
send, browser login, or live employee save was performed for this standardization change.

Lean recommendation: Proceed. Keep the existing user paths, preserve drafts and accountable version
acknowledgement, and remove duplicated transport/protocol mechanics. Conditional dependencies are
explicit decisions with adoption triggers in plan.md. Do not equate additional libraries or green
fixtures with measured worker productivity or completed migration of every legacy module.

### Delivery evidence

Implementation source `331009a` passed every check in [run 34973454627](https://github.com/leonidkuznetsov18/vakhta/actions/runs/34973454627):
frozen installation, build, typecheck, lint, formatting, full tests, architecture fixtures, generated
API drift and desktop/mobile browser journeys. Release [v1.15.4](https://github.com/leonidkuznetsov18/vakhta/releases/tag/v1.15.4)
was published; the existing `Post to the Telegram group` step succeeded. This satisfies T017 without
claiming that release publication proves all deployments or real employee workflows. Images and Pages
continue under that run; Railway API/worker deployment metadata identifies the same source.

The owner subsequently requested readable English package descriptions after a JSON rewrite escaped
the existing Ukrainian admin-web description. All ten workspace descriptions now use plain English;
only metadata changed. The Knip kiosk entrypoint now names the actual `apps/qr-kiosk` workspace. Its
rerun retains the advisory counts above. Formatting and JSON parsing passed. This correction and the
final plan status are delivered together; no runtime or business behavior changed.

## Task-specific skills: 2026-09-17

Owner-authorized scope: stop using Lean for routine development, research reusable popular GitHub
skills before making changes, and install distinct frontend, backend, UI/UX, architecture and QA
expertise. Baseline: `be668b6`. Non-goals: application behavior, dependency/framework migrations,
global skill replacement, new agent orchestration or scheduled Lean reviews.

Acceptance criteria: all five roles have a discoverable project-local skill; Lean is explicitly
requested rather than automatic; active instructions and templates agree; imported sources are pinned,
licensed and checked. The research and role-to-skill matrix live once in [the skill guide](../skills.md).

Nine skills were installed into `.agents/skills` from exact commits of Vercel, Anthropic, wshobson,
Kadajett and Supabase repositories. Existing global specialists were verified and retained. Repository
stars informed the shortlist, while stack fit determined the final selection. The smaller NestJS
source was selected for framework-specific guidance; broad senior-backend interviews, Jest/Next.js
scaffolding and a competing full development framework were not adopted.

Each imported entrypoint has a short project compatibility note. Upstream examples and references
remain available, license files are preserved or copied from their source repository, and
`.agents/skills/upstream-lock.json` records revisions, source paths, local adaptations and tree hashes.
No imported helper runs automatically. Reuse the existing TypeScript test/browser runners.

Updated AGENTS, operating roles, Claude Lean description, Codex invocation policy, Spec Kit templates
and constitution. Constitution 2.0.0 records the incompatible governance change that removes the
blanket Lean gate. Historical completed Lean assessments remain intact; new feature memories omit
the section unless requested. No Lean assessment was performed for this setup.

Verification:

- Skill Creator validation passed for all nine imports and the revised Lean skill.
- All nine installed tree digests matched; 187 imported files and explicitly named skill resources
  were checked. Python resources parse; the browser helper's `--help` completed successfully.
- Lean metadata has `allow_implicit_invocation: false`. Active instructions now distinguish normal
  engineering work from owner-requested Lean expertise.
- Focused Prettier and authored-diff whitespace checks passed. Imported upstream whitespace is
  preserved with the pinned snapshots; those trees are intentionally outside formatting checks.
- Application tests and browser screenshots are not applicable: no product code or UI changed.
  Imported example scripts were not used against the application or production.

Remaining evidence: automatic skill selection must be observed on subsequent real tasks; static
validation does not prove routing quality. CI/release/announcement outcomes are separate from these
local checks. New skill discovery is expected from the next turn.
