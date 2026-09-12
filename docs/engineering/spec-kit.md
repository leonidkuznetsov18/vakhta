# Spec Kit in Vakhta

Spec Kit 1.0.6 is configured for Codex with Bash helpers. It supports the existing engineering
sequence; it does not change domain behavior, architecture, verification policy or Git ownership.
Use it for bounded changes that benefit from a written contract and plan. Small, clear edits keep
the normal lightweight workflow.

## Setup and Ownership

The repository contains `.specify/` and `.agents/skills/speckit-*/SKILL.md`. The official CLI is a
developer tool, not an application dependency. Install it on another machine with:

```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@v1.0.6
specify version
```

A fresh checkout already contains project setup; do not run init on every task. The owner's global
skills can coexist with local copies. Prefer the repository copy for Vakhta so the tracked version
is reproducible; do not invoke both copies for one stage.

Owner instructions, `AGENTS.md`, accepted engineering standards and the constitution take precedence
over upstream examples. Tests are required according to risk and all writing is sequential. Do not
install the optional Git extension or introduce branches/worktrees. The constitution links canonical
rules rather than establishing another independent rulebook.

## Artifacts and Sources of Truth

| Location                                 | Owns                                                           |
| ---------------------------------------- | -------------------------------------------------------------- |
| `.specify/memory/constitution.md`        | Spec Kit entry point to accepted repository principles         |
| `.specify/templates/overrides/`          | Project-specific spec, plan and task templates                 |
| `specs/<change>/spec.md`                 | Requirements, non-goals and acceptance criteria for one change |
| `specs/<change>/plan.md`                 | Design, ownership, ordered approach and verification plan      |
| `specs/<change>/tasks.md`                | Execution status and evidence links                            |
| `docs/features/<feature>.md`             | Current behavior for product/support readers                   |
| `docs/engineering/features/<feature>.md` | Durable decisions, Lean review, evidence and remaining work    |

The three change artifacts collectively follow `docs/templates/spec.md`; do not create another copy
of the same specification. Link existing feature documents. Developer-only workflow work uses the
development-workflow engineering memory and needs no product document. Research, models, contracts
and quickstarts are extra files only when useful; existing definitions can be linked directly.

During implementation, keep the active spec and plan consistent with accepted decisions. On delivery,
update current product behavior and feature memory once, then retain change artifacts as historical
records. Later changes get another bounded spec; correct inaccurate historical evidence explicitly.

## First Feature and Daily Workflow

Choose one real, independently verifiable change. Provide the actor, observed problem, desired result,
compatibility boundaries and known non-goals. Do not retroactively specify the entire application.
Commands below are Codex messages, not shell commands. Replace descriptions with the actual request
and carry the active change directory forward at each stage.

1. `$speckit-specify <bounded change and acceptance outcomes>`: inspect current behavior and reuse
   candidates, then create the spec using the local override. Record authorization and baseline.
2. `$speckit-clarify <material unresolved behavior>` only if needed: resolve ambiguity before design.
3. `$speckit-plan <existing architecture and affected boundaries>`: prepare the smallest design and
   exact required checks; link existing contracts and feature memory.
4. `$speckit-tasks`: produce dependency-ordered tasks with exact paths, acceptance mappings and
   required checks. Use one writer/index owner.
5. `$speckit-analyze`: check consistency and coverage before implementation; resolve demonstrated
   blockers without adding unrequested scope.
6. `$speckit-implement`: execute accepted tasks and record real verification evidence. Existing
   authorization is sufficient; no repeated approval ceremony between clear stages.
7. `$speckit-converge`: compare code with the accepted artifacts. Append tasks for demonstrated gaps
   and return to implementation; stop when acceptance and required checks are satisfied.

`$speckit-checklist` optionally reviews requirements quality; it is not a substitute for code tests.
`$speckit-constitution` applies when accepted principles change, not on every feature.
`$speckit-taskstoissues` writes external GitHub issues; run only when the owner requests that output.
The bundled workflow definition is available, but no unattended workflow or schedule is enabled.

## Active Feature and Handoff

Spec Kit selects the change through `.specify/feature.json`; Git branch selection does not select it.
The pointer is ignored by Git and shared by sessions in this checkout. It is intentionally absent
until a real feature is selected. Never invent a feature just to populate it.

Start/resume each stage by naming the exact `specs/<change>/` directory in the Codex message. The
agent checks the pointer, reads spec/plan/tasks and reports the next action before writing. For
read-only work on another feature, pass `SPECIFY_FEATURE_DIRECTORY` to each helper invocation instead
of changing the shared pointer. Do not persist this override globally.

```bash
# Replace the path with an existing change directory; run from the repository root.
SPECIFY_FEATURE_DIRECTORY=specs/001-example \
  .specify/scripts/bash/check-prerequisites.sh --json --paths-only
```

This variable selects the directory; `SPECIFY_FEATURE` only supplies a label. Separate directory
overrides do not permit concurrent writers. Handoffs include feature directory, baseline/head,
owned files/index, decisions, evidence, blockers and next action.

## Verification and Maintenance

Use `docs/engineering/testing-baseline.md`. Template/constitution changes need formatting, inspection
and focused resolver/helper smoke checks. They need no application build, UI screenshots or live
employee actions. Initial smoke checks use an isolated temporary fixture, preserving the real
active-feature pointer and product data. Acceptance requires:

- The integration and scripts load with the pinned version.
- The resolver selects all three overrides; the constitution contains concrete principles.
- Plan/task helpers use the overrides; prerequisites report missing artifacts honestly.
- Repeated plan setup preserves existing work; managed manifests retain correct hashes.
- Machine-local feature state is ignored; only task-owned changes enter the commit.

Keep upstream-managed assets unchanged. `.prettierignore` excludes generated skill/metadata/core
template files to preserve hashes; local overrides, constitution and guides remain checked.
Customize overrides and canonical rules, not generated skills or scripts.

Check updates with `specify self check`. Updating the CLI does not update tracked project assets or
global skill copies. For a deliberate upgrade, inspect the current diff and installed state, update
the pinned CLI, then use `specify integration upgrade codex` and review the resulting changes.
Check the new version's shared-infrastructure upgrade instructions, preserve constitution/overrides,
and repeat smoke checks before one coherent delivery. Refresh global copies separately if desired.
Never run force init over unreviewed managed-path changes.

## Sources and Adoption Evidence

- [Spec Kit 1.0.6](https://github.com/github/spec-kit/releases/tag/v1.0.6)
- [Existing projects](https://github.github.io/spec-kit/guides/existing-projects.html)
- [Core commands](https://github.github.io/spec-kit/reference/core.html)
- [Integration management](https://github.github.io/spec-kit/reference/integrations.html)
- [Verification and remaining work](features/development-workflow.md)
