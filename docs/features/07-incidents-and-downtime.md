# Downtime and incidents (spec 5.5)

- "Начать простой" in the bot: reason from the directory, optional comment; the shift goes to
  DOWNTIME, the master is notified and the downtime escalates to the master after the configured
  minutes. "Вернуться" ends it.
- "Сообщить о проблеме": reason, comment or photo when the reason requires it, and the question
  whether work has stopped; a critical reason notifies the master at once.
- Panel "Простои и инциденты": list with statuses (OPEN → IN_PROGRESS → RESOLVED / REJECTED /
  DUPLICATE), SLA deadlines, actions for open incidents, statistics per
  reason and zone. The employee is notified when the incident is resolved.
- Reports "Простои" and "Структура времени" show downtime minutes per employee, reason and zone.

Downtime never reduces the bonus score by itself; only missing paperwork does (spec 7.4).

## Diagnosis and reusable solutions

Breakdown reports require a photo; the worker may add a caption. The master sees the evidence and
records **Cause** and **How was it resolved?** instead of a generic comment. Drafts may be saved;
both fields are required when marking an incident resolved. Every edit stays in history, including
previous comments. Resolving an incident does not itself end the worker's downtime.

Historical incidents, photos, causes and solutions are available in **Downtime and incidents**:
select **All** and search by problem, cause, solution or worker. One page handles active work and
past examples, with day, month, year and all-time filters. The duplicate knowledge-base page has
been removed; its old links open the complete incident list and retain the selected incident.
No incident records or decisions are removed. See the
[engineering memory](../engineering/features/incident-knowledge.md).

Resolved and closed records show only read-only information, photos and history.

### Period ranges

The incident list provides separate From and To date fields, matching the photo library.
Selecting a date updates the list and statistics. Either field may be empty to leave that bound
unrestricted; both empty means all time. The final selected day is included completely in the site's
timezone. The clear icon removes both bounds. Previously saved month/year ranges retain their full
calendar boundaries in the new fields.

### First-response SLA

The deadline starts at incident registration and measures the master's first recorded response,
not repair completion. Acknowledge, In progress or Resolved records that response; viewing a row
or saving notes does not. Only unanswered open incidents have a live countdown. Afterwards the table
shows On time with response duration, or a fixed response delay, and retains the original deadline.
Safety uses Immediate response with its recorded response duration. Rejected/duplicate records
without response have no active countdown; missing legacy response times remain explicitly unknown.
Historical breaches remain in statistics; red row backgrounds indicate only outstanding response work.

### Panel workspaces

Use **Incidents** for the operational queue, employee reports and master decisions. Severity appears
beside the problem; Impact shows workers currently in downtime and the report count. Expand the row
for evidence, diagnosis and history.

Use **Downtime statistics** for retrospective analysis. One set of totals covers the selected site
and period across all statuses. Switch **By reason / By zone** to compare a single full-width table;
search and sorting apply to that breakdown, while period totals remain unchanged. Durations include
hours/minutes; an unknown average resolution is shown as a dash. Phones show named cards with the
same metrics. Open/All is a queue filter and is not presented as a statistics filter.

The statistics tab has a bookmark at `#/incidents/statistics`. Returning to Incidents restores the
open record and its draft; existing direct incident links continue to open their row.
