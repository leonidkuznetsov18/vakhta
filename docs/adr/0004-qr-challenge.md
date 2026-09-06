# ADR-0004: Rotating QR as a short-lived challenge

- Status: proposed
- Date: 2026-09-05
- Spec sources: 5.2, 13.1, 18 item 8, T-02…T-05

## Context

The QR at the checkpoint must rotate every 30-60 s, contain no personal data, fit into the 64-character start parameter and be usable once per employee + shift pair. The spec honestly admits that the QR does not replace an access-control system.

## Decision

The terminal with a device token requests a challenge every `QR_ROTATION_SECONDS`. The challenge: 16 random bytes in base64url (22 characters). The database keeps only the SHA-256 of the token, the terminal, the issue time and `expires_at` with a 90-120 s TTL, so two rotation windows overlap. Usage is written to `qr_challenge_uses` with uniqueness on `(employee_id, assignment_id, action)`. A tampered token finds no hash and creates a security event. Anomalies (one challenge from two chats within seconds, different terminals within a short time) are escalated to the shift master.

## Consequences

There is no personal data in the QR. Several employees may use one QR. A repeat by the same employee returns the first result. The terminal is a separate client `apps/qr-kiosk` that must be registered and administered.

## Rejected alternatives

A static QR: trivially forwarded. A signed JWT in the QR: longer than 64 characters and adds nothing when the server verifies anyway.
