# Specification: employee communications workspace

Status: accepted implementation scope; owner resolved Q1–Q2 on 2026-09-13. Specification and design were written before application edits; implementation evidence is in feature memory. Owner: product owner. Architect and exclusive writer: Codex.
Baseline: `ee965b8` (2026-09-13). Request: redesign “Write to an employee” for individual and bulk
messages, media and surveys, with global quick access and a first-class mobile experience; no modal.

## RECON

### Observed implementation

- `apps/admin-web/src/components/app/message-employee.tsx`: centered Dialog, one active linked
  employee, textarea, mutation and success toast. Draft is component state. No attachments,
  campaign history, multiple recipients or survey authoring/results.
- `apps/admin-web/src/App.tsx`: global sidebar entry and root-mounted dialog. This is useful global
  placement; retain the capability while replacing the interaction.
- `apps/admin-web/src/operations/OperationsPage.tsx`: separate row-based message action. Consolidate
  entry into the same workspace without changing operational shift actions or losing typed text.
- `packages/contracts/src/identity.ts`: message is trimmed text of 3–1000 characters.
- `apps/api/src/identity/admin-employees.controller.ts`: send roles are ADMIN, HR, PRODUCTION_HEAD
  and SHIFT_MASTER; employee scope is checked before calling the service.
- `apps/api/src/identity/employees.service.ts`: writes an event, audit and MASTER_MESSAGE outbox
  item in a transaction, then returns employee identity. This response proves queue acceptance,
  not delivery. Its time-derived key is not a stable client submission identity.
- `apps/worker/src/outbox/relay.ts`: sends text and buttons, records Telegram message ID,
  retries with backoff, respects 429 delay and skips blocked/missing chats. Telegram send and DB
  commit are not atomic. Row locking does not guarantee exactly-once external delivery.
- `packages/db/src/schema/media.ts` and `apps/api/src/handover/media.service.ts`: existing media
  are Telegram-origin evidence with required Telegram IDs and employee uploader identity. Do not
  create fake Telegram IDs to support web uploads or expose unrelated employee evidence.
- `apps/api/src/telegram/bot.factory.ts`: text/photo handlers already participate in worker
  workflows. New communications input must not consume checklist, incident or request input.

### Visual observation

Inspected the existing panel and opened its message dialog in Chrome on 2026-09-13. The deployed
tab displayed version 1.10.0 and an update notice, so it is not verification of the local baseline.
Screenshot showed a small centered form over a blurred, inaccessible work surface. Recipient loading
returned Unauthorized in this stale session; no recipients were selected and no message was sent.
This observation establishes the existing visual pattern only, not working authenticated delivery.

### Reuse and constraints

Retain the existing design tokens, shared fields, Alert, LoadingState, Query feedback, IconButton,
pagination and scope primitives. Use a coherent FSD communications slice, shared contracts, private
object storage, transaction/outbox infrastructure and grammY. Preserve shift history and audit.
Product vocabulary: `docs/product-vision.md`. Related technical evidence:
`docs/engineering/features/employee-profile.md` and `media-processing.md`.
Feature evidence: `docs/engineering/features/employee-communications.md`.

## SPEC

### Outcome

A master can quickly send one employee a message while keeping their place in operations, or
deliberately address a reviewed group, attach useful media, and collect survey responses. Workers
receive content through the existing bot; sending and responding never changes a shift or bonus.

### Explicit decisions and assumptions

- Required by the owner: individual and multiple recipients, media, surveys, global availability,
  mobile support, and replacement of the modal interaction.
- Selected interaction: a right-edge, non-modal communications dock on desktop, expandable for
  audience/history/results; a full-screen workspace on mobile; a minimized global draft launcher.
- Selected first media set: photos, video, audio and documents. No browser recording, media editor
  or automatic AI processing. Unsupported formats receive actionable validation before sending.
- Selected delivery scope: private bot messages to selected employees, not Telegram group chats.
- Session-only drafts survive internal navigation and minimize/restore. They are cleared at logout
  or account change. Reload/cross-device draft persistence is not promised in this delivery.
