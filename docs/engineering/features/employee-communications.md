# Employee communications: engineering memory

## Status and ownership

2026-09-13, Codex, baseline `ee965b8`. Specification/design preceded application changes. Implemented
on the shared master checkout with one writer. Active feature:
[006-employee-communications](../../../specs/006-employee-communications/spec.md).
No shared Spec Kit pointer, branch or worktree was created. Deployment evidence is reported with the
source commit and CI run; local checks below do not imply live delivery.

## Architecture and decisions

- Owner confirmed outbound messages/broadcasts only and multi-question questionnaires with free text.
  Named, author-only answers are disclosed to the worker before starting; no anonymity is claimed.
- FSD slices: `employee-communications` owns the dock, actor-bound Zustand draft and TanStack queries;
  `questionnaire-response` owns the separate worker entry. Existing App and Operations compose their
  public APIs. Reuse the repository's transitional shared controls; no unrelated FSD migration.
- Non-modal desktop dock, full-screen mobile, persistent minimized draft. Header access is always
  visible to permitted senders. Group/questionnaire review is deliberate; single text stays direct.
  Mobile geometry follows visualViewport changes; background inert/focus restoration is explicit.
- Four additive tables store communications, recipient/account snapshots, private attachments and
  ordered delivery parts. The create transaction revalidates complete scope/eligibility, adopts files,
  records audit and dispatch intents, and serializes stable actor/request IDs with bounded retries.
- A separate leased dispatcher preserves the legacy urgent outbox. Files/network run outside DB
  transactions. Claim fencing, bounded transport, graceful shutdown and UNKNOWN expiry protect recovery;
  explicit retries preserve already-confirmed parts. Exactly-once Telegram delivery is not claimed.
- Questionnaires use a private inline `web_app` invitation, not native polls or ordinary bot messages.
  The isolated web entry reads SDK initData before admin hash restoration, omits panel credentials,
  and authenticates HMAC/freshness/unique fields plus exact active recipient/account binding. Draft
  revisions and close/save row locking protect stale writes and immutable final responses.
- Deployment preflight found the panel-wide `X-Frame-Options: DENY` blocked Telegram Web embedding.
  Invitations now use `/questionnaire`; only that exact address replaces DENY with CSP
  `frame-ancestors https://web.telegram.org`. Missing/malformed IDs never render the admin app there.
  Two entry regressions and the ordered invitation test cover routing. Cloudflare's deployed headers
  must be checked after publication. Sources: [Telegram iframe events](https://core.telegram.org/api/web-events),
  [Cloudflare header detachment](https://developers.cloudflare.com/pages/configuration/headers/).
- Uploads use the existing private ObjectStorage port, immutable key/hash, 24-hour staging cleanup
  and locked adoption. sharp decodes images; pdf-lib and music-metadata check other supported formats.
  This is format validation, not antivirus scanning. Committed files retain history indefinitely under
  the existing access policy; no new automatic evidence deletion policy is inferred.
- A lost browser response freezes the original request until reconciliation, even if a retry gets a
  4xx. Async audience selection is bound to its originating draft/filter; save/reload exclude each other.

## Verification evidence

- Disposable PostgreSQL 16 applied migration `0051_condemned_darkhawk.sql`. Eight API transaction tests
  cover concurrent create dedup, atomic invalid audience, scoped history, file adoption/ownership,
  retry eligibility, draft/final replay, revoked identity and close/submit serialization.
- Three Telegram HMAC tests cover canonical signatures, tampering, other bots, duplicate decoded
  fields, expiry/future time and unsafe IDs. Five media tests cover normalized images, valid PDF and
  synthetic MP3/MP4, corrupt signatures and oversized bytes. Binary fixtures contain silence/black video.
- Seven dispatcher tests cover ordered delivery, unknown outcomes, relinking during preparation,
  stale-claim fencing, expired claims, revoked sender authority, 429 delay and blocked-chat descendants.
  Existing worker suite: 17 tests passed. Existing Operations suite: 6 tests passed.
- Eleven frontend tests cover draft navigation/replacement/identity freezing, upload disposal, uncertain
  authorization retries, reload/save exclusion, submitted read-only UI single-recipient questionnaire review, stale bulk selection and multi-choice denominators.
  Contract validation tests: 3 passed. Affected app typechecks passed; panel production build passed.
  Focused lint passed after removing obsolete imports and replacing unsafe filename control handling.
- Captured AND visually inspected actual local components with synthetic fetch fixtures in CUA:
  desktop dock and review (1340px), mobile compose (360px), group/media review/history (360px),
  questionnaire free text/review/final state (390px). Observed no horizontal scroll at 390px.
  Checked recipient exclusion, select-all count, MP4 attachment, single/group review rules, minimize,
  restore and mobile browser Back/focus. No employee messages or real survey responses were created.
- Independent read-only reviewer identified seven recovery/interaction defects; all were corrected,
  including the final reload-during-save reverse race, with focused regressions.

## Lean completion review

Recommendation: **Proceed to the authorized pilot.** A shared retained draft removes repeated entry
and modal interruption; a reviewed audience replaces repeated one-person sends. Optional collapsed
filters keep the quick path compact. Delivery uncertainty and named-answer visibility prevent false
assumptions. Workers can pause instead of losing answers; no reminders or performance inference added.

No production time-saving/adoption benefit is measured. Pilot measurements: time to send one/group,
wrong-recipient corrections, lost drafts, answer completion and recovery burden. Preserve human
judgment, scope and shift history. Survey length remains the author's responsibility.

## Remaining live verification and operational limits

- The old authenticated Chrome session returned Unauthorized during recon; browser connection later
  disappeared. Local redesigned visual QA used synthetic data in the in-app browser, not live auth.
- Real Telegram Mini App launch/keyboard behavior, physical iOS/Android keyboard overlap, private R2
  upload/download and delivered-media playback remain unverified. Never use production employee
  campaigns as smoke data. Reopen invitations after the one-hour launch-auth expiry.
- Draft persistence is session-only; reloading the panel discards unsent composition. Failed/abandoned
  staged files expire after 24 hours. Questionnaire drafts persist server-side until explicit submit.
- Independent deployment timing may briefly expose API errors until migration/API/worker are ready;
  acceptance must verify all affected revisions. Roll back code without dropping the additive tables
  or deleting communications; preserve accepted work and retain unknown outcomes for review.

Configuration: worker `COMMUNICATIONS_WEB_URL` defaults to `https://panel.vakhta.xyz` and must be HTTPS. Existing API and worker S3 credentials must address the same private bucket. No new credentials or expanded permissions were introduced.
