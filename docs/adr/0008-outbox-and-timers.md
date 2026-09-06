# ADR-0008: Outbox and BullMQ for notifications and timers

- Status: proposed
- Date: 2026-09-05
- Spec sources: 10, FR-NTF-01, FR-NTF-02, FR-BRK-02, FR-COR-01, FR-COR-02, T-11, T-23

## Context

Notifications must be idempotent, have a delivery status and retry by policy. Reminders and escalations must not close states silently: a forgotten action becomes "needs clarification".

## Decision

A notification is created in the same transaction as the event, in `notification_outbox` with a `dedupe_key`. The worker takes rows with `FOR UPDATE SKIP LOCKED`, sends to Telegram, stores `telegram_message_id` and the status. Reminders and escalations: delayed BullMQ jobs with a deterministic `jobId` such as `break-reminder:<interval_id>`; when fired, the worker re-reads the state and exits if the action is already done. After the grace window the timer only sets the `needs_clarification` flag and escalates to the shift master. A timer never changes an interval.

## Consequences

Losing a Telegram response does not lose the notification. Cancelling a timer is deleting a job by a known id. Queues and outbox age are key alerting metrics.

## Rejected alternatives

Sending from the request handler: lost on a crash after commit. A cron scan of tables every minute: coarse step, needless database load.
