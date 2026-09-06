# ADR-0011: Stateless bot, the screen is rendered by the server

- Status: proposed
- Date: 2026-09-05
- Spec sources: 5.1, FR-UI-01…03, T-26, NFR-08

## Context

The bot must show a single contextual button and hide mutually exclusive actions, answer with server time and the new status, and survive a disconnect on the third photo without losing the draft.

## Decision

The home screen is described by a `ScreenModel` the server computes from the employee's state, assignment, presence and shift session; the bot only draws the text and an inline keyboard of allowed actions. The message is edited in place. Callback data encodes the action, a short id and the version. grammY conversations are used only for multi-step inputs (reason, comment, three photos) with state in Redis under a TTL; every step is written to the draft in Postgres immediately.

## Consequences

The bot and the panel show one state. API instances are interchangeable. A disconnect during input does not lose already saved steps. Texts are collected in `@vakhta/i18n` with `ru` as the base language and `uk`/`en` catalogs of the same shape; the employee's language is stored on the employee record.

## Rejected alternatives

Dialog state in process memory: breaks with two instances and on restart. A Mini App as the primary interface: more expensive for the MVP, remains an option for the strict camera mode.
