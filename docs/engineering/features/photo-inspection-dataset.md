# Photo inspection and dataset preparation

## Outcome and scope

Owner authorized implementation on 2026-09-10 with Cloudflare Gemma 4 and an initial maximum of
50 photos/day. [Product specification](../../features/photo-inspection.md) defines the delivered
scope: masters inspect checklist photos on Cleanliness and handover, mark visible problems and
save explicit human reviews. Model training and automatic operational decisions are future work.
The earlier incident-page proposal is superseded for this pilot.

## Current behavior and ownership

- `features/photo-inspection` owns the panel editor, API boundary and unsaved Zustand draft.
  The existing handover page composes its public API; unrelated legacy page architecture is retained.
- The Nest `PhotoInspectionModule` owns scope authorization, versioned review saves, analysis admission
  and export. Contracts validate external input. Existing grants apply to zones or historical shift
  assignments; unknown ownership admits enterprise scope only. Draft handovers remain read-only.
- PostgreSQL stores `photo_inspections`, append-only `photo_inspection_revisions`, immutable analysis
  intent/results in `photo_inspection_runs`, and durable `PHOTO_INSPECT` tasks. Migration 0031 adds
  constraints and immutability triggers. Review, revision and audit writes share one transaction;
  analysis admission, task intent and audit writes share another.
- Completed handovers permit independent dataset annotations. This cannot change operational review,
  shift history, bonus, employee notifications or original media. Replacing an attachment cannot
  inherit its previous media identity's annotations.
- The worker claims existing PostgreSQL leases, runs external I/O outside transactions, and publishes
  results only with a valid lease. It never writes human labels.

## Decisions and reuse

