# Vakhta Constitution

## Core Principles

### I. Correctness and recorded history

Correctness MUST precede specification, architecture, maintainability, type safety, testability,
performance and delivery speed, in that order. Changes MUST preserve domain invariants in
[AGENTS.md](../../AGENTS.md), including shift transitions, append-only evidence and authorization.
A successful database transaction MUST NOT be treated as proof that required queue or Telegram
side effects succeeded. This protects recorded work and recoverability.

### II. Repository-grounded design

Agents MUST inspect affected code, contracts, tests and feature documentation before designing a
change. New frontend ownership MUST follow FSD and deliberate public APIs; existing Nest modules,
the pure domain package and the vanilla kiosk retain their architecture. Reuse MUST follow
[engineering standards](../../docs/engineering/standards.md), including state ownership, runtime
validation and the application React hook policy. Do not migrate unrelated code or invent layers.

### III. Bounded specifications and explicit authority

Non-trivial changes MUST follow RECON → SPEC → DESIGN → IMPLEMENT → VERIFY → HARDEN → REPORT.
The owner's authorized request and concrete acceptance criteria are sufficient implementation
authority; only material unresolved requirements block dependent work. Specs MUST describe a bounded
change against an observed baseline, with non-goals and measurable acceptance outcomes. Do not
invent performance targets, domain rules or approval gates to fill a template.

### IV. Proportionate verification and evidence

Verification MUST follow the current [testing baseline](../../docs/engineering/testing-baseline.md).
Behavior changes require focused regressions. Money, access, attendance, transactions, migrations and
recovery require relevant invariant checks and one independent review. Simple documentation edits
do not require application tests or a full local build/check. Reuse valid results; report local,
cached, CI and deployed evidence separately. A completed task checkbox is not verification evidence.

### V. Worker value and accessible interaction

Product changes MUST preserve clear worker flows, the three localization catalogs and accessible
desktop/mobile behavior under [AGENTS.md](../../AGENTS.md). Use the existing Lean review skill for
feature/workflow design and completion; record its recommendation in the existing feature memory.
Only changed product surfaces need visual or live QA. Developer setup MUST NOT manufacture employee
actions or add work to an operational user journey.

## Repository and Artifact Ownership

Code, tests, documentation and commits MUST be English; owner conversation is Ukrainian.
AGENTS.md and the detailed engineering standards remain canonical. This constitution is their
Spec Kit entry point, not an independent source of competing rules.

- specs/<change>/spec.md owns accepted requirements for one change; plan.md owns its design and
  tasks.md owns execution status. Together they implement docs/templates/spec.md.
- docs/features/<feature>.md owns current product behavior; link it instead of copying its full text
  into every change spec. Developer-only work needs no product document.
- docs/engineering/features/<feature>.md owns durable decisions, evidence and remaining work.
  Keep one concise record and link it from the change artifacts.
- Completed change artifacts remain historical delivery records. Later behavior changes get a new
  bounded spec; corrections to historical claims MUST be explicit.

## Development Workflow

Work MUST stay in the current Vakhta checkout on master, with one writer and one Git-index owner
at a time. Do not create PRs, topic branches or worktrees, or modify another task's changes. [P]
in upstream task examples does not authorize parallel writers. Use normal task-owned commits and
pushes under [CONTRIBUTING.md](../../CONTRIBUTING.md); preserve the existing release/announcement path.

Use [the Spec Kit guide](../../docs/engineering/spec-kit.md) to select the active feature and run the
workflow. Clarification and requirements checklists are used when they resolve a concrete gap.
Research notes, data models and contract files are created only when useful to the affected change;
link existing definitions otherwise. Never generate empty phases or ceremonial documents.

## Governance

The owner authorized Spec Kit adoption on 2026-09-12 using already accepted project requirements.
Owner instructions and canonical repository rules take precedence over generic Spec Kit defaults,
including optional-test wording, parallel-write examples and branch-based workflows. Explicitly
record a conflicting requirement instead of silently changing project policy.

Update this constitution when the underlying accepted policy changes. Record the reason in the
development-workflow engineering memory. Use MAJOR for incompatible governance changes, MINOR for
new principles and PATCH for clarifications; this version is independent of the product release.
Constitution checks MUST evaluate applicable requirements without adding another approval ceremony.

**Version**: 1.0.0 | **Ratified**: 2026-09-12 | **Last Amended**: 2026-09-12
