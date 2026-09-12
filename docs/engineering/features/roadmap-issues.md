# Roadmap issue catalog

## Scope and ownership

Owner request, 2026-09-12: organize Schedule calendar redesign, AI Master and Connecteam-inspired
capabilities into understandable GitHub epics/issues with tags, three-part titles and visible status.
This is developer-facing backlog publication; no product implementation or production mutation.

Authoritative change artifacts: [specification](../../../specs/001-roadmap-issue-catalog/spec.md),
[plan](../../../specs/001-roadmap-issue-catalog/plan.md),
[tasks](../../../specs/001-roadmap-issue-catalog/tasks.md).
The [roadmap index](../roadmap.md) is the navigation entry point. Existing product/engineering briefs
remain the source of requirements; source revision and payloads are pinned in `catalog.json`.

## Decisions

- Three epics: Schedule, AI Master and Workforce Platform. Child names use
  `Epic | Capability | Outcome`; source IDs and publication task IDs stay in bodies.
- 17 Schedule children cover T-00–15 plus explicit calendar component selection/prototype.
  Existing functionality and all SC-01–50 acceptance remain traceable; SC-46–49 stay gated.
- 15 AI Master children preserve A1–E1 priorities, the handover-first pilot, Shadow/Assist separation,
  access/evidence/freshness invariants and separately authorized autonomy.
- 18 workforce discovery children cover CT-01–90. F1 and M1–M8 map into these groups and existing
  Schedule/AI delivery. Present/Partial/Not-found are dated research evidence, not current release status.
- Native GitHub sub-issues provide parent progress. One status label per open issue and GitHub closed
  state provide lifecycle tracking. No invented assignees, dates, priorities or commercial commitments.
- Stable body markers and persisted numeric issue IDs support safe recovery across open/closed issues.
  The snapshot does not automatically synchronize future status or overwrite edited issue bodies.
- The GitHub connector returned HTTP 403 (integration cannot create issues). The already-authorized
  GitHub CLI successfully provides the same repository operations; no new authentication required.

## Lean review

**Simplify / Proceed**: the owner needs to find the next bounded change and see its state. Grouping
coherent streams and reusing overlap removes duplicate backlog entry and manual searching. No worker
steps or product screens are added. Source coverage, live parent relations and discoverable statuses
are the evidence for this internal change; no invented manufacturing time-savings metric.

## Verification and delivery

- GitHub publication completed: 53 open issues, 3 epics and 50 native children (17 Schedule,
  15 AI Master, 18 Workforce Platform). Issue receipts are retained in the specification directory.
- Independent live API readback passed: exact titles, full label sets, body markers, source IDs,
  acceptance text, pinned source links, prerequisite links, parent checklists and native parent sets.
  No duplicate marker exists across open/closed issues.
- Source coverage passed: SC-01–50, Schedule T-00–15, all 15 AI streams and CT-01–90.
  The calendar component decision is issue #5. F1/M1–M8 mappings appear in the roadmap index.
- Initial status totals: 30 backlog, 15 discovery, 2 needs-decision and 6 deferred. All are open;
  no feature is reported shipped merely because its publication task is checked.
- Relevant local checks: JSON/reference/coverage validation, owned Markdown/JSON formatting,
  relative document links and diff whitespace inspection. No application code changed; application
  tests, build, product screenshots and production checks were not run.
- Convergence is scoped to catalog publication. All AC-001–006 are satisfied; no missing catalog
  task was found. Future product implementation remains in open GitHub issues.
- Delivery uses one task-owned documentation commit on master. CI/release/announcement status
  is reported separately; local catalog verification is not evidence of application deployment.

## Remaining product decisions

Calendar library/license and prototype, operating policies, staffing/qualification ownership,
AI pilot curation and enrolled unit, provider budget, escalation recipient/channel and numerical
release thresholds remain in their respective issues. Competitor-inspired modules require a real
operational need and agreed bounded scope. Closing publication tasks does not complete these issues.
