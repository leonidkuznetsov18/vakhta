# Photo inspection

Status: implemented, initial release v0.76.0, 2026-09-11.

## Outcome

On Cleanliness and handover, a master opens a checklist photo, draws a rectangle around each object,
chooses the object from the shared catalog and states what it means for this workplace: a violation,
allowed here, or unsure. The photo outcome follows from those verdicts; the master only decides
separately that a photo cannot be assessed, with a reason. Saving needs a change; a photo without regions is
stored as a clean example. The master can request Gemma 4 analysis, which searches only for the objects configured
in the checklist for this zone, and then adds each suggestion to the review or rejects it with a reason.

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
  a running analysis temporarily disables it. The displayed checklist/zone object list is snapshotted for a manual run;
  analysis never saves the human review. Suggestions still require explicit human acceptance.
- Save changes has a stable label; a single counter appears below the form. Each changed region
  counts once, including its automatically updated outcome. Explicit reviewer outcome changes and
  photo notes count separately. Reverting all saved-data changes removes the indicator.
- Handover photo thumbnails identify persisted human work with a highlighted border and translucent
  background, including clean reviews without regions. Hover or focus shows the saved status and region
  count in a tooltip; saved annotations also show a persistent square-pen icon in the top-right
  corner. Reviews without regions have no annotation icon. No extra status block appears below the photo.
  Unfinished drafts are labeled separately. AI-only runs and replacement photos remain unmarked.
- Manual AI requests use Cloudflare Gemma 4, persist before dispatch, survive restarts and deduplicate
  retries. Automatic analysis admits submitted, unresolved reports with nonempty checklist/zone rules. Completed reports are excluded. Analysis limits and the rolling window come from API configuration and include pending and failed runs. Image size, timeout and attempts remain bounded.
- Predictions retain model/prompt/context version separately from human truth. Unsupported equipment
  state and hidden surfaces are not assessable; a visual opinion cannot establish electrical safety.
- Export includes reviewed human labels and source metadata as JSON, with an authorized original
  image download. Signed URLs are transport only and never dataset identity. Unreviewed and AI-only
  predictions do not become training labels. No model training or automatic acceptance in this release.
- Loading, offline, errors/retry, expired photo links, unsaved edits and concurrent changes are visible.
  UI strings exist in Ukrainian, English and Russian. Relevant tests and desktop/mobile visual QA
  demonstrate the journey; secrets never reach the browser or logs.

## Operator flow

Open photo → draw a rectangle per object → choose the catalog object and its verdict → save.
The outcome is displayed, not chosen. Request AI when the checklist object list exists → add correct
suggestions, reject wrong ones with a reason → save the human review. The object list is the only
thing the model searches for; it must not invent workplace rules.

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
explain the expected input; on a phone, tap the information icon. The precise coordinate fields were
removed: boxes are adjusted by dragging on the photo.
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

The editor displays the current checklist/zone object list instead of an editable requirements field. Manual analysis requires no prior save. The general photo note
explains the overall human review, is optional except for Not assessable, and is not an AI instruction.
It stays collapsed until requested; Not assessable opens the required reason. Individual findings use
What is marked and optional Finding details.

## Saved photo library

The panel's Annotated photos page collects every human-saved inspection (`version > 0`), including
unfinished reviews and explicit clean examples without regions. AI-only runs and unsaved changes do
not enter the library. Each row identifies the photo, review result, shift date, zone, reporting worker,
region count, remarks and last-save time. The Photo assessment column contains the saved human
verdict. Did AI help? shows the current reviewer's feedback on the newest analysis run, matching the
editor; an unrated or absent run reads Not rated, never No. Starting another analysis clears the
previous run's displayed rating, and saving feedback refreshes the library. Thumbnails on this page
use the plain photo control without the redundant saved-annotation highlight or pen icon; other
inspection surfaces keep their existing markers. Search covers worker, zone, photo label and human remarks;
status and inclusive shift-date filters apply before server pagination. The footer reports the full
filtered count. Search updates automatically after a 300 ms pause; valid status/date changes apply
without a submit button. Changing a filter returns to page one. Clear filters resets the whole search
and is disabled at the defaults. Narrow screens use the shared table's card layout, with the date
endpoints side by side. Region count belongs to the review result; zone and worker share a context
column. Full remarks remain available in the photo editor.

