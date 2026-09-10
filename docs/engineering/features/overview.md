# Overview attention queues

Updated: 2026-09-10. Owner request: audit every card and ensure pending master decisions are visible
before their deadline. The supplied example has six submitted checklists before 22:00 but a zero card.

## Rules and destinations

Counts use the same eligible records for people, first row and business date. Every API enforces the
signed-in user's scope; the panel only requests queues available to their roles.

| Card                                 | Eligibility                                                               | Destination                                                          |
| ------------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Checklists without a master decision | SUBMITTED or DISPUTED, any submission date, including before the deadline | Pending handovers; clear date, site and search; open first report    |
| Open incidents                       | Domain open statuses                                                      | Open incidents, all time; clear site/search; open first incident     |
| SLA breached                         | Open incident, SLA breached, no acknowledgedAt or resolvedAt              | Open incidents, all time; open first unanswered breach               |
| Requests at my step                  | Open requests returned by the role-filtered inbox                         | Inbox; clear search; open first request                              |
| Overdue requests                     | Same inbox, overdue=true                                                  | Inbox; open first overdue request                                    |
| Overtime awaiting decision           | PENDING only                                                              | Inbox; open first overtime shift                                     |
| Telegram not activated               | ACTIVE employee without Telegram link                                     | Active/unlinked employee filter; clear search                        |
| Terminals not paired                 | ACTIVE terminal, paired=false                                             | Administration / terminals; clear search                             |
| Unscheduled shifts                   | No assignment, endedAt=null, active domain state                          | Existing unit/month/person schedule preset                           |
| Closed without checklist in 24h      | Ended shift with autoCloseReason=NO_CHECKLIST in API's rolling 24h window | Operations ALL; first record's business date; clear site/unit/search |
| In downtime                          | endedAt=null and DOWNTIME                                                 | Operations OPEN/DOWNTIME; first record's business date               |
| On shift                             | endedAt=null and active domain state                                      | Operations OPEN; first record's business date                        |

Operations has a day filter, so its destination opens the first counted business date; the overview
can include open shifts from multiple business dates. Incident and request destinations retain the
complete open/inbox queue and expand the matching record, rather than adding bespoke filter modes.
Normal pending checklists use amber attention styling; this card does not assert an SLA breach.

## Implementation

`features/overview/model/attention.ts` owns pure eligibility and prepared data, `queries.ts` subscribes
to existing list query keys, and `destination.ts` prepares destination filters without modifying drafts.
The former aggregate query could stay stale after another page invalidated its own list. Shared keys
now update the overview and sidebar on those invalidations, with the existing 60-second polling fallback.
Failed or unavailable sources stay unknown, not zero. Cached results survive a refresh failure with
visible retry feedback; all-clear requires every eligible source to be complete. Authentication and
role checks prevent disabled queries from exposing an earlier cached queue.

The requests inbox previously limited to 500 rows before role filtering. An older request eligible
for a master could disappear behind 501 newer requests assigned to HR. The actionable inbox now
filters the complete open queue; historical browsing keeps its existing 500-row cap. This preserves
role-step filtering and medical-document masking. A future paginated server-side count endpoint may
reduce transfers for much larger queues; do not reintroduce a cap before authorization filtering.

Navigation now writes the final tab/row after the app's section navigation. This avoids resetting
`administration/terminals` to the default employee tab. Telegram username draft state has a separate
key from the linked/unlinked employee filter.

## Evidence and Lean decision

- 14 pure regression cases cover all card eligibility, unknown/empty data and destination presets.
- 8 query/component cases cover six pre-deadline reports, immediate shared-cache updates, source
  failure, HR and unauthenticated permissions, all-clear suppression, and actual report/terminal clicks.
- Two focused PostgreSQL inbox tests pass, including the 501-newer-record role-filter regression.
- Panel/API typechecks pass. Changed-file lint and formatting are checked before delivery.
- Real Overview components inspected in browser at 1440x1000 and 390x844 with six synthetic submitted
  reports. Pending work appears immediately; mobile labels wrap and document width equals viewport.
- Independent access-boundary review found the route-reset bug, now fixed and protected by click tests.

Lean: proceed. Surface work when it becomes actionable, preserve ownership and remove repeated filter
clearing. Distinguish a waiting decision from a breached deadline to avoid false urgency. No new worker
input or production employee actions are needed for this correction. Live release evidence follows CI.
