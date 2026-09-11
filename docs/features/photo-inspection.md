# Photo inspection

Status: implemented, initial release v0.76.0, 2026-09-11.

## Outcome

On Cleanliness and handover, a master opens a checklist photo, marks visible problems with rectangles
or polygons, chooses a category and adds a comment. A separate review records unreviewed, compliant,
problems or not assessable. Empty annotations alone never mean compliant. The master can request
Gemma 4 analysis and explicitly copy individual suggestions into the human review before saving.

## Scope and acceptance criteria

- Annotorious supports multiple selectable/editable/deletable regions, comments and zoom on desktop
  and touch devices. Original media bytes and existing handover decisions remain unchanged.
- Reviews attach to handover, checklist item and immutable media identity, with checklist/zone
  context, checksum and source dimensions. Replacing a photo cannot inherit its predecessor's labels.
- Every save creates a revision and audit entry. Concurrent stale writes fail visibly, preserving
  the local draft. Masters and cleanliness controllers write within their granted scope; authorized
  viewers can read within their scope. Completed handovers permit this independent dataset review,
  without reopening operational decisions, notifications, scoring or shift state.
- Analyze with AI is an optional helper, available with empty or unsaved form fields. Only saving or
  a running analysis temporarily disables it. Current workplace guidance is snapshotted for the run;
  analysis never saves the human review. Suggestions still require explicit human acceptance.
- Save changes shows the number of changed fields and regions compared with the last saved version,
  plus a readable summary. One edited region counts once; reverting edits removes them from the count.
- Handover photo thumbnails identify persisted human work with a highlighted border and translucent
  background, including clean reviews without regions. Hover or focus shows the saved status and region
  count in a tooltip; no extra status block appears below the photo.
  Unfinished drafts are labeled separately. AI-only runs and replacement photos remain unmarked.
- Manual AI requests use Cloudflare Gemma 4, persist before dispatch, survive restarts and deduplicate
  retries. Automatic analysis admits submitted, unresolved reports with nonempty checklist/zone rules. Completed reports are excluded. Bounded request volume, image size, timeout and attempts.
- Predictions retain model/prompt/context version separately from human truth. Unsupported equipment
  state and hidden surfaces are not assessable; a visual opinion cannot establish electrical safety.
- Export includes reviewed human labels and source metadata as JSON, with an authorized original
  image download. Signed URLs are transport only and never dataset identity. Unreviewed and AI-only
  predictions do not become training labels. No model training or automatic acceptance in this release.
- Loading, offline, errors/retry, expired photo links, unsaved edits and concurrent changes are visible.
  UI strings exist in Ukrainian, English and Russian. Relevant tests and desktop/mobile visual QA
  demonstrate the journey; secrets never reach the browser or logs.

## Operator flow

Open photo → mark regions and describe observations → choose review outcome → save.
Optionally enter workplace guidance, then request AI → inspect suggestions → copy useful
findings and correct them → save the human review. Guidance describes the visible requirements,
including what belongs in a zone; the model must not invent workplace rules.

## Pilot

Up to 50 photos/day initially. Keep human confirmation. Observe missed issues, false alarms and
review time on held-out shifts/workplaces before deciding whether to automate any operational step.

## First-time user guidance

The editor includes the existing **How it works** and **Questions and answers** pattern. Six steps
and FAQ answers explain annotation, its purpose, concrete comments, normal/unassessable
photos, workplace rules, AI errors, analysis prerequisites and the separation from handover decisions.
The handover page also directs users to this photo-specific help.

A full, printable HTML guide and a silent 60-second illustrative video are available in Ukrainian,
English and Russian at `/guides/photo-inspection.{uk,en,ru}.html`. The video explains concepts with
synthetic workplace drawings; it is not a recording or an accuracy claim. Text remains available
without video playback. Training is explicitly a future, separately evaluated stage.

Every photo-editor action includes an icon, its existing label and a short explanatory tooltip.
Disabled actions still expose their explanation to keyboard users. Information icons beside fields
explain the expected input, including rectangle coordinates; on a phone, tap the information icon.
The Ukrainian interface uses Ukrainian explanations, with equivalent English and Russian catalogs.

