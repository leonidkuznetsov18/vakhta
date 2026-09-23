# ADR-0016: Schedule changes inform workers without asking for acknowledgement

- Status: accepted
- Date: 2026-09-23
- Decision owner: project owner
- Spec sources: 3.2, FR-SCH-03, spec 10 (reminders)

## Context

Spec 3.2 asked every worker to confirm a published schedule with an «Ознайомлений» button, and the
worker re-sent an acknowledgement reminder after 24 hours. On the floor, workers skipped the button;
publication then carried an open confirmation that nothing depended on. The notification also said
only "added 0, cancelled 0, changed 1", so the worker still did not know which day had changed.

## Decision

A published schedule applies at once and the worker is informed, not asked to confirm:

- The Telegram notice names every change of that worker, one line per shift in date order:
  `➕ Додано сб 27.09: денна 08:00–20:00 · Зона`, `❌ Скасовано …`, `🔄 Змінено … → …`. A change of
  kind, team or position alone shows the shift without an arrow. Long lists stop after 12 lines, or earlier
  to keep the text under Telegram's 4096 characters, with "…і ще N". The publication reason follows when given.
- The only button is «📅 Переглянути графік». It opens that month's plan as a new message, so the
  list of changes stays readable.
- Publication no longer arms acknowledgement reminders; queued reminders and outbox rows from
  earlier publications expire unsent. The panel no longer shows an acknowledgement row, the
  reminder endpoint and the acknowledgement status endpoint are removed, and the
  `ackReminderHours` tenant setting is gone.
- «Ознайомлений» buttons left in old chat messages answer that confirmation is no longer needed and
  open the current plan. They write nothing.
- Recorded acknowledgements stay in `assignment_acknowledgements`: presence evidence and the XLSX
  export still show them for the shifts where they exist.

## Consequences

Masters no longer see who read the schedule; delivery is still visible in the notification outbox.
The `ACK_REMINDER` task kind and outbox template stay valid so that already queued work drains.

## Rejected alternatives

Keeping the button next to a better message: the owner wants no confirmation step at all.
Escalating unread schedules to the master: adds a workflow for a signal nobody acts on.
