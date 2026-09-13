# Plan: employee communications workspace

Status: design implemented; verification evidence recorded in feature memory. Baseline `ee965b8`. Scope: [spec.md](spec.md).
One writer and Git/index owner: Codex; work in the current master checkout.

## DESIGN

### Interaction direction

Mode: Operate. Inherit the admin panel's typography, tokens and control conventions. Replace the
message modal interaction without redesigning the entire panel.

The signature interaction is a persistent compose dock: open from anywhere, write, minimize to
resume operations, reopen exactly where the user left off. A single text message is the first view;
bulk audience, attachments, survey fields and history are progressive disclosures, not mandatory
setup. Avoid dashboard statistics above the compose task.

Desktop: dock at the right edge, approximately 480 px wide, viewport-bounded, opaque
surface with border and modest shadow, no backdrop. Expand to a wider workspace for audience
review/history/results; retain an obvious minimize control. Global header action remains outside
the overlay. Do not add freely draggable windows or resizing controls without demonstrated need.

Mobile: full-screen route-backed workspace, one step visible at a time; header Back and
minimize, content area and composer action area. Return preserves page scroll and focus where
possible. Do not rely exclusively on desktop-style recipient chips or hover tooltips.

Compose hierarchy: title and window controls → recipients → message/survey → attachments →
contextual error/progress → send action. Multi-recipient submission changes to inline audience and
content review; single-recipient text stays direct. History detail is read-only.

### Frontend ownership

- `features/employee-communications/{api,model,ui,index.ts}` owns communication queries, draft
  validation, prepared view models, explicit actions and the workspace UI. App owns mounting and
  route integration. Export only workspace, trigger/open action and required context types.
- Existing employee contexts invoke its public API through app composition or callbacks; do not
  create peer-feature imports. If shared employee identity/query access is required, place that
  coherent capability in `entities/employee`, not in domain-independent shared.
- Zustand: actor-bound draft, selected IDs, minimized/expanded state and upload resource lifecycle.
  TanStack Query: recipients, submission, history, delivery and survey results. Do not copy remote
  results into the draft store. Local files/object URLs are ephemeral and explicitly disposed.
- Model workflow as discriminated states, including composing, reviewing, submitting and accepted;
  capture immutable submission/version IDs. Navigation does not unmount the store accidentally.
- Use existing primitives where suitable; a purpose-built dock is justified by the requirement for
  non-modal background access. No forbidden React hooks or hidden lifecycle wrappers.

### Backend and storage boundaries

- Add a Nest `communications` module with shared Zod command/read contracts. Preserve existing
  employee mutation and worker state modules. Keep deterministic normalization and validation pure.
- Proposed relational records: communications, recipients, attachments, ordered delivery parts and
  questionnaire definitions and responses. UUID identities, timestamptz timestamps, foreign
  keys, uniqueness and status/ordering constraints in SQL. Immutable published content.
- Store actor-owned browser uploads separately from Telegram-origin evidence; reuse ObjectStorage
  and authorized short-lived downloads. Do not relax evidence invariants or manufacture IDs.
- Audience query must use server search/pagination and complete counts. Prepare a review snapshot;
  commit explicit authorized IDs with content, attachment references and a stable request key.
  Revalidate the whole batch inside the transaction; stale scope or attachment eligibility fails
  without partial enqueue. Lock/version relevant records according to existing scope primitives.
- Reuse the transactional outbox pattern through isolated communication delivery-part intents.
  Do not add media network calls to the legacy relay batch transaction. Claim one part with a durable
  lease, send outside the transaction, then record outcome under the same claim identity. Resolve
  private immutable storage bytes at send time with byte/time limits. Expired uncertain claims need
  explicit reconciliation, not automatic resend. Preserve ordering and urgent notification capacity.
- Enforce both submission authority and delayed delivery/relink policy. Store a binding/version
  reference without exposing chat IDs in panel payloads. Sanitize provider errors; no signed URLs
  or tokens in logs, audits or general history responses.
