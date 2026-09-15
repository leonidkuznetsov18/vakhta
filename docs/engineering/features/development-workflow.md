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
that same source. Feature memory uses `../../templates/feature-memory.md`. The React hook ban is an
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
