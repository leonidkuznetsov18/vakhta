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

## Owner refinement — empty analysis action

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