Select an annotation and use Backspace/Delete outside form fields, or select **Delete selected
region** in the image toolbar. The existing per-region delete action remains available. Deletion
changes the draft, clears selection and returns the outcome to Not reviewed; choose the outcome and
save. Editing text, read-only access and pending operations do not permit shortcut deletion.

## Photo navigation gestures

In the inspection editor, the wheel zooms around the cursor (100–500%), including trackpad pinch
wheel events. Default selection mode also enables background dragging and one-/two-finger pan and pinch;
no activation button is needed. Annotation shapes and handles retain selection/editing. There is no separate Select region button;
pressing the active Rectangle/Polygon tool again cancels drawing and restores default selection/pan. Middle-button
dragging pans in any annotation mode. Drawing/selecting remains owned by the annotation tools; return
to one of those tools to edit regions. Native scrollbars and keyboard scrolling remain available.
Only the photo and its annotation overlay transform; other form controls keep their size and position.

## AI suggestion selection and field guidance

Each finding in an immutable AI run can be copied once. Its option disappears while the linked
annotation exists, including after editing its text/category/geometry and saving/reopening. Removing
the annotation returns the original option; copying it again uses the original AI content. When all
options are copied, the panel explains that deletion restores them. Separate runs remain independent.

Workplace requirements are optional for analysis and require no prior save. The general photo note
explains the overall human review, is optional except for Not assessable, and is not an AI instruction.
Its inline help and example distinguish it from each region's What is wrong description.

## Saved photo library

The panel's Annotated photos page collects every human-saved inspection (`version > 0`), including
unfinished reviews and explicit clean examples without regions. AI-only runs and unsaved changes do
not enter the library. Each row identifies the photo, review result, shift date, zone, reporting worker,
region count, remarks and last-save time. Search covers worker, zone, photo label and human remarks;
status and inclusive shift-date filters apply before server pagination. The footer reports the full
filtered count. Narrow screens use the shared table's card layout.

Open photo launches the same annotation editor as the handover page. Save changes updates the same
review and append-only revision history, then refreshes the table. The original image, operational
handover decision and employee scores remain unchanged. Authorized reviewers retain their existing
scope; HR and auditors can read. A replaced attachment retains its saved inspection in the library,
with an explicit read-only marker. Annotations never move to its replacement.

How it works and FAQ in Ukrainian, English and Russian explain inclusion, editing, read-only history,
conflict recovery and the later evaluation/training use of saved examples. No separate upload, copy,
AI training job or new approval process is introduced by this page.

## Automatic checklist photo review

A master configures **Specify what must not appear in the photo** next to a checklist, selecting its
zone and entering one object per field. Rules belong to the checklist family and zone, survive a new
checklist version, and do not affect another zone. An empty list disables automatic analysis for that
pair. Up to 30 unique names of 100 characters each are accepted. Rules have scoped permissions,
optimistic version checks and an audit trail.

When an employee submits the report, the worker admits its processed photos without opening a panel
page. The first admitted photo snapshots the instruction for all photos in that report. Changing the
list later affects subsequently admitted reports, not a report already being analyzed. Existing
submitted unresolved reports are eligible; no completed history is re-analyzed automatically.

Every model finding needs a bounding rectangle and an explanation. These remain unconfirmed AI
predictions. When all attached readable photos reach a terminal AI result (including failure), the
report becomes **Master Review**. A report containing only corrupt photos also goes to the master;
it is never labeled clean automatically. Processing delays or daily limits can delay admission.

Open every marked photo. Automatic regions appear in a separate unreviewed draft, preserving saved
human data. Correct boxes and descriptions, delete false findings or add missed objects. Choose a
review outcome, then save. Deleting a proposed region restores its option in the AI list. Saving an
explicit final photo review acknowledges that automatic run and creates the human dataset revision.
An AI result with no findings still requires a human outcome. Failed analysis leaves manual review
available, including **Not assessable** with an explanation when the image cannot be inspected.

The report's approval/remark actions remain unavailable while an attached automatic photo review is
unacknowledged. Once the photos are reviewed, the master makes the existing final report decision.
Only this human decision affects operational remarks and employee points. AI never confirms a
violation, awards/deducts points, or trains itself merely by receiving corrected examples.

The manual **Analyze with AI** helper stays available independently of the automatic flow.