- Owner confirmed outbound communication only, with employee replies restricted to questionnaires.
- Owner selected questionnaires with multiple questions and free-text answers. Named responses and
  author-only results are the explicit implementation assumption; no anonymous mode is offered.

### Scenarios and acceptance criteria

#### Global access and quick composition

- **C01:** every authenticated page exposes a communications action to permitted senders. On
  mobile it remains reachable without opening the navigation drawer. There is one workspace instance.
- **C02:** desktop opening does not dim, blur, mark inert or trap focus in the underlying page.
  The panel is a labeled complementary region, not an aria-modal dialog. Its close/minimize action
  returns focus to the invoking control, or the global launcher if that control no longer exists.
- **C03:** minimize, navigation and reopening preserve recipients, content, attachment state and
  current step. Opening from another employee never silently replaces a nonempty draft: offer
  “continue draft” or “start new” inline. Explicit discard is separate from minimize.
- **C04:** opening from an employee context prefills that recipient. A valid single text message
  needs no campaign title, wizard or review step. Enter inserts a line break; only the explicit send
  action sends. Submission is guarded while invalid, offline, uploading or already pending.
- **C05:** sending snapshots the reviewed draft. A late response cannot clear subsequent edits or
  another actor's draft. Unknown request outcome is reconciled by stable submission identity.

#### Audience

- **C06:** search by name/personnel number and narrow by existing site/unit/team data within the
  actor's scope. Support one/multiple selections, selected-only view, remove and clear. Pagination
  and search do not lose selection. Duplicate employees are counted once.
- **C07:** “select all results” explicitly means all matching authorized results, not the loaded
  page. Show the complete selected total and a reviewable paginated recipient list. Never treat
  the legacy 200-row directory response as the complete workforce.
- **C08:** expose missing Telegram linkage and inactive employees with a reason; exclude them
  from eligible delivery. Do not reveal people outside scope, even through counts or errors.
- **C09:** group or questionnaire send has an inline review step listing exact audience, content, files and count
  in the final action. Freeze IDs at review, revalidate authority, employment/link eligibility and
  attachment ownership within submission. A changed/invalid audience blocks the batch with a
  refresh/review path; never silently omit recipients or expand a saved filter at send time.

#### Content and media

- **C10:** text, attachment-only and text-with-attachments are supported. Keep existing plain-text
  semantics. Show the current limit and inline validation; sender-authored text is not translated.
- **C11:** picker supports multi-file selection; desktop drop/paste may supplement it. Mobile can
  select existing files/photos without requiring recording permissions. Preview photos; show type,
  filename, size, upload progress, failure/retry and remove actions for all files.
- **C12:** removing an upload cancels it where possible, invalidates late completion and releases
  previews. Failed files retain retry information. Pending/failed/unverified files cannot be sent.
- **C13:** validate actual bytes, MIME, sizes and ownership on the server. Allowlist formats;
  attachment links require authorized access and short-lived private URLs. Reject arbitrary remote
  URLs and unrelated media IDs. File storage/expiry and upload limits are defined before coding.
- **C14:** persist immutable content and per-recipient ordered delivery parts. Retrying a failed
  part must not intentionally resend confirmed successful parts. Partial delivery is visible;
  history includes all content/attachments and recorded outcomes, without pretending it is a chat.

#### Surveys (questionnaires; confirmed by the owner)

- **C15:** compose, preview, distribute and inspect results within the same workspace. Review
  question(s), options, audience and response visibility before publishing. Published question
  content and option identity are immutable; changing them starts a new survey.
- **C16:** identify the questionnaire and eligible respondent through server-validated Telegram Mini App launch data, not
  client employee IDs. Duplicate answer updates are idempotent; draft revisions replace earlier
  values without inflating totals. Unknown questions/options and closed questionnaires are rejected.
- **C17:** show responses separately from delivery counts. A nonresponse is not refusal,
  misunderstanding or a production performance signal. Display denominators and multi-choice
  percentage semantics. Never turn responses into employee score or automatic shift decisions.
