# Feature Specification: Roadmap issue catalog

**Change**: 001-roadmap-issue-catalog | **Created**: 2026-09-12 | **Status**: Accepted
**Checkout**: master | **Authority**: Owner request to organize and publish roadmap issues
**Baseline**: See `catalog.json.source_revision`
**Product document**: Existing Schedule and AI Master briefs; no product behavior changes
**Engineering memory**: [Roadmap issues](../../docs/engineering/features/roadmap-issues.md)

## RECON: Current Behavior

Schedule requirements and implementation streams live in
[the product brief](../../docs/features/schedule-calendar-redesign.md) and
[engineering plan](../../docs/engineering/features/schedule-calendar-redesign.md).
AI Master has corresponding [product](../../docs/features/master-agent.md) and
[engineering](../../docs/engineering/features/master-agent.md) documents.
The [Connecteam comparison](../../docs/research/2026-09-12-connecteam-functionality.md)
contains 90 capabilities, not 90 approved features. The initial GitHub inventory contained no issues.
The calendar engine is not selected. Competitor research and AI inventory are dated snapshots.

## SPEC: Outcome and Boundaries

Publish three epics and actionable child issues with consistent names, labels, source IDs, scope,
acceptance criteria and dependencies. Preserve existing source documents and implementation ownership.
The accepted change is catalog publication, not implementation of the roadmap. `/speckit.implement`
and `/speckit.converge` apply to this catalog's specification only. No product code, live production
mutations, paid services, assignees, deadlines or commercial commitments are introduced.

Assumption: English issue titles follow repository language rules. Use
`Epic | Capability | Outcome`; parent issues use `Epic | Epic | Outcome`.
An issue represents a coherent delivery stream or bounded discovery, not every competitor checkbox.
Source-level tasks remain references; publication task IDs are namespaced by this specification.

## User Scenarios and Testing

### US1: Browse and track the roadmap (Priority: P1)

The owner opens GitHub Issues, filters by area/status, and opens an epic to see native child progress.

- **AC-001**: Exactly three epic issues have the intended names and area/type/status labels.
- **AC-002**: Every child has one correct native parent, three-part title, scope, source IDs,
  acceptance criteria and resolvable prerequisite links where prerequisites are catalogued.
- **AC-003**: Coverage includes SC-01–50, all Schedule T-00–15, AI A1–E1 (15 streams), and CT-01–90.
  Selecting and validating the calendar component has an explicit issue.
- **AC-004**: Discovery, decision and deferred work are distinguishable. Separately scoped costs,
  integrations and autonomy retain their gates. Existing capabilities are not marked newly complete.
- **AC-005**: A repeat publication can find existing issues by stable marker across open and closed
  issues. Partial API failure is recoverable without blindly duplicating issues or reparenting others.
- **AC-006**: A repository index links the three epics and their children, explains status usage and
  maps F1/M1–M8 overlaps to existing issues. Source briefs remain authoritative for requirements.

### Edge Cases

Partial publication, API rate limits, unavailable native hierarchy, duplicate titles, closed existing
issues, concurrent repository edits, uncertain write outcomes and dependencies outside this catalog
must be handled explicitly. Record exact blockers instead of claiming creation or completion.

## Requirements

- **FR-001**: Preserve source identifiers and pinned source links in every issue (AC-002/003).
- **FR-002**: Use labels for area, type and status; preserve source priorities without inventing others
  (AC-001/004). Issue state is authoritative for completion.
- **FR-003**: Deduplicate by stable `vakhta-backlog` marker; inspect any pre-existing match before
  mutation and verify writes through the repository API (AC-005).
- **FR-004**: Keep pending product work open. Checked publication tasks mean published and verified,
  never that the described product feature shipped (AC-004/006).

### Key Entities

Epics group child issues. `catalog.json` stores reviewed publication payloads and immutable source
revision; `issues.json` records their issue identifiers. GitHub is the live status authority.
The catalog is a publication snapshot, not an automatic synchronization service.

## Success Criteria

All six acceptance criteria have recorded evidence. The owner can browse 3 epics and 50 children,
filter initial statuses and follow complete source coverage without mistaking research for delivery.

## Verification Scope

Documentation/external issue metadata only: validate payloads, coverage, references, labels, native
parents and deduplication against live GitHub. Format and inspect task-owned files. No application
behavior changes; application tests, build and product screenshots are inapplicable here.