- Same request key and same body returns original outcome; different body conflicts. Define a
  request fingerprint over normalized audience/content/attachment IDs/survey. Unknown browser
  outcome queries the same key rather than generating another send.

### Confirmed questionnaire design

Owner selected outbound messages only and multiple-question questionnaires with free-text answers.
Do not build native single polls or a generic inbound inbox. Add ordered question definitions,
per-recipient draft/final responses, stable question IDs and exact recipient/account bindings.

Worker flow: private-chat inline web_app invitation → signed Telegram launch → introduction →
one question → next/back/skip → review → explicit submit. Use direct authenticated HTTP saves,
not bot messages, sendData or answerWebAppQuery. This isolates questionnaire input from incident,
request and handover forms and avoids the existing pre-handler Telegram dedup risk entirely.

The dedicated worker entry initializes the official Telegram SDK before admin hash routing and
bypasses panel login. The server validates raw initData HMAC, auth_date freshness, duplicate
fields and exact active account/recipient binding. Client-supplied identity is never trusted.
Response revisions prevent stale draft overwrites; a repeated final submission returns its original
receipt. Closure and save/submit serialize on the communication record. Author-only results require
current scope over the whole audience. Expired launch data asks the worker to reopen the invitation.

### Compatibility and rollout

Keep the legacy single-message endpoint operational until all callers use the new contract.
Do not fabricate historical campaigns or delivery evidence from legacy SENT event names.
Deploy additive migrations and compatible worker/API support before enabling the new UI; test old
pending outbox payloads against the new worker. Use the existing deployment path and release bot.
Rollback hides the new entry/creation while retaining recorded history and safely draining accepted
work; do not roll back by deleting records or dropping tables with submitted campaigns.

## VERIFY and HARDEN

Risk: access, transactions, external delivery, uploads and bot input routing require focused
integration/invariant tests and one independent review of the fixed implementation diff. Reuse
the writer's passing checks. Existing CI is the full integration gate.

Focused checks used for this implementation:

```sh
pnpm --filter @vakhta/contracts test src/communications.test.ts
pnpm --filter api test src/communications/communications.service.test.ts
pnpm --filter api test src/communications/questionnaire-auth.test.ts src/communications/media.service.test.ts
pnpm --filter worker test src/communications/dispatch.test.ts src/worker.test.ts
pnpm --filter admin-web test src/features/employee-communications
pnpm --filter api typecheck
pnpm --filter worker typecheck
pnpm --filter admin-web typecheck
```

Add focused changed-file lint and formatting checks, plus existing regression tests for modified
legacy endpoints and bot handlers. Migration verification uses disposable PostgreSQL; verify actual
production engine compatibility through the existing runbook before release.

Required browser checks: 1440 px desktop, actual user-wide viewport, 390 and 360 px mobile; uk/en/ru
long content, light/dark, keyboard focus, route/draft preservation, partial delivery and file errors.
Capture and visually inspect desktop/mobile output. Viewport emulation is not physical-keyboard QA.
Use synthetic/local data for sending, duplicates, failure injection and questionnaire responses. Live panel
currently returned Unauthorized when opening recipient data; authenticate the dedicated QA session
before claiming end-to-end success. Never send test campaigns to production employees.

Verify C01–C36 with evidence in the feature memory, including explicit blocked checks. Final report
distinguishes spec written, code implemented, tests passed, screenshots inspected, released and
deployed. No stage is inferred from another.

Media validation reuses sharp for image decoding, pdf-lib for PDF structure, and music-metadata for MP3 frames/MP4 tracks. These are bounded format checks, not malware scanning or proof that every codec plays on every Telegram client. Sources: [PDFDocument.load](https://pdf-lib.js.org/docs/api/classes/pdfdocument#load), [music-metadata parseBuffer](https://www.npmjs.com/package/music-metadata).
