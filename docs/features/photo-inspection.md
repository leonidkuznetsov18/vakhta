# Photo inspection

Status: owner-authorized implementation, 2026-09-10.

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
- Manual AI requests use Cloudflare Gemma 4, persist before dispatch, survive restarts and deduplicate
  retries. No automatic backlog analysis. Bounded request volume, image size, timeout and attempts.
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
Optionally save workplace guidance first, then request AI → inspect suggestions → copy useful
findings and correct them → save the human review. Guidance describes the visible requirements,
including what belongs in a zone; the model must not invent workplace rules.

## Pilot

Up to 50 photos/day initially. Keep human confirmation. Observe missed issues, false alarms and
review time on held-out shifts/workplaces before deciding whether to automate any operational step.
