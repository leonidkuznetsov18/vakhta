# ADR-0003: Idempotency on three levels

- Status: proposed
- Date: 2026-09-05
- Spec sources: FR-UI-02, FR-QR-03, 12.2, 12.3, NFR-04, T-03, T-07, T-09, T-10

## Context

Telegram may deliver an update twice, a user may press a button twice, a client may lose the response. No confirmed action may be lost or duplicated.

## Decision

Three levels. Telegram: the `processed_telegram_updates(update_id)` table; for buttons the key is `callback_query_id`. Command: `idempotency_keys(scope, key)` with the stored response; a repeat returns it without executing. State: `expected_version` on `shift_sessions`, the version is encoded in the button callback data; a stale button returns the current screen without a change. All three are checked inside the transition transaction after the row is locked.

## Consequences

Redelivery, a double click and a lost response produce the same result. Callback data is limited to 64 bytes, so only the action code, a short id and the version are encoded. The idempotency key table must be cleaned by retention.

## Rejected alternatives

Only update_id deduplication: does not cover panel actions and command repeats. Locking without a version: gives no meaningful reply to a stale button.
