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

## Git, review and delivery

The owner requires direct work and pushes on `master` in the current repository. Do not create pull
requests, topic branches or worktrees. Use one writer and one Git-index owner at a time; reviewers may
inspect read-only in parallel. Preserve other sessions' changes and stage only your own exact paths.
Never stash, reset, amend or rebase someone else's work. Use normal pushes, never force pushes.
Inspect remote divergence before integration and repeat affected checks when the integrated tree changes.

Commit subjects follow `type(scope): outcome` in English. Existing types are `feat`, `fix`, `perf`,
`refactor`, `config`, `infra`, `docs`, `ci`, `chore`, `test`, `style`, and conventional `build` where
appropriate. `.releaserc.json` releases every new successful master delivery: `feat` is minor;
`!` / `BREAKING CHANGE:` is major; all other changes are patch, including docs, CI, tests and build.
The highest bump across the delivery wins. Use Conventional Commits so the changelog explains each
change. The tagged `chore(release)` metadata commit uses `[skip ci]` to prevent a release loop;
rerunning an already released source must not create another version. Do not add `[skip ci]` to
ordinary changes. Failed checks block publishing. Breaking changes require an explicit
compatibility decision and `!` / `BREAKING CHANGE:` as appropriate. There is no commitlint hook yet.

Use `docs/templates/change.md` for the handoff. Review a fixed diff before committing/pushing, link the
spec, and record checks, risks and deployed revision separately. Keep refactors separate from behavior
changes. Follow the risk-based checks in `docs/engineering/testing-baseline.md`: focused local checks,
one independent review for high-risk code, and the existing full CI gate. Do not duplicate the full
suite locally or rerun successful checks on unchanged code by default.
PR-only Automatic Reviews and PR-required branch rules are not the selected workflow. Do not enable
rules that prevent the owner's direct-push workflow without a new explicit decision.

A push can trigger GitHub CI, semantic-release, images and hosting. The existing announcement job sends
newly published release notes to the private "Вахта Dev" group through "Вахта Changelog Bot". Check the
release and announcement jobs separately from deployment completion. See the operations runbook; do
not manually repost release notes or change notification destinations incidentally.
