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

The incident list provides a From/To filter. Day mode selects dates, month mode
selects months without day cells, and year mode selects years. Choose both endpoints and press Apply;
the last selected day/month/year is included completely, using the site's timezone. All time removes
the date restriction. Selecting the same month or year twice creates a one-month or one-year range.

### First-response SLA

The deadline starts at incident registration and measures the master's first recorded response,
not repair completion. Acknowledge, In progress or Resolved records that response; viewing a row
or saving notes does not. Only unanswered open incidents have a live countdown. Afterwards the table
shows On time with response duration, or a fixed response delay, and retains the original deadline.
Safety uses Immediate response with its recorded response duration. Rejected/duplicate records
without response have no active countdown; missing legacy response times remain explicitly unknown.
Historical breaches remain in statistics; red row backgrounds indicate only outstanding response work.
