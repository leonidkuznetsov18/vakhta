# Stable panel feedback

Status: accepted. Owner request, 2026-09-11: stop recurring page jumps while people read and work.
Baseline: `a7517ab`. Engineering evidence: [UI feedback](../engineering/features/ui-feedback.md).

## RECON

The production handover table moves down 32 px during its ten-second background fetch and back up
when the request finishes. QueryFeedback inserts/removes an inline loading row. Multiple page and
expanded-detail queries share this behavior; a request-detail wrapper adds a grid row of its own.
The minute clock updates relative deadlines separately.

## SPEC

- Background reads must not insert/remove content above tables or inside expanded details.
- Keep polling and current data; retain the current page, expanded record, draft, focus and scroll.
- Show one small refresh indicator in a permanently reserved header slot, including simultaneous reads.
- Keep initial loading, offline feedback, failures and explicit retry visible at the affected surface.
- Desktop and mobile layouts must remain stable when only fetch status or deadline text changes.

No changes to domain time rules, polling cadence, request contracts, mutations or permissions.
Genuine record changes and actionable errors may update the visible content.

## DESIGN and IMPLEMENT

TanStack Query continues to own requests. The domain-independent `shared/ui/query-activity.tsx`
subscribes to active successful queries that are fetching, using the existing Spinner and translations.
The app composes it in the header. Legacy QueryFeedback and request-detail consumers keep their current
placement; a broad FSD migration would not help this shared presentation fix. Local feedback handles
initial loading/error/offline; successful background activity does not occupy the content flow.

## VERIFY and HARDEN

Focused table and Query activity regressions cover repeated refreshes, concurrent queries, loading,
error retry, empty results, cached rows, page/disclosure/focus and draft retention. Capture and inspect
1440x1000 and 390x844 layouts and compare element coordinates during polling and a minute tick.
Check affected types/lint, then use existing CI/release/Pages delivery and verify the deployed panel.

## REPORT

Record executed checks, browser measurements, Lean recommendation and limitations in the existing
engineering feature memory. No production employee actions are required for this read-only UI check.
