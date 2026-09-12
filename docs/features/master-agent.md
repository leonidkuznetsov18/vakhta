# Master agent

Status: proposed plan, 2026-09-12. Planning only; operational autonomy is not approved.

## Outcome

Automatically review submitted handovers, incidents and eligible requests, collect relevant evidence,
identify missing information and prepare an actionable recommendation. Expand to explicitly permitted
operational actions only after evaluation and a separate decision on authority.

The first experiment tests whether this reduces master's review effort without adding worker paperwork
or increasing missed issues. No production time saving or model accuracy has been established.

## Proposed scope

| Surface   | Automatic review                                                                              | Initial human responsibility                                                       |
| --------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Handovers | Check answers, photo quality, configured object rules and contradictions; cite each finding   | Accept or remark; establish physical conditions and responsibility                 |
| Incidents | Summarize evidence, flag urgency, suggest related cases and missing information               | Confirm diagnosis, actual repair, duplicates and resolution                        |
| Requests  | Check completeness and current approval step; prepare a recommendation from permitted context | Approve/reject, authorize schedule/time changes; preserve HR and counterpart steps |

## Operating modes

1. Shadow: persist review results for evaluation, without changing decisions or sending worker messages.
2. Assistant: automatically prepare reviews inside existing detail surfaces; master confirms or edits.
3. Limited autonomy: execute only explicitly allowed actions for an evaluated case category. This mode
   is a separate product decision, particularly for acceptance, scoring, attendance and schedule effects.

AI results do not establish workplace safety, worker fault or actual repair. Medical attachments stay
outside the master agent's context. Urgent escalation and manual work continue when AI is unavailable.

## Functional acceptance criteria

- Each review identifies the source record/version, applicable rules/version, evidence, findings,
  missing data, recommended next action and whether human review is required.
- Missing evidence, uncertain images and provider errors never become an automatic clean verdict.
- Results remain separate from human decisions and training labels. Original evidence and history remain.
- Replaced photos, edited records and concurrent decisions invalidate dependent recommendations.
- Review never bypasses the request approval route or the actor's site/unit/zone scope.
- Retries cannot duplicate a committed decision or notification intent. External delivery uncertainty
  is handled explicitly. Manual processing does not wait for AI.
- The UI identifies AI authorship, exposes source evidence and supports human correction and escalation.
- An operator can disable automatic admission and execution independently and retain manual operation.

## Pilot and progression

Read-only production inventory on 2026-09-12 found 42 handovers, 77 photo attachments, nine saved human
photo reviews and one reference photo. All counts include unclassified operational/test/seed records.
There are 33 incidents but only two with both cause and solution, and six requests. Current v4 analysis
has one successful and seven failed stored runs, so provider reliability and cost need attention first.

Start with **Оператор СТ вторая стенка**: ten reports, 24 distinct photos, seven saved photo reviews,
one reference and four configured objects with notes. Curate these existing examples before collecting
more; do not assume 100-200 labeled reports already exist. Pilot automatic review with human decisions.

Reuse existing completeness checks and object rules. Add report-level evidence coverage, item-specific
review criteria and an explicit binding to reference revisions. Current object detection alone cannot
approve a whole report. Missing, unreadable or unchecked evidence leads to human review.

Keep evaluation cases separate by shift/workplace/time and near-duplicate photo groups. Distinguish
manual, AI-assisted and adjudicated labels. Measure missed issues by severity, false alarms, review
coverage, master corrections, active human effort, queue waiting, latency and attempted-call cost.
A usefulness rating alone does not measure accuracy. Human-review a sample of no-issue results.

Agree category thresholds and sample coverage before autonomy. A model confidence score or zero
critical misses in a tiny sample does not authorize automatic acceptance. Severe misses, unauthorized
access, stale actions or increased rework return the category to assisted review.

## Decisions needed before implementation

- Which checklist family and unit should pilot, and who owns its rules and reference decisions?
- Which eventual actions may be autonomous, and which always require a person?
- What mistakes, latency and cost are acceptable for each case category?
- Which providers may receive which data, with what retention and access restrictions?

See [the technical plan and task list](../engineering/features/master-agent.md).