- **C18:** if named, tell the worker before answering who can see their answer. If anonymous is
  chosen, do not claim anonymity from a separate poll sent to one known recipient: per-recipient
  totals can reveal their answer. Resolve a genuinely unlinkable collection design before release.
- **C19:** close collection explicitly and preserve recorded answers. Questionnaire submission
  checks the closed state in its transaction. Old invitation buttons show closure rather than
  accepting answers. Bot answers remain distinct from existing flows.

#### History, permissions and delivery

- **C20:** provide paginated sent history and detail with sender, time, immutable content,
  reviewed recipients and per-recipient/part outcomes. Scope-check reads and media independently.
  Proposed default: sender sees their own authorized history; a wider shared inbox is excluded by Q1.
- **C21:** distinguish draft, accepted/queued, Telegram accepted, partial, failed and unavailable.
  No read receipts are invented. Telegram acceptance is not evidence of the worker reading content.
- **C22:** submission is idempotent per actor and request key; same key with changed content is a
  conflict. Create message, audience, audit and dispatch intents in one database transaction.
  No request-loop calls directly to Telegram and no client loop over the legacy single-send API.
- **C23:** repeated taps/network recovery cannot create a new campaign accidentally. Retry only
  eligible failed parts, respecting 429/backoff; inaccessible targets do not retry forever. State
  the remaining send-success/commit-failure duplication risk and test its recovery policy.
- **C24:** preserve current messenger roles and scoped authority. No new access for auditors,
  planners or other roles. Recheck recipient binding before delayed delivery; never deliver to a
  different Telegram identity after account relinking. Define cancellation for revoked authority.
- **C25:** sign-out/account change clears sensitive local drafts, files and cached results;
  aborted or late requests cannot restore another actor's data.

#### Mobile, accessibility and feedback

- **C26:** at 360/390 px wide, the workspace fills the available viewport with one content column,
  a stable back/minimize control and a reachable compose/send area. The underlying app is removed
  from interaction while fully covered; this is a full-screen navigation surface, not a centered
  Dialog. Browser Back returns to the previous workspace/page state and preserves the draft.
- **C27:** account for safe-area insets, virtual keyboard and text zoom; active field and send action
  remain reachable. No horizontal page scrolling or bottom navigation overlap. Touch controls have
  at least 44 px targets. Test mobile keyboard behavior separately from viewport screenshots.
- **C28:** all actions have names, keyboard access and visible focus/hover/active feedback. Long
  names, filenames and messages wrap within bounds; full content is available in scrollable detail.
- **C29:** use existing query feedback for loading, refreshing, offline, error/retry, empty and
  saving. Background refresh preserves data and layout. No failure becomes a zero count. Errors
  use the shared Alert; send failures keep the draft. Disable no-op clear/reset actions.
- **C30:** every user-facing string, error label and tooltip exists in uk/en/ru. Existing light/dark
  tokens apply. Status meanings are distinct and conveyed through text/icons as well as color.

### Non-goals

No new notification channel, Telegram groups, worker-to-worker social feed, scheduling/recurrence,
campaign automation, AI replies, mandatory acknowledgements, read tracking, attendance changes,
bonus changes, employee surveillance or migration of unrelated UI. Free-form inbound messaging is excluded by the owner; multi-question questionnaires are required.

### Resolved product questions (2026-09-13)

- **Q1 — direction:** outbound messages/broadcasts, with replies only to questionnaires. No shared
  inbox, free-form chat or worker-to-worker conversations.
- **Q2 — survey model:** multiple-question questionnaires with free-text answers. Native Telegram
  single-question polls do not satisfy this requirement.

### Questionnaire contract

- **C31:** questionnaire has a title, optional introduction and ordered questions with stable IDs.
  Free-text questions are mandatory capability; single-choice and multiple-choice questions are
  supported in the same authoring flow. Each question has an explicit required/optional setting.
