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

Confirm the isolated Telegram identity and terminal, then record actual cross-surface journey evidence.
Migrate legacy React hooks and frontend folder boundaries with affected features. Add browser E2E
coverage for critical journeys; the secret launcher only supplies credentials to test commands.