Use [Annotorious 3.8.10](https://annotorious.dev/) core through a React 19 callback ref with explicit
cleanup; no application lifecycle hooks are introduced. Rectangles and polygons support selection,
editing, deletion, descriptions and zoom. Rectangle coordinate fields provide a keyboard alternative.
The editor returns to selection after drawing. Shared shadcn controls and loading/error feedback,
TanStack Query and Ukrainian/English/Russian catalogs serve the existing panel conventions.

Human review statuses are UNREVIEWED, COMPLIANT, PROBLEMS and NOT_ASSESSABLE. Empty annotations do not
imply compliance. Every problem needs a description; unassessable reviews need an explanation.
Initial categories: dirt/dust, rag, misplaced tool, obstruction, equipment state and other.
Requirements are saved per photo review and supplied alongside its checklist context. A versioned
workplace rule library and per-rule assessment matrix remain future capabilities.

Geometry uses coordinates normalized to [0,1] **after EXIF auto-orientation**. Stored `encodedWidth`
and `encodedHeight` describe the received file, not necessarily its upright dimensions. Export
consumers decode and auto-orient the image before converting normalized coordinates to pixels.
SHA-256, immutable media ID, checklist definition/version, item, zone and shift retain provenance;
presigned URLs are temporary transport only. The original means the best received file, not a
claim that Telegram preserved original camera quality.

Exports contain one saved human review plus metadata as schema-versioned JSON, with a separate
authorized source-image link. Source extension follows actual MIME type. UNREVIEWED is excluded.
AI-only output is never ground truth; copied findings retain their source run ID. Group future
train/development/test splits by shift and duplicate family to prevent leakage. COCO/YOLO/VLM
conversion and bulk archives are separate consumers of this canonical representation.

[Gemma 4 26B A4B](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/) runs through
Cloudflare's chat-completions API, model `@cf/google/gemma-4-26b-a4b-it`, prompt `workplace-v1`.
Only the worker reads `CLOUDFLARE_AI_ACCOUNT_ID` and `CLOUDFLARE_AI_TOKEN`; the token is stored in
1Password **Vakhta Workers AI** and configured in Railway worker production variables.
Image instructions and user guidance are untrusted data. The prompt requests factual Ukrainian
observations, uncertainty and evidence regions; it prohibits employee blame and inferred hidden
power state. JSON output is runtime-validated, including consistency of findings and outcome.

Limits: manual requests, five runs per photo, 200 globally per rolling 24 hours, at most three
external attempts, 90-second attempt timeout and 120-second task lease. A stable request UUID
supports retries after an ambiguous response. Another pending request returns an explicit conflict.
Input is bounded to 20 MB/40 megapixels, auto-oriented and resized within 1600 pixels for inference.
These limits bound work; they do not guarantee an exact monetary budget. Model output tokens are
capped at 3000. Failed runs remain visible and require another explicit request after terminal failure.

## Lean review

**Proceed.** The smallest useful workflow is open photo → mark regions and describe observations →
save. Metadata is automatic; AI assistance is optional. No new employee tasks or duplicate reports.
Keyboard rectangle creation, post-drawing selection and protection of unsaved edits reduce rework.
Measure review time, missed issues and false alarms before expanding automation. A tool's presence
is a violation only when a known workplace rule establishes that it should not be there. A photo
cannot prove electrical isolation or that an employee did not clean.

Final design review retained human confirmation and separate AI evidence. Rollback can remove the
optional UI/worker consumer while preserving review history; never delete the additive dataset tables
or rewrite historical records as an operational rollback.

## Verification

Local verification on 2026-09-10/11, isolated PostgreSQL 16 testcontainers and synthetic images:

- API: 8 integration tests cover scope, read-only roles, stale save conflicts, immutable revisions,
  transactional audit rollback, replacement media, durable/idempotent admission, pending-request
  conflict, historical assignment scope and MIME/orientation export metadata.
- Worker: 7 tests cover concurrent dispatch, visible configuration failures, bounded retries,
  expired-lease recovery, timeout ignoring cancellation, malformed/truncated output and rejection
  of partially assigned results when boundary validation fails.
- Editor: 3 tests cover normalized rectangle/polygon round trips, mandatory descriptions and explicit
  negative labeling. Contracts: 6 passing tests including two new inspection tests.
- Independent backend review resolved three findings: encoded/oriented dimensions and MIME filename,
  pending-request identity, and zone-less historical scope. Reviewer confirmed no remaining scoped
  backend blockers; this review excluded frontend code.
- Real browser QA used a disposable local database and actual inspection API with a deterministic
  synthetic AI response. Drawing rectangles and polygons, descriptions/categories, save/reopen,
  zoom and explicit copying of an AI finding all worked. Desktop 1366×900 and mobile 390×844
  screenshots were captured and visually inspected. No production employee records were fabricated.
- Actual authenticated Cloudflare requests returned HTTP 200 for text JSON, a synthetic color image,
  and the production inspection prompt with a synthetic table image. The latter returned a valid
  prediction and 605 input/210 output tokens. This is protocol evidence, not a quality benchmark.
- Panel production build and focused ESLint passed. API/worker/panel type checks and final formatting passed. Existing CI supplies the full workspace integration gate.

Initial source `56f9f37` passed full CI `34530246776`, released v0.76.0 and sent the existing Telegram
announcement. Pages deployment `e71423f7-96ae-41de-9674-312ea74afdc8`, Railway API
`1275766c-9f37-4723-a063-d590f2a912fd` and worker `7b48806a-de94-453b-9f03-852a38b97391`
reported successful deployment at that source. A read-only production database check confirmed all
three inspection tables and both enabled immutability triggers. API health returned ok.
Authenticated `dev@vakhta.xyz` administrator QA opened existing photos and navigated between them;
Ukrainian desktop/mobile layouts were visually inspected. No production review or AI run was created.
Cloudflare inference verification remains the synthetic protocol check above; workplace accuracy is
not established by deployment.
Kiosk and Telegram user flows are unchanged and do not need redundant smoke tests.

## Dataset pilot and remaining work

1. Select two or three representative zones; write concrete visible requirements, examples and
   exceptions. Define when a criterion is unassessable. These are starting suggestions, not a
   guaranteed sufficient training set.
2. Sample normal, problematic, borderline and unassessable photographs across shifts, lighting and
   viewpoints. Keep a naturally distributed evaluation set separate from rare-problem enrichment.
   Existing accepted handovers are candidates, not automatically verified negative labels.
3. Review consistently: draw around the object or affected area, describe visible evidence, and use
   OTHER for new findings. A dataset steward resolves category ambiguity and reviewer disagreements.
   Save partially inspected photos as UNREVIEWED; export only completed review decisions.
4. Audit duplicates, image quality, retention and coverage before mass labeling. Hold out entire
   shifts/duplicate families and, where feasible, workplaces. Freeze dataset and guideline versions.
5. Measure per-category misses, false positives, localization, abstention and review time on the
   holdout. Evaluate actual production-image quality before changing the manual-review requirement.
6. Train only when the measured baseline shows a tractable gap and enough curated examples exist.
   [TRL](https://huggingface.co/docs/trl/sft_trainer) and [PEFT](https://huggingface.co/docs/peft/index)
   are future options; [Cloudflare LoRA support](https://developers.cloudflare.com/workers-ai/features/fine-tunes/loras/)
   does not imply custom Gemma vision adapters are supported. Fine-tuning/hosting needs separate
   measured GPU and provider decisions; uploading annotations does not train this API automatically.

Known limits: rough regions are not pixel-accurate segmentation labels; no bulk dataset release,
per-rule completeness matrix, double-review adjudication or trained custom checkpoint exists yet.
Retention must be aligned with any future frozen dataset. Current saved human reviews and model
suggestions provide the collection foundation, not evidence that autonomous inspection is reliable.

## Historical refinement — empty analysis action (superseded)

On 2026-09-11 the owner requested disabling Analyze for an empty form and adding a short hover
explanation. The button requires non-whitespace text in a comment, guidance or region description;
existing pending/unsaved-change guards still apply. A focusable wrapper exposes the tooltip even
when the native button is disabled. All three catalogs explain the prerequisite and model assistance.
Seven component tests passed for empty/whitespace inputs, each supported input route, busy/unsaved
protection and keyboard tooltip access. Real browser QA confirmed hover text, disabled-before-save
and enabled-after-save behavior; desktop/mobile screenshots were inspected. Type-check and focused
lint passed. Railway IaC preserves both already-configured AI variables without embedding credentials.

## Owner refinement — beginner instructions and FAQ

Reuse the shared HowItWorks/FAQ surface inside the editor, with optional localized titles, document
links and video descriptions. Existing sections retain their default handbook links. The photo guide
contains six steps and fourteen FAQ answers; the handover guide links the concepts and corrects its
stale Russian next-shift acceptance explanation to the current master review flow.

The i18n catalog is the source for both in-app help and generated printable HTML. A repository script
produces three silent, 60-second H.264 videos from synthetic vector illustrations and localized FAQ
text, plus posters. Each video is under 400 KB and loads only when requested. No employee media or
external video dependency is involved. Full text, language navigation and mobile full-screen guidance
remain available. Regeneration instructions are in `docs/user-guide/README.md`.

Verification: shared help tests pass (3, including the photo-specific document/video route); panel
TypeScript and focused lint pass. Browser QA opened the nested FAQ from the editor and inspected
expanded answers. Desktop/mobile instruction and FAQ screenshots were captured and inspected;
HTML stayed within 390 CSS pixels. Actual video playback advanced with duration 60 seconds and no
media error. Representative Ukrainian and Russian video frames were visually inspected. Lean final
recommendation: keep help collapsed until requested, keep human confirmation explicit, and teach
normal/unassessable examples alongside problems. No operational decision behavior changes.

## Owner refinement — icons and contextual help

All photo-editor actions use `shared/ui/icon-button.tsx`: the existing shadcn Button plus a Lucide
icon and a short localized tooltip. Visible labels, pressed states, event handlers, link attributes
and disabled conditions remain intact. Disabled actions expose help through a keyboard-focusable
wrapper; enabled actions receive the tooltip description directly. Radix Slot.Slottable preserves
anchor semantics for the original-image and guide links (official reference:
https://www.radix-ui.com/primitives/docs/utilities/slot).

Reuse FormField/SelectField hints for information icons beside all nine editable controls, including
rectangle coordinates. Existing InfoTip provides hover/focus help and tap popovers on touch devices.
Shared help and query-retry actions use the same IconButton, without importing photo-domain content.
Catalogs include Ukrainian, English and Russian descriptions. No review or AI business rules change.

Verification: 12 focused component tests pass (analysis prerequisites, shared help, IconButton toggle
and link semantics); panel type-check and focused lint pass. Desktop 1440px and mobile 390px
screenshots were captured and inspected. Mobile inspection found and fixed help-header overlap;
field explanations open on touch and all fields retain accessible labels. Synthetic review editing
and saving remain functional. Lean recommendation: proceed with icon-plus-text actions and optional
help; avoid forcing workers to identify an action by an unfamiliar symbol. Actual reduction in
training time has not been measured.

Spacing refinement: annotation cards use the same 12px vertical gap as the surrounding form, with
content-width actions and no additional coordinate-section margin. Desktop 1440px and mobile 390px
screenshots were inspected; the category-to-description gap measured 12px in both. Formatting and
`git diff --check` passed. This is a presentation-only change; no additional tests were needed.

## Image-only zoom refinement

The editor previously changed image-wrapper width from 100% to 400%, increasing its normal-flow
height and moving the auto-sized dialog. Replace that width change with a top-left CSS transform on
only the image/Annotorious subtree. Its original layout box remains stable; the existing scroll
viewport contains scaled overflow in both axes. Motion uses a short transition only when reduced
motion is not requested. The viewport is keyboard focusable. Centralized bounds are 1–5 (100–500%).

Four editor tests pass, including zoom bounds and unchanged review data; panel type-check and
focused lint pass. At 100% and 500%, desktop browser measurements showed identical dialog, comment
field and viewport rectangles, while the image dimensions grew exactly fivefold. Both scroll axes
were exercised. Drawing a 100px square at 500% produced the expected 2.49% width / 3.83% height on the
rendered synthetic image. Mobile screenshot and overflow checks cover the same isolated viewport.

For a future drag/pinch interaction, prefer the already installed TypeScript-native
`@panzoom/panzoom` over another React dependency. Bind it to the image-plus-annotation subtree,
never the dialog; define gesture ownership separately from annotation drawing before enabling
pointer dragging. This fix provides native scrolling, not a newly introduced drag gesture.

## Selected-region deletion

Add a labeled IconButton in the image toolbar; retain per-card deletion. Backspace/Delete are scoped
to the inspection session and handled in capture so Annotorious cannot interpret an area-deletion
command as polygon-vertex editing. Whole-region deletion is the explicit shortcut in this editor.
Ignore text/select/contenteditable controls, modifiers, IME composition, repeated events and busy
operations. Model deletion also rejects locked/read-only reviews and missing IDs. Both entry points
use the existing deletion semantics: remove from the draft, clear selection, set UNREVIEWED, then
require the reviewer to choose an outcome and save. No operational records are deleted.

Twenty focused tests pass for selection, model guards, keys, field editing and existing geometry
rules. Panel type-check and focused lint pass. Browser QA verified Delete and Backspace deletion,
Backspace text editing without region loss, and the toolbar action. Desktop/mobile screenshots were
captured and inspected. Localized FAQ and generated HTML now include deletion usage. Lean: proceed;
the nearby action and familiar keys remove the need to search inside a long annotation list.

## AI helper and visible saved work — 2026-09-11

The owner superseded the save-before-analysis rule: AI is an optional assistant for finding new
problems, available with empty or unsaved fields. Saving/request admission and an active analysis
still guard against duplicate operations. The request snapshots current guidance without saving
human review data; an optional contract field preserves older clients. Request IDs are reused only
for an unchanged version/guidance payload, and the server rejects mismatched replay payloads.

The editor owns a saved baseline and derives changes from it. Each changed top-level field and each
added, edited or removed region counts once; repeated typing and reverted changes do not accumulate.
The save label includes the total and an adjacent summary names the affected fields/region counts.
Successful save replaces the baseline with the canonical server review and invalidates handover data.

Handover photos expose a small nullable inspection summary via a single exact-identity left join.
Only human-saved versions (>0) qualify. The feature-owned marker distinguishes annotations, completed
review outcomes and unfinished drafts. AI-only rows and replacement media have no marker. No database
migration or operational handover transition changes are needed.

Verification: 23 API integration tests passed, including unsaved guidance, unchanged human revision,
replay mismatch, persisted summary and replacement isolation. API build and panel type-check passed;
focused panel tests and lint passed. Independent backend review found no blockers and reused these
results. Isolated browser QA exercised empty and unsaved AI requests, preserved draft text, accepting
an AI region, change-count reversion and reset after save. Desktop (1440px) and mobile (390px)
screenshots of the editor and saved marker were captured and inspected. Production data was untouched.
Localized guides/FAQ were regenerated; animation work from a concurrent writer is separate.

Lean: proceed. Remove the unnecessary save before requesting help and prevent repeated inspection
through a durable, explicit marker. The count explains the next save without requiring JSON reading.
Observe whether masters reopen completed photos unnecessarily; no production time saving is claimed.

## Compact photo marker — 2026-09-11

Replace the below-photo status block with a blue frame and translucent thumbnail background using
existing theme colors. InspectionPhoto owns the localized inspection meaning; PhotoThumb accepts a
domain-independent highlight description and anchors the shared tooltip to its existing button.
The tooltip and accessible name retain saved status, incomplete-review meaning and region count.
Unreviewed/AI-only photos remain unhighlighted; saved clean reviews retain their saved-work marker.
The original image is not tinted, and opening it uses the existing action.

Four focused component tests (including mouse hover), panel type-check and focused lint passed. Desktop 1440px and mobile
390px screenshots were captured and inspected; keyboard focus displays the description. Lean:
proceed, removing the extra text block reduces gallery height while keeping saved work identifiable.

## Image gestures — 2026-09-11

Use an inspection-owned native Pointer Events/wheel adapter over the existing transformed plane and
scroll viewport. No dependencies were added. The existing Panzoom integration belongs to the separate
plain-image viewer; retaining native scrolling here preserves Annotorious geometry and makes event
ownership explicit. Pan mode consumes pointer events in capture; drawing modes retain left-button
events, with middle-button pan available as a shortcut. Two captured pointers provide midpoint-anchored
pinch/pan. Pointer release/cancel and callback-ref cleanup release gesture ownership.

The adapter exclusively writes the image/overlay transform and scroll offsets; the editor owns the
scale value shared with existing zoom buttons. Wheel input normalizes pixel/line/page deltas and accepts
trackpad pinch (Ctrl+wheel) only inside the image viewport. Browser keyboard zoom and outside scrolling
remain native. Remove CSS transform transitions so direct gestures track the pointer without lag.
React Compiler receives the stable mount callback from the session factory, matching the existing
Annotorious mount pattern. No application React ref/state synchronization hooks were introduced.

Verification: 28 focused model tests passed for scale/anchor math, wheel scope, pan/drawing separation,
pinch, cancellation/cleanup, existing geometry and deletion. Desktop browser QA confirmed unchanged
viewport and textarea rectangles at 100% and about 300%, a 90x50px drag with unchanged scale, and a saved
rectangle drawn after zoom/pan with normalized geometry. Native two-touch browser input changed scale
from 100% to 187.5%. Desktop/mobile screenshots were inspected. Lean: proceed; direct gestures reduce
repeated zoom-button clicks while a dedicated pan tool avoids accidental annotations.

## One-time AI suggestion selection — 2026-09-11

Each annotation may retain an optional `sourceFindingIndex` alongside its source run ID. Completed
run arrays are immutable, so the pair identifies a finding independently of human edits. The editor
and available-option selector share this identity; rapid duplicate actions do nothing, deleting the
annotation restores the original option, and an all-added message explains the empty option list.
The existing JSON review/revision storage preserves the additive field without a migration. Contracts
reject duplicate references; the existing save transaction verifies run ownership/status and that the
indexed finding has geometry. Existing version conflict and authorization rules are unchanged.

Older untouched copies are linked in the draft only when their source content matches exactly. The
same normalization applies to the saved baseline so opening a review does not invent pending changes.
Already edited legacy copies without a finding index cannot be attributed reliably; they are retained
without guessing or deleting historical data. Cross-run object deduplication is outside this change.

Workplace guidance remains optional as specified by the current request contract and worker prompt;
no save prerequisite is reintroduced. All locales explicitly explain this. Rename the overall comment
to General photo note, retain its stored data and Not assessable requirement, and expose an inline
explanation, example and associated accessible description. Per-region comments retain their purpose.
FAQ and generated HTML cover selection/restoration and both fields; existing video assets are unchanged.

Verification: 18 focused frontend tests, 3 contract tests and 10 API integration tests passed. Panel
type-check, API build and focused lint passed. Independent read-only review found no blockers; its
optional-wording ambiguity and unrelated select projection were corrected. Isolated browser QA
confirmed empty-guidance analysis, copy/edit/save, reopening with the option still hidden, and deleting
the region to restore its original suggestion. Desktop 1440x1000 and mobile 390x844 screenshots were
captured and visually inspected, including inline notes and keyboard tooltip access. No production
photos or operational records were changed.

Lean: proceed. Prevent duplicate work and keep restoration reversible; clarify optional input without
adding a mandatory step. Observe duplicate-region creation and requests for help during the pilot;
no measured production time saving is claimed.

## Automatic submitted-photo review — 2026-09-11

Owner clarified that prohibited items belong to each checklist/zone pair. `checklist_photo_rules`
uses family + zone uniqueness, versioned writes and zone-scoped master permissions. Empty lists turn
admission off. The source definition anchors history; deleting an unused checklist family cascades
its configuration, while existing report references still protect used definitions. The new frontend
feature exposes its public component to legacy admin/handover composition; existing Nest modules stay
in place. No new dependency or broad architecture migration.

The worker scans SUBMITTED reports, locks report/attachment/inspection rows, snapshots the first
automatic instruction across the report and atomically writes run + durable task + audit. A unique
partial index admits one automatic run per inspection. Manual and automatic requests share 5/photo
and 200/global rolling daily limits. Media readiness, failures and restarts use existing durable task
recovery; terminal model failures lead to manual review instead of a clean result or endless retry.
Completed/superseded reports never reopen. Corrupt-only attachments move directly to manual review.

`MASTER_REVIEW` is an operational report state, pending and preliminary for bonus evaluation. The
migration's partial open-report index excludes existing terminal enum values, so PostgreSQL does not
use the new enum literal within the same migration transaction. API/photo views expose outstanding
AI acknowledgement. Final resolution is blocked until attached automatic photos are reviewed/saved.
The report lock serializes admission and resolution. AI predictions and stable source finding IDs
are separate from human revisions; only explicit review save writes the dataset and acknowledges AI.
The editor never replaces a live unsaved draft when a background analysis finishes; it offers reload.

Lean: Proceed with one checklist/zone object list and the existing photo review/decision flow. This
removes repeated AI clicks and copies while retaining the human decision. Do not turn model guesses
into employee penalties. Measure missed objects, false detections and master review time on held-out
shifts; no measured shop-floor saving is claimed.

Verification: PostgreSQL 16 migration/integration tests cover rule scope/versioning, one-run
admission under concurrency, delayed media, immutable report instructions, corrupt-only fallback,
terminal failure, no reopening, preserved human data and explicit photo acknowledgements. API photo
inspection: 14 tests; worker admission: 11; existing task recovery: 7; handover service: 15 (the final
new guard was rerun alone); checklist service: 6; domain handover/bonus: 20; editor: 14; rules UI: 1.
The rules UI regression preserves input after a failed save and rejects duplicate names. Independent
review caught and resolved corrupt-only completion, unused checklist deletion, acknowledgement and
pre-admission finalization gaps. NOT_ASSESSABLE with a comment can be saved without a decoded image.

Browser QA: captured and inspected the real rules form and inspection editor at 1365/1440 px desktop
and 390 px mobile using an isolated PostgreSQL fixture. Verified proposed boxes, deletion restoring
the option, explicit outcome/save, disappearance of awaiting-review guidance, and disabled clean save.
No production employee report was finalized during testing.

Live model pilot: analyzed the owner-selected R2 photo using current Railway credentials, without
changing its operational history. Two non-thinking probes found only one purported tool and missed
obvious cloth/cup objects; a reasoning probe incorrectly returned no prohibited objects. Visual
inspection did not validate the predicted tool. Reasoning did not improve this example, so the
existing non-thinking setting remains. This is **not** evidence of useful detection accuracy. The
pilot must keep full human inspection, including empty AI results. Saved corrections support later
held-out evaluation; they do not train the hosted API. Cloudflare's current model documentation
confirms vision and the OpenAI-compatible interface, but provides no guarantee of bounding-box
accuracy: https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/.

API/worker/panel type checks, focused lint, i18n catalogs (10 tests) and panel production build passed. Production configuration and final deployment evidence are reported with the release.

## Default image panning — 2026-09-11

Remove the separate Pan photo toolbar action and mode. Selection mode now pans unmarked image areas
by default and supports two-finger pinch. Annotation shapes and resize handles retain their pointer
events; a drag suppresses its follow-up click, while ordinary selection clicks remain available.
Rectangle/polygon drawing retains left-button ownership and returns to selection/panning after
creation. Middle-button panning remains available while drawing. Update all localized hints and FAQ.

Verification: 18 focused viewport/editor tests, panel type-check and focused lint passed. In the real
browser, default dragging moved scroll offsets by 100x50px without activation; dragging a resize handle
changed the annotation bounds while image scroll remained fixed. Native two-touch pinch changed only
the image from 100% to 200%, with browser page scale remaining 1. Desktop 1440x1000 and mobile 390x844
screenshots were captured and visually inspected. Lean: proceed; removes an unnecessary activation
step while preserving annotation editing. Automatic-review groundwork remains a separate pending task.

## Remove explicit selection action — 2026-09-11

Remove Select region from the toolbar; selection and background panning remain the default mode.
Rectangle and Polygon now toggle off when pressed again, cancelling drawing through the existing
canvas adapter. Successful drawing still returns to selection automatically. Localized tooltips explain
cancellation; no annotation data or persistence behavior changes. Twelve focused editor tests, panel
type-check and focused lint passed. Desktop/mobile screenshots were visually inspected, and browser
interaction confirmed the active drawing tool toggles back to neutral. Lean: proceed; fewer controls,
with a retained exit from drawing so removal does not create a dead end.

## Saved photo library — 2026-09-11

Add the FSD `pages/photo-library` composition and scoped `GET /admin/photo-inspections`. The library
contains human-saved versions, including clean and unfinished reviews, with preview, result, shift date,
zone, reporting employee, region count, remarks and last-save time. Explicit search/status/date filters
run before pagination; counts and rows share a read-only repeatable-read snapshot. The list uses the
same zone-first/assignment-fallback access rules as the editor. DTO validation excludes storage keys.
No schema migration or data duplication is needed. The existing editor invalidates both list surfaces
on save; replaced photos remain available read-only without transferring labels to their replacement.

Verification: 12 API integration tests and 19 focused UI/table tests passed; API build, panel type-check,
contracts/i18n build and focused lint passed. CI caught a test-only spread of an unknown JSON
context; the fixture now parses it through InspectionContext. API type-check and all 12 integration
tests passed after correction. Independent access review found no actionable defects.
Real-browser isolated PostgreSQL QA verified table → existing annotation → edit → save → search by
updated text. Desktop 1440x1000 and mobile 390x844 screenshots were captured and visually inspected;
mobile cards and the annotation editor remain usable. Production employee data was not modified.

Lean: proceed. One searchable list removes repeated navigation through handover reports; reuse of the
editor avoids duplicate data entry. Save and close is the explicit endpoint. In-app How-to/FAQ covers
scope, historical read-only photos, conflicts and later dataset use in all three languages. Measure
reviewer time to find and correct a saved example; do not equate region count with worker performance.
Automatic-review groundwork remains separate and uncommitted.

## Numbered, simplified editor — 2026-09-11

Proceed (Lean): remove duplicate category entry and per-photo rule entry. The inspection GET exposes
validated current checklist-family/zone objects after the existing photo authorization; no new write
permission or migration. The editor displays that list and snapshots it through the existing manual
analysis request. Legacy categories/guidance remain stored; new manual regions use OTHER. No model
reclassification of historical data is implied.

Use Annotorious DrawingStyle for green selected geometry, with a pointer-transparent React number
layer in the same image plane. Reciprocal scale keeps number badges readable at 100–500%. The list
adapter owns its selection subscription and animation frame cleanup; only list scrolling changes
on selection. UUID identity and source finding references remain unchanged after renumbering.
The toolbar uses existing IconButton icon-lg sizing and accessible hidden names; Save/Analyze keep
visible text. Help/FAQ/static guides are updated in all locales.

Verification: panel tests passed (191; CLI unexpectedly ran the full panel suite), focused API rule
readback integration passed, editor tests cover instruction snapshots/legacy preservation and list
scroll cleanup. Browser screenshots inspected at 1365x1000 and 390x844: green image/list selection,
list scrolling from 396 to 0 for the first region, 24px badges retained at 150% zoom, icon toolbar,
free-text fields and configured object list. Browser writes used an isolated PostgreSQL fixture.
Production rule configuration for Оператор СТ вторая стенка / Вторая стенка стаканы was saved and
read back with Ганчірки, Стаканчики, Інструменти, version 1, after v0.82.0 API deployment succeeded.
No employee report was finalized for QA. The previously recorded Gemma accuracy limitation remains.

## Live region number anchoring — 2026-09-11

Numbers now subscribe to the Annotorious geometry store rather than waiting for saved-review
lifecycle events. A callback-ref adapter owns badge coordinates and removes its subscription on
canvas teardown. Annotorious 3.8.10 rectangle editing calculates bounds from the previous frame;
derive anchors from current rectangle coordinates/rotation or polygon vertices instead. No library
patch, DOM polling, additional render loop or persistence change is needed.

Verification: 16 focused tests passed, including stale-bounds movement/resizing, polygon bounds,
ref reattachment and cleanup. Desktop browser dragging and corner resizing with the mouse held
kept the number within 0.03 CSS pixels of the region corner before release. Zoom retained 24px
badges. Desktop and mobile screenshots were captured and visually inspected using isolated QA data.
Physical touch dragging was not tested. Lean: proceed; remove visual lag without another control
or reviewer action. The acceptance measure is same-frame number/region alignment.

## Simple rule clarification — 2026-09-11

Owner request: improve checklist AI instructions while keeping setup easy for each checklist.
Acceptance: names alone still save; common names can be added once per draft; optional clarification
and exceptions stay collapsed and survive save/reopen or failure; both analysis routes receive the
same structured rule data; existing names, reviews, scope and immutable run snapshots remain valid.
No new model/provider, per-photo-point selector, automatic examples, training or operational decisions.

Keep the FSD checklist-photo-rules feature, existing query mutations and shadcn Collapsible/Input/
Textarea primitives (https://ui.shadcn.com/docs/components/radix/collapsible). Pure draft preparation
belongs to its model segment. Additive migration 0034 retains the existing items array and adds a
bounded JSON details array keyed by exact item name. API validation rejects duplicate/orphan details.
Old clients preserve details for retained names; explicit empty details clears them. Both manual and
automatic consumers use the shared instruction builder; prompt v2 respects supplied exceptions and
retains legacy automatic-run detection. Input serialization has a bounded worst-case escaped size.

Lean: Simplify. One required name, optional disclosure and suggested names reduce typing without
inventing workplace policy. Existing icon-only controls and removal of the reload action are included
from the coordinated annotation task. Observe setup time and model false alarms; no accuracy or
shop-floor time improvement has been measured. Model evaluation remains separate follow-up work.

Verification: 14 API PostgreSQL integration tests passed, including detail round-trip, unchanged-name
legacy saves, explicit detail clearing, invalid JSON shape and existing scope/conflict checks. Worker
admission/recovery tests passed (18); after removing conflicting hardcoded category defaults, the
focused prompt regression passed. Contracts passed (5); editor/model tests passed (14), rules UI
passed (3), covering failure retention, quick-add deduplication and clearing saved details. API,
worker and panel type checks plus focused ESLint passed. Independent backend/migration review found
one prompt conflict, corrected and confirmed resolved.

Chrome QA used the real feature with isolated in-memory transport and persisted synthetic fixtures;
no production rules or employee records were changed. Save/reopen retained both optional fields and
collapsed the detail section. Screenshots at 1280px and 390px iframe viewports were captured and
visually inspected; mobile wrapping and keyboard-triggered information tips worked. Database and
worker behavior was verified separately by the integration tests above. No model accuracy benchmark
was run. Deployment evidence remains distinct from this local verification.

## Photo library row navigation — 2026-09-11

Removed the redundant Actions column; clicking a non-interactive part of the row now opens the
existing inspection dialog. The shared table's native detail button and the thumbnail retain
keyboard access. Filters, pagination, stored reviews and archived-photo behavior are unchanged.
Lean: simplify the row by removing a duplicate action without adding another interaction mode.
Three focused library tests passed, as did panel typecheck and focused ESLint. Desktop (1365px)
and mobile (390px) screenshots of the real page with isolated synthetic data were captured and
visually inspected; the mobile card retains its metadata and total count without an Actions field.

## Named annotation form — 2026-09-11

Owner request: make annotation useful for future data preparation without duplicate explanations.
Acceptance: a reviewer can select a checklist object name and save a region without typing prose;
custom names work; optional region details and photo notes retain existing text; Not assessable
opens a required reason; rule reference includes clarification/exceptions; named regions survive
save/reopen/export/library search; original media, source finding identity and review permissions
remain unchanged. No new taxonomy service, automatic relabeling, training or operational decisions.

Keep the existing FSD inspection feature and editor-owned draft. Add optional objectName to the
validated annotation JSON; require a name or legacy description. No migration/backfill is needed.
The human object name is separate from retained legacy category and immutable AI predictions;
dataset preparation must normalize names and resolve conflicts rather than treating both fields
as independently confirmed classes. The library searches names and includes them in previews.

Lean: simplify. Checklist presets remove repeated typing; additional context stays behind a
collapsible control. Geometry already captures location, so it need not be repeated in prose.
Existing notes open visibly, and changing assessment status never clears them. One unsaved-work
indicator replaces duplicated field/region counters. Validation points to the next missing action.
Measure time to label a photo, inconsistent naming and correction rate on real examples; no model
accuracy or worker-time improvement has been measured in this change.

Verification: contracts 4 tests, API PostgreSQL integration 15 tests, editor 14 tests, prediction UI
1 test and new form UI 4 tests passed. The API regression covers name-only save/read/export/search;
UI tests cover preset selection, name-only dirty tracking, retained source identity/descriptions,
conditional reasons and read-only labels. API/panel typecheck, panel production build, 10 catalog
tests and changed-file ESLint passed.
Chrome screenshots at 1365x1000 and 390x844 were captured and inspected. The real dialog with
isolated synthetic image/transport saved and reopened names without comments, retained optional
notes/details after status changes and displayed rule exceptions. Browser QA did not modify
production reports. Localized help text and its illustrative videos were regenerated.

Earlier rule clarification delivery was verified on source 04d9df9 / v0.84.0: API beaba30d and worker
c2dc4911 deployed successfully, API health was OK, worker startup was recorded, and a read-only
production schema query confirmed details jsonb NOT NULL plus its validation constraint.

## Annotation change count — 2026-09-11

Reported defect reproduced by a failing regression: creating one region counted two changes because
PROBLEMS was set automatically. The editor records whether the current status value came from
an annotation action or an explicit reviewer choice. Writing the same value retains that origin,
including when a reviewer chooses an outcome before drawing the first region. Counting groups an automatic status with changed
regions; manual choices and photo-level notes remain separate. Origin is transient draft metadata,
not part of stored reviews. A status difference with no remaining region changes still counts, so
undoing a temporary region cannot silently discard an outcome change. Save resets the baseline.

Lean: simplify; keep one accurate counter below the form, without repeating it on Save or listing
internal fields. Focused editor/form tests passed (20), including one/two regions, repeated edits,
removal, manual outcomes and full reversion; panel typecheck and changed-file lint passed. Desktop
1365x1000 and mobile390x844 screenshots were captured and inspected: adding/naming one region shows
1, saving removes the indicator and deleting the saved region shows1. Browser writes used synthetic
local fixtures only. No backend or migration change is required for this counter correction.
