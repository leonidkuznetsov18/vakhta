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
