# Master remarks on checklist reports

Owner clarification, 2026-09-10: require a comment for a remark, display it in the expanded table row,
and send the same text to the report's submitting employee in Telegram.

Existing service behavior already satisfies validation and delivery: `HandoverService.resolve`
requires at least three characters, stores the resolution and enqueues `HANDOVER_RESOLVED` in the
same transaction. For `RESOLVED_ISSUE_CONFIRMED`, localized Telegram text includes the exact comment;
the recipient is `record.submittedBy`, not the current master or next shift. The existing dedupe key
prevents an additional delivery intent for the same decision. No second sender was introduced.

The panel previously omitted `detail.resolutions`. The expanded row now renders recorded decisions,
timestamps and comments as text. Completed report states retain their existing form-hiding rule.

Evidence: existing component scenarios cover required remark text and submission; the added completed
report scenario covers displaying the stored master decision without an editing form. A bounded,
read-only production check of the latest ten possible remark records returned one existing record:
its outbox status was SENT, recipient matched the submitting employee, and the payload contained the
exact stored comment. No production report, employee message or decision was fabricated for testing.

Lean: keep the decision beside the original evidence; record once, reuse for the employee message.
Avoid repeat entry and misleading controls after the master has handled the report.

## Review deadline correction

Owner decision: day shift review ends at 22:00, night shift at 10:00 next day in site time.
The session plan-end snapshot takes precedence over the legacy assignment; add 120 minutes.
Late submission cannot extend the deadline. Missing historical plans retain the submission fallback.
Only SUBMITTED/DISPUTED reports become overdue, strictly after the deadline. Completed reports show
an absolute deadline without a live overdue counter. Production has no explicit window override.
Migration 0030 updates only pending reports with known plans, audits the change, and reschedules
existing legacy timeout tasks atomically (including stale completed tasks). A transactional table lock fences workers before report locks. The migration temporarily suspends
only the background-task intent trigger for this correction and restores it before commit; normal
writers retain the guard. Already escalated and completed report history remains unchanged.
Regression coverage includes exact boundary, disputed reports, unscheduled plan snapshots, migration
idempotency/history preservation and legacy timeout execution at the new deadline.
