# Feature: worker bot and kiosk verification

## Outcome and scope

Verify that a worker can understand the current state, find help and use the attendance terminal
without unnecessary interaction. Product behavior is documented in
`../../features/02-activation-and-bot.md`, `../../features/03-attendance-qr-kiosk.md` and
`../../features/08-requests.md`. This record contains observations, not a product behavior change.

## Approved targets

On 2026-09-10 the owner selected Telegram account `@cryptoleonid` and terminal `Основний`.
The panel account is `dev@vakhta.xyz`. Reuse the existing kiosk pairing. These are owner-approved
verification targets, not evidence that production data is isolated. No phone number, credential,
Telegram numeric identifier or QR payload belongs in this document.

## Runtime evidence: 2026-09-10

- The owner's screenshot shows `Основний`, the Ukrainian attendance heading, a rendered QR and its
  renewal countdown. The screenshot alone is not proof of a successful scan.
- Native Chrome accessibility inspection confirmed the existing paired `Основний` kiosk, a current
  connection timestamp and a running countdown. No pairing code was generated and no device was reset.
- In the worker-bot chat opened by the owner, `/help` returned Ukrainian usage guidance, a link preview
  for the user-guide PDF and a Help button. An HTTP HEAD check of that public guide returned 200
  with `application/pdf`. The support-assistant shortcut was absent from this reply.
- `/start` returned the linked worker's masked identity, open presence since 15:29, no upcoming shift
  in the published schedule, and the buttons to start a shift or inspect the plan. The device clock
  showed 12:45, so the date of that presence is not understandable from the time-only text.
- `/requests` returned the request menu: leave, time off, sickness, inability to attend, lateness,
  early departure, shift swap, extra shift, technical problem, existing requests and Back.
  No request was created. An older historical `/requests` reply showed a closed-shift screen; the
  current test did not reproduce that behavior.
- Native Telegram exposes no accessible message/button tree to this automation. Keyboard commands
  worked after observing focus between actions; coordinate clicks returned `AXError.notImplemented`.
  Inline-button behavior is therefore not verified by the command tests. The owner's phone is needed
  for the actual camera-to-bot handoff in this session.
- During initial navigation, search text briefly entered an unrelated chat's empty draft. It was
  removed and the empty composer was verified before proceeding. Nothing was sent to that chat.

The documentation change passed `pnpm check` (typecheck, lint, tests with cache reuse and formatting).
No attendance, shift or request transition was submitted during these command checks.

## Code evidence and Lean review

Recommendation: Simplify the cross-day presence label before expanding the home screen. The smallest
useful change is to include an arrival date when time alone is ambiguous. The observed missing date
is explained by `homeScreen` in `apps/api/src/telegram/screens.ts`, which calls `localTime` for
`presenceSince`. Verify business timezone and actual arrival date before treating the underlying
presence record as stale or incorrect; this observation does not establish a data-integrity defect.

The `/help` handler in `apps/api/src/telegram/bot.factory.ts` adds a support button only when a support
URL is configured. Its absence is an observation, not proof that the support bot is unavailable.
The startable-shift branch of `renderHomeScreen` uses the shift keyboard, explaining why it differs
from the full idle home menu described in the feature document. Test discoverability with workers
before adding more buttons. Preserve a clear primary action and an easy route to help.

Suggested experiment: verify a presence spanning midnight and ask a worker to identify the arrival
day from the message. Success means an unambiguous answer without opening another screen. Guardrails:
no change to attendance timestamps, shift transitions, permissions or the current primary action.
Do not infer production downtime, productivity or employee fault from this UI observation.

## Remaining verification

The owner was asked to scan a fresh kiosk QR and stop at the arrival/departure confirmation prompt.
The camera handoff, attendance confirmation, repeated/expired QR handling, complete shift lifecycle,
inline navigation buttons and actual phone layout remain unverified until recorded below.
