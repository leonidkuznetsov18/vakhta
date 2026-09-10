# Reliable media processing

Photos received in Telegram are copied to private storage and checked for dimensions, brightness
and suspected duplicates. A low-quality or suspected duplicate photo remains available for human
review; processing does not impose a penalty.

A temporary download, upload or database failure can be retried without asking the worker to send
another photo. Processing status and its completion event are committed together. Repeating an
attempt uses the same storage location, including across a month boundary. Older completed records
missing their completion event can be repaired from saved metadata without downloading again.

Photo registration now saves its processing task in the same transaction. Startup and periodic
recovery find missed legacy admissions, and expired task leases survive worker restarts. Missing
credentials and transient failures remain retryable. A timed-out attempt cannot publish late results.
When checklist-photo quality changes, a durable bonus recalculation is saved for the affected shift;
its API consumer is a subsequent integration step.

Private file access, retention policy and worker menus are unchanged. Legacy BullMQ media jobs keep
draining through the shared processor. Broader timer and bonus recovery is tracked in
[background effects](background-effects.md).
