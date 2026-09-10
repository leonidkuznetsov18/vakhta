# Reliable background effects

## Outcome

An accepted shift action, report or photo must retain its required background work after a process
restart or Redis failure. Workers should not repeat a completed interaction to repair infrastructure
failure. Background processing must preserve shift history, confirmed scores and closed periods.

## Delivery status

The foundation adds PostgreSQL task storage and transactional lease helpers. The next increment
integrates durable media admission, processing and recovery while existing BullMQ media jobs drain.
It persists checklist-photo bonus invalidations; the API consumer, remaining timer producers and
broader bonus recovery still require integration. This work does not yet resolve every effect gap.

The media projection and its processing event already commit atomically; see
[media processing](../engineering/features/media-processing.md).
Subsequent increments apply the same transaction/retry boundary to the remaining business effects
and recover historical gaps from recorded business deadlines.

## Expected behavior after integration

- A source change and each required task commit together or roll back together.
- Retried or concurrently delivered work preserves its original meaning and deadline.
- Failed work remains visible and retryable. A stale worker cannot overwrite a newer attempt.
- Media processing, timer escalation and bonus recalculation do not depend on in-memory callbacks.
- Telegram delivery can be retried, but PostgreSQL and Telegram do not offer a shared transaction;
  the system must not claim exactly-once external delivery.

No new worker button, confirmation step or production data collection is introduced by this change.
Technical scope, rollout gates and evidence are in the
[engineering memory](../engineering/features/background-effects.md).