Open photo launches the same annotation editor as the handover page. Save changes updates the same
review and append-only revision history, then refreshes the table. The original image, operational
handover decision and employee scores remain unchanged. Authorized reviewers retain their existing
scope; HR and auditors can read. A replaced attachment retains its saved inspection in the library,
with an explicit read-only marker. Annotations never move to its replacement.

How it works and FAQ in Ukrainian, English and Russian explain inclusion, editing, read-only history,
conflict recovery and the later evaluation/training use of saved examples. No separate upload, copy,
AI training job or new approval process is introduced by this page.

## Checklist object rules and manual AI analysis

Object types live in one shared catalog (`photo_objects`): one entry per spelling family (case,
spaces and a final vowel are ignored, so "Ганчірка" and "Ганчірки" are one entry), created inline by
any reviewer from the checklist form. Names are written in the singular ("Стаканчик", "Провід"):
the model searches for every instance regardless of number, and a second entry for the same object
("Провід" next to "Провода") makes the same item get boxed twice. The tooltips of the rules form,
the region select and the help FAQ state this rule; the production catalog was normalized on
2026-09-11 (plural duplicates deactivated, their rules moved to the singular entry). Every catalog
object owns one color, assigned on creation as the least used hue of a twelve-color palette and
stored with the object, so a rule chip, a region card, a suggestion and the box on the photo show
the same color on every screen and stay the same when the rule list changes.
Reviewers maintain the catalog from the same form: **Edit catalog** turns the chips into rows
where an entry can be renamed (its id, color, rules and regions follow the new spelling; a
spelling another entry owns is refused) or removed after confirmation. A removed entry leaves
every checklist list at once and stops being offered, while saved photo regions keep its name. **Objects that must not appear in the photo** is one list per
checklist family, shown as saved the moment the checklist is expanded, with no zone to choose. Each
object may carry a note for the master and the model (appearance, placement, allowed cases; up to
300 characters). Rules survive a new checklist version and keep optimistic version checks and an
audit trail. Up to 30 objects per checklist. The selected list scrolls within a bounded height so
Save stays in reach, an unsaved-changes counter shows how many objects were added, removed or
re-noted, and collapsing the row, switching sections or closing the tab asks before discarding edits.

There is no automatic analysis stage and no Master Review status: a submitted report goes to the
master as before, and the report decision never waits for photo reviews. AI runs only when a reviewer
selects **Analyze with AI** in the photo editor. The request snapshots the current rules on the server;
an empty list makes the button unavailable and the request fails with a clear message. The worker
sends four overlapping quadrants of the upright photo to Gemma with a fixed instruction template plus
one object type as data per request, with greedy decoding and a fixed seed, repeats every request in
three independent rounds, keeps an instance only when at least two rounds located it, gives a box
claimed by two object types to the type located more often, merges duplicate boxes across rounds and
tiles and returns one finding per instance with the matched catalog object. Requests run up to eight
at a time and a throttled or failed request is retried before the photo is given up. Findings remain unconfirmed suggestions; nothing is saved without
the reviewer.

## Was AI useful

Under the AI suggestions the reviewer answers **Did AI help with this photo?** with one of three
ratings: yes, partly, no. The answer is stored per run and reviewer (`photo_inspection_feedback`),
never changes the review or any scores, and can be replaced by a later answer. It is the usefulness
number the pilot is judged by, alongside rejected findings.

## Numbered region review

The editor shows the configured checklist/zone prohibited objects as a read-only list. Each region
has a matching number on the image and in the description list. Selection highlights both in green
and scrolls the list to the selected description. Numbers follow the current list after deletion;
persisted UUIDs and AI source references remain stable. Region descriptions are free text; the
category selector is removed, while existing category/guidance data remains preserved in exports
and stored revisions. New manual regions retain the existing OTHER category internally.
The image toolbar uses larger icon-only controls with localized hover/focus tooltips and accessible
names. Save/Analyze remain labeled primary actions.

