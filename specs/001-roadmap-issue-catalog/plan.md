# Implementation Plan: Roadmap issue catalog

**Change**: 001-roadmap-issue-catalog | **Date**: 2026-09-12 | **Spec**: [spec.md](spec.md)
**Baseline**: `catalog.json.source_revision` | **Checkout**: master
**Engineering memory**: [Roadmap issues](../../docs/engineering/features/roadmap-issues.md)

## Summary

Publish a reviewed snapshot of existing requirements as three GitHub epics with native sub-issues.
Keep detailed source documents authoritative; provide a central index and explicit scope/status policy.

## Technical Context

Use the existing GitHub connector to create issues and authenticated GitHub REST through `gh` for
labels, native parent relations and independent readback. Official references:
[issue sub-resources](https://docs.github.com/en/rest/issues/sub-issues) and
[labels](https://docs.github.com/en/rest/issues/labels). No new library or product runtime is required.

## Constitution Check

Pass before and after design: documentation-only scope; existing backend/domain/FSD/state/i18n and
access invariants stay in future issue acceptance. Current master, one writer/index owner for this
change, selective staging and risk-based verification. Concurrent source edits remain untouched.
No constitution exception is needed. Product expansion remains subject to its existing source gates.

## DESIGN: Ownership and Behavior

`catalog.json` is a reviewed publication payload containing unique keys, Spec Kit task IDs, source IDs,
labels, prerequisites and acceptance. Three parents precede child creation. Native sub-issue links
provide live completion counts. Bodies include pinned source links and clickable dependencies.
Only declared dependencies are blocking; cross-epic reuse links are related work, not invented gates.

Before writing, inventory open and closed issues. Stable `vakhta-backlog:<key>` markers support
recovery. Persist receipts; after an uncertain response reread the repository before retrying. Serialize
mutations, respect rate limits, never force reparenting, and inspect any non-owned matching record.
After all children exist, update parent checklists and read back the complete live graph.

GitHub owns current state/status. Initial status is backlog, needs-decision, discovery or deferred.
Use in-progress/blocked when execution begins; completion uses the closed issue state and evidence.
A closed not-planned discovery is a documented decision, not shipped product functionality.

## Project Structure and Allowed Files

- `specs/001-roadmap-issue-catalog/{spec.md,plan.md,tasks.md,catalog.json,issues.json}`
- `specs/001-roadmap-issue-catalog/checklists/requirements.md`
- `docs/engineering/roadmap.md`
- `docs/engineering/features/roadmap-issues.md`
- `docs/features/README.md`: link planned briefs and the engineering roadmap

One current-task writer owns these paths and the corresponding GitHub metadata. Preserve all other
changes. The ignored `.specify/feature.json` selects this working specification only.

## Lean Review

Simplify: group coherent streams, reuse Schedule/AI issues for overlapping competitor ideas, keep
three predictable title segments, and defer undemonstrated platform scope. The new calendar component
has an explicit decision/prototype gate, avoiding accidental vendor selection.

## IMPLEMENT: Ordered Delivery

Prepare reviewed payloads and tasks, create labels, publish parents then children with receipts,
link native hierarchy, verify all metadata and source coverage, write the index and delivery evidence.
Publish one coherent docs commit through the existing master workflow. No intermediate release pushes.

## VERIFY and HARDEN

Validate JSON, unique keys/titles/task IDs, exact source-set coverage, prerequisite existence and
ordering, and nonempty acceptance. Read back all issues: exact titles/labels, body markers, open state,
source/dependency links and native parent identities. Confirm no duplicates across open/closed issues.
Run Prettier on owned Markdown/JSON and `git diff --check`; check relative local links. Application
checks and product visual QA are not applicable. Convergence compares only catalog scope.

## REPORT and Documentation

Record creation and readback counts, issue links, scope boundaries and actual verification in the
feature memory. Keep live CI/release outcomes separate from local format checks and product delivery.

## Open Decisions

None blocks catalog publication. Product decisions remain explicitly inside the relevant issues.
