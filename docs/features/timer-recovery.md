# Reliable reminders and escalations

Reminders are recorded with the action that requires them. A restart between saving a shift,
schedule or incident and dispatching background work cannot silently lose that work.

The system checks the current situation before producing a message. A completed break, superseded
schedule, acknowledged plan, closed incident or elapsed shift boundary must not produce a stale
instruction. Schedule acknowledgement recovery concerns future planned shifts, not old months.
A late cleaning reminder is suppressed after the planned end.

Current handover submission passes the report to the master immediately. It does not create another
acceptance timeout. Older submitted reports retain their existing timeout workflow. A report without
a zone uses neutral wording about the review deadline; the system does not invent a receiving worker.
Safety incidents retain immediate escalation without an SLA timer.

Existing notification deduplication remains in place. Retrying a timer does not reset a sent or failed
notification. When an older failure recorded an escalation event but missed its timestamp projection,
recovery uses that event's original time. It preserves later acknowledgement and decision history.

This work adds no employee steps or new menu. The technical contract and verification are in
[timer recovery engineering memory](../engineering/features/timer-recovery.md). Broader bonus and
Telegram recovery remain separate parts of the critical reliability work.