- **C32:** worker starts explicitly from the questionnaire invitation, sees author/name visibility,
  progress and one question at a time. Back, skip optional, pause/resume and final answer review
  preserve the draft. Submission is explicit and immutable; repeated submission is idempotent.
- **C33:** the invitation uses a private-chat inline web_app button opening a dedicated mobile
  questionnaire inside Telegram. Answers go directly to its authenticated HTTP API, never through
  ordinary bot messages or sendData. Existing bot forms remain untouched. Validate Telegram launch
  signature, freshness and exact recipient/account binding server-side; no password or bearer URL.
- **C34:** save answer drafts durably; restarting API/bot or changing from one questionnaire to
  another cannot mix responses. Stale buttons/replies cannot answer the current different question.
  A failed draft save or submit has a recoverable explicit error, never a false success.
- **C35:** results show invited, Telegram accepted, started and submitted counts separately. For
  each authorized respondent, show all answers in question order and distinguish skipped optional
  questions from unanswered required questions. Free text has a bounded preview and full detail.
- **C36:** closing the questionnaire blocks new final submissions transactionally. Preserve partial
  drafts and final responses as distinct evidence. No requirement to stop native Telegram polls
  exists because this flow does not create native polls.

Implementation parameters: at most 500 explicit recipients per send; 5 attachments of up to 10 MiB
each (matching existing multipart upload limit); JPEG/PNG/WebP photos, MP4 video, MP3 audio and PDF
documents initially. Questionnaires: 1–10 questions, 300-character prompt, 2–10 distinct options of
100 characters for choice questions, free-text answers up to 2000 characters. These bounded initial
limits are product validation constraints, not claims of Telegram maximums. Reject excess clearly.

No implementation approval ceremony is required for the already authorized common scope.

## External facts checked

Telegram supports native polls with optional anonymity and non-anonymous answer updates that can
represent retractions. Sending files supports uploads and file IDs; URL delivery has method-specific
restrictions. These are transport capabilities, not existing Vakhta behavior. Checked 2026-09-13:
[sendPoll](https://core.telegram.org/bots/api#sendpoll),
[PollAnswer](https://core.telegram.org/bots/api#pollanswer),
[sending files](https://core.telegram.org/bots/api#sending-files).

Implementation sequence and verification: [plan.md](plan.md), [tasks.md](tasks.md).

## HARDEN: independent design review decisions

- Questionnaire answers and progress commit atomically with a response revision through the
  Mini App HTTP API. This avoids legacy Telegram message deduplication entirely; do not change it.
  Load Telegram SDK before admin hash routing and use a separate worker entry before panel login.
- Submission/closure serialize on the questionnaire row; commit order decides acceptance. Draft
  writes after closure are rejected; existing drafts remain distinct from final submissions.
- History and results use all-or-nothing current recipient scope. Campaign list totals do not
  reveal campaigns hidden after scope loss. Re-read role grants inside transactional submission.
- A communications dispatcher claims one bounded part per durable lease outside network I/O.
  Lease expiry after possible send becomes UNKNOWN, not automatic success or safe-to-retry failure.
  Explicit resend warns about possible duplicate delivery. Dependent parts wait for confirmed SENT.
- Freeze Telegram account row identity and user identity on submission. Recheck before send; relink
  or revocation cancels remaining parts. External acceptance cannot be atomic with role changes;
  an already in-flight send may finish after revocation and must not be described as retractable.
- Upload staging expires after 24 hours unless transactionally adopted. Persist cleanup intent
  before upload, immutable storage key/hash on finalization, and lock adoption against cleanup.
  Published files are retained with their communication; no new deletion policy is inferred.
- At most 50 MiB per draft (five 10 MiB uploads); worker private downloads are bounded by recorded
  verified byte size and timeout. Never place attachment transfers inside the legacy outbox batch
  transaction. Reuse infrastructure through an isolated communication dispatcher.

The worker form uses [Telegram Mini Apps](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app), checked 2026-09-13. The SDK is loaded only on that entry. Trust signed initData after validation, never initDataUnsafe.
