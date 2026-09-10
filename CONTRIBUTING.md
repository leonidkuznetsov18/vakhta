# Contributing to Vakhta

Read `AGENTS.md` and the feature's product and engineering documents. For non-trivial work, record
problem, scope, non-goals and acceptance criteria using `docs/templates/spec.md`, then decide module
placement before implementation. Reuse existing solutions before introducing a dependency.

## Local environment

Use Node 22 (at least 22.12) and pnpm 10.9.0 as configured by `.node-version` and `package.json`.
`pnpm install --frozen-lockfile` installs the existing build, lint and test tools. `pnpm build` compiles
workspace exports used by downstream packages. `pnpm check` runs typecheck, lint, tests and formatting;
it does not substitute for the application production build.

API and worker integration tests require a working Docker-compatible daemon and test images.
`pnpm infra:up` starts local development services, but tests create their own disposable containers.
Use `.env.example` only for local configuration. Do not copy production secrets into tests. The
1Password workflow is in `docs/runbooks/product-qa.md`. Cloud setup is in `.codex/setup.sh` and
`docs/engineering/cloud-environment.md`.

## Git and review

Use a `codex/<purpose>` branch and a separate worktree for every independent writer. Keep staged paths
owned by one task. Do not stash, reset, amend or rebase a checkout another session is using. Review a
fixed base/head pair; re-run affected verification after integration changes.

Commit subjects follow `type(scope): outcome` in English. Existing types are `feat`, `fix`, `perf`,
`refactor`, `config`, `infra`, `docs`, `ci`, `chore`, `test`, `style`, and conventional `build` where
appropriate. `.releaserc.json` determines release behavior: feat is minor; fix/perf/refactor/config/infra
are patch; docs/ci/chore/test/style do not release on their own. Breaking changes require an explicit
compatibility decision and `!` / `BREAKING CHANGE:` as appropriate. There is no commitlint hook yet;
this convention is documented and consumed by semantic-release, not mechanically enforced locally.

Use the PR template. Lead with the problem and resulting behavior, link the spec, list evidence and
material risks, and name what remains blocked. Keep refactors separate from behavior changes. Do not
add reviewers, send notifications or publish a branch unless the task authorizes that external action.
Never mark ready based solely on an AI review. Required checks and branch policy must be configured
on GitHub separately; this documentation does not enable them.
