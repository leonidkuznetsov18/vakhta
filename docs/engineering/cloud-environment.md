# Codex Cloud environment draft

Select Node 22.12+ within major 22 and configure `.codex/setup.sh` as the setup command. The same script
is idempotent enough for a maintenance command after a cached checkout changes. It reads the pinned
pnpm version from package.json, installs existing locked dependencies and builds workspace exports.
Vitest, TypeScript and ESLint are already dependencies; do not install competing global versions.
No Cloud environment was created or enabled by adding this file.

## Network and execution boundaries

| Phase                                              | Required access                                                                                                                                   | What does not happen                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Setup                                              | npm/package registries for pnpm and the frozen lockfile; platform packages/postinstall artifacts where required                                   | No production login, migration, seed, webhook or deployment                    |
| Optional setup image preload                       | Working Docker daemon, image registry access for postgres:16-alpine, redis:7-alpine and testcontainers/ryuk:0.14.0; set VAKHTA_SETUP_CONTAINERS=1 | No assumption that hosted Docker is available; missing daemon fails explicitly |
| Agent: build/lint/typecheck/domain/component tests | Installed dependencies; normally no internet                                                                                                      | No reinstall merely to execute checks                                          |
| Agent: API/worker integration tests                | Docker socket, cached images and localhost/container networking                                                                                   | No production DATABASE_URL or Redis service                                    |
| Agent: live product QA or source research          | Explicitly configured access to required origins and authorized test accounts                                                                     | No transfer of desktop 1Password credentials into Cloud setup                  |

The helper image is the current locked Testcontainers default; revisit it when that dependency changes.
A preloaded image does not prove the hosted runtime supports Docker or its networking. Verify a full
suite in the actual Cloud environment before describing integration tests as supported there. If Docker
is absent, `pnpm check` cannot honestly be marked passed; report the constraint and use CI for the full
suite. Pure package tests remain useful but do not replace it.

Official documentation states that setup has internet access, agent internet access is separately
configured, and setup secrets are removed before the agent phase. Setup exports do not persist to the
agent shell. Configure required non-secret environment settings in the environment UI. Avoid background
servers in setup unless their lifetime is explicitly managed and verified.
[Cloud environment documentation](https://learn.chatgpt.com/docs/environments/cloud-environment).

## Validation

Use `bash -n .codex/setup.sh`, run it against a clean checkout with the intended toolchain, then run
`pnpm build` and `pnpm check`. The script was reviewed and exercised locally; this is a draft for Cloud,
not evidence that a hosted environment was provisioned. Dependency installation remains frozen and
must not modify pnpm-lock.yaml.