## Region verdicts and computed outcome

Every region names a catalog object (checklist objects first, then the rest of the catalog, or a
free-text other object) and carries a verdict: **Violation**, **Allowed here** or **Unsure**. Any
violation makes the photo **Problems found**; only allowed regions or none make it **No problems
found**; an unsure region keeps it **Not reviewed**. The reviewer never picks the outcome by hand.
**The photo cannot be assessed** is a switch with a reason (blurred, too dark, wrong angle, view
obstructed, wrong workplace, other with an explanation). A clean photo can be marked as the
**reference** for its photo point. Rectangles are the only drawing tool; stored polygons stay readable.

## Editor layout

The photo sits in the left column and the review controls in the right one on wide screens;
phones stack them. The region list and the AI suggestion list scroll inside a bounded height so
Save and Analyze stay in reach. On wide screens the dialog takes a fixed height: the photo fits
that height at 100% zoom (zooming pans inside its own frame) and the form is the one scrolling
column, with Save and Analyze pinned at its bottom; no list scrolls inside another list. Only the
selected region shows its full form; every other region folds to one line with its color, name
and verdict, and a region without a name stays open until it gets one. The catalog select inside
a region offers to add a missing object to the catalog by typing its name; the new entry is stored
and selected for that region at once. The object list for AI is edited only in checklist
administration; the handover report shows the checklist answers and photos without that form.

## AI boxes appear on the photo, colors per object

When the answer to this session's analysis arrives, every located finding is drawn on the photo at
once as a region with its catalog object and the verdict Violation; the reviewer keeps, corrects or
rejects boxes instead of adding them one by one. Suggestions from an earlier run remain in the AI
panel for manual adding. Every object of the checklist list has its own vivid color by list position, used for
the box, the number badge, the chip, the rule legend and the AI panel; unnamed regions are white and
the selected region is outlined green.

## Rejected AI findings and review time

An AI-drawn region has a Reject action with a reason: object is not there, different object, allowed
here, box is misplaced. Rejecting removes the region and records the refusal with the human review;
undoing it restores the suggestion. Model precision is measured from what reviewers actually
refused. The unsaved-changes counter counts regions and reviewer choices only; the outcome that
follows from the regions is not a separate change. Every saved revision records how long the editor
had been open.

## Named regions with optional details

Each region offers **What is marked**: one-click names from the current checklist/zone or a custom
name. **Add details** stays collapsed for an empty comment. Existing comments open automatically
and remain unchanged when a name is added. One region should contain one object or one consistent
problem; placement is recorded by geometry rather than repeated in prose.

The structured optional `objectName` travels with the region through saving, revisions, export,
read-only review and library search. A name alone is sufficient; legacy descriptions remain valid
without relabeling. Names are captured text, not a new global class catalog or a guarantee of
training readiness. A future dataset preparation step must normalize classes and audit labels. Use `objectName` as
the explicit human object label when present; retained legacy `category` values are not a second
independently confirmed object class.

Inspection rules are a collapsed reference with clarifications and exceptions. Missing names,
missing assessment reasons and contradictory outcomes show specific next actions. An empty
annotation list still never implies that the photo was reviewed or found compliant.

## Visible AI limits

The photo editor shows current usage and effective limits for this photo and the shared analysis
quota. These values come from the API, including the rolling time window; localized text contains
no fixed thresholds. Analyze with AI is disabled when either limit is reached, and its tooltip names
the exhausted limit (or both). The explanation is available by keyboard focus as well as pointer.

Usage refreshes after every analysis request and periodically while the editor is open. When quota
data is unavailable, analysis is blocked with an explanation and retry; failed refreshes preserve
cached usage. Once older runs leave the rolling window, a fresh response re-enables the action.
The API enforces the same configured limits immediately, including concurrent users' requests.
