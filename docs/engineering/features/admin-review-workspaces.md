# Admin review workspaces

## Specification — 2026-09-12

Owner-approved scope: implement a coherent layout for modals and expanded table rows, prioritizing
Handover evidence/decisions, photo inspection and checklist photo rules. The owner supplied production
screenshots showing off-screen actions, unused width and multiple competing scroll regions.

Current behavior: RowDetail caps every record at 1024 px; Handover stacks all evidence and actions;
photo inspection places actions inside a scrolling column before AI results; checklist rules show the
whole editor immediately, with an independently scrolling list and expanded textareas. General dialogs
only constrain height on narrow screens.

Expected behavior: use the available record width with bounded prose; keep evidence before decisions;
make photo navigation, status and save reachable independently of long content; show saved checklist
rules before explicitly entering editing. Reference/help content is secondary; validation, pending
changes, quota blockers and conflicts remain apparent. No operational decision or permission changes.

## Design and architecture

- Keep existing React/Vite, shadcn, DataTable/RowDetail and feature-owned inspection/rules components.
  This layout change follows the incumbent legacy page boundaries; no bulk FSD migration is needed.
- Expanded rows use the page's natural vertical scroll; no extra scroll region for a short rules list.
  Wide Handover evidence uses aligned columns; decisions follow evidence in DOM order.
- Photo inspection uses a compact header, constrained body and a separate action/status footer.
  Desktop keeps the image fitted beside one scrolling review column; phone uses one body scroll.
  Previous/next arrows sit at the left/right of the desktop image container and below it on phones.
  They remain available during an initial query failure; navigation retains the unsaved-change guard.
  Panning a zoomed image is a deliberate separate interaction, not an extra text scroll.
- Saved rules and explicit editing are separate modes. Existing draft identity, capability checks,
  failure retention and dirty-close guards remain. Catalog maintenance remains a separate intent.
- Reuse semantic colors sparingly for status, selected regions and the principal save action.

## Acceptance criteria

1. Portrait/landscape inspection fits at initial zoom; image and annotations remain aligned at zoom.
2. Header/close and save/analysis controls remain reachable at 1440×900, 1440×700 and 390×844.
3. One review-text scroll at desktop; one modal body scroll on phone; no nested rules-list scrollbar.
4. Long rules, predictions, translated text and errors wrap without document overflow or obscured actions.
5. Handover retains every answer, note, photo and distinct decision; completed records stay read-only.
6. Rules begin in a readable saved view; edit/cancel/save preserve correct draft and catalog semantics.
7. Enabled unchanged saves remain disabled; errors and dirty state do not disappear behind disclosure.
8. Keyboard focus, nested Escape, image controls and all existing actions remain available.

## Lean review

Recommendation: **Simplify**. Reduce searching for actions and unnecessary navigation through reference
material. Do not add worker input, Telegram steps or new configuration. Validate the above visible
outcomes; no quantitative productivity gain is claimed.

## Verification and remaining work

- Affected frontend typecheck and ESLint passed. i18n build and its 10 catalog tests passed.
- 83 focused frontend tests passed across 16 files: inspection state/geometry/navigation, rules
  editing, Handover and checklist forms. Two new rules tests cover mode-exit draft protection and
  refreshed catalog names; new photo tests cover unavailable neighbors and navigation after query failure.
- Production frontend build passed (existing large-chunk and upstream Zod comment warnings).
- Local Chromium fixture preview: 1440×900, 1440×700 and 390×844. Portrait and landscape photos fit
  without an initial image scrollbar; annotation coordinates and numbered markers follow zoom.
  At 1440×700 the photo dialog is y=8..692, actions y=640..672; at 390×844 actions y=784..824
  stay within the dialog y=8..836. Desktop arrows and mobile buttons were visually checked.
  Light and dark photo-dialog themes were inspected in the browser.
- Mobile landscape image viewport now follows its aspect ratio (187.875 px high at 334 px wide),
  avoiding the former empty 405 px frame. Portrait remains capped by both 48dvh and the remaining body height after navigation.
  Images are centered horizontally and vertically; zoom remains image-local.
- A nine-item checklist dialog at 1440×700 is y=16..684 with content scrolling inside; its previous
  841 px height put both ends outside the viewport. Mobile item text now has its own wide row.
- Saved checklist rules and explicit editing were visually checked. Reference notes start collapsed
  in editing but remain readable; no independently scrolling rules list or nested prediction paragraphs.
- Nested help Escape leaves the photo dialog open. Photo switching and selected-region disclosure
  remain functional. Initial focus goes to the title, avoiding an automatically opened help tooltip.
- Read-only independent review found stale catalog names and a blank column on completed reports;
  both were corrected. A follow-up caught query-failure navigation, now covered by regression.

### Expanded aspect-ratio verification

The owner requested stronger fit verification before delivery. Five undistorted synthetic images
(720×1280, 1280×720, 960×960, 2400×600, 600×2400) were checked at five viewport sizes:
1440×900, 1440×700, 1024×768, 390×844 and 320×568. All **25 combinations passed**:

- Rendered width/height match `min(contentWidth / naturalWidth, contentHeight / naturalHeight)`
  within 1 CSS pixel, accounting for the dialog entrance transform and fractional dimensions.
- All image edges fit inside the padded container; both axes are centered within 2 CSS pixels.
- No initial horizontal/vertical image scrollbar, and the full photo and dialog fit on screen.
- At 1.5× zoom on the panorama, the annotation's normalized rectangle remained
  `[0.25, 0.25, 0.35, 0.20]` within floating-point tolerance; its number stayed 24×24 px.
- On widths below 360 px, photo-navigation buttons use accessible icon labels to avoid overlapping
  text. At larger phone widths the visible previous/next labels remain under the photo.

The implementation uses decoded image dimensions when ready, with encoded metadata only during
loading. These SVG checks do not establish EXIF behavior across all real camera formats or physical
pinch gestures. Browser measurements were taken through the local preview; no automated browser
runner or new test dependency was introduced.

### Alignment follow-up

The owner also requested consistent alignment and spacing, specifically the live-status dot next to
filters. Shared LiveBadge and StateFilter now match the existing control heights: 32 px on desktop,
40 px on mobile. FormField reserves the same label height with or without a help icon. Photo-region
headers reserve action space, AI finding dots align with the first text line, and Handover evidence
and decision cards share 12 px padding. Checklist editor headings wrap; its new-object field keeps
usable width and places the add button below when the available space is narrow.

- Browser measurements on Handover, Requests, Incidents and Operations at 1440×900 and 390×844:
  all eight toolbar checks have a 0 px difference between control centers.
- Mobile photo-region label, chevron and swatch centers match; the card has no horizontal overflow.
  A five-line synthetic AI finding has its dot centered on the first 20 px line, with no overflow.
- At 320×568 the catalog field and button each occupy the available 202 px on separate rows;
  at 1440×900 both are 32 px tall with a 0 px center difference. Screenshots were inspected.
- 51 existing focused frontend tests passed across ten files for fields, inspection review/predictions,
  checklist rules, Handover, Requests, Operations and incident management. This presentation-only
  follow-up adds no tests asserting CSS class names; browser geometry is the regression evidence.
- Affected frontend typecheck, ESLint, formatting and production build passed. Existing bundle-size
  and upstream Zod comment warnings remain unchanged.

### Compact contextual actions — specification

The owner requested icon-only buttons with tooltips where long icon-and-text labels crowd the UI.
Apply this across contextual help/search, copying, import/template download, inline editing,
checklist catalog controls, photo suggestions and photo-library filters. Keep visible text for
primary saves, operational decisions, bulk actions with counts, ambiguous setup/generation actions,
disclosure titles and export format choices. Preserve the requested mobile photo-navigation labels.

Use the existing shared IconButton and its icon size variants, with an explicit accessible name,
hover/focus tooltip and existing 40 px mobile target. Disabled controls must retain keyboard-accessible
help and native disabled behavior. Slotted downloads must remain links. No business actions, permission
checks, mutation handlers or unsaved guards change. Existing feature ownership stays intact.

Acceptance: compact controls preserve their accessible names, tooltips, link attributes and handlers;
disabled controls cannot activate; contextual actions fit at desktop/mobile widths; primary actions
and distinctions such as CSV/XLSX remain visible. Lean recommendation: **Simplify** repeated secondary
labels while retaining the information needed to choose consequential actions. User comprehension
and productivity improvements remain hypotheses until tested with operators.

Implemented at 21 button locations across shared help/search/copy, employees/import, user roles,
checklist rules, photo review and photo-library controls. Shared help/search applies throughout the
panel. The source inventory also covered reports, bonus, schedule, operations, requests, terminals
and checklist creation; their ambiguous/primary actions and distinct export formats retain text.

Verification: 27 focused tests across seven files passed, including three new accessibility/link
regressions for icon-only controls. Frontend typecheck, scoped ESLint, formatting and production build
passed; the existing bundle-size and upstream Zod comment warnings remain. Screenshots were
inspected on desktop (1440×900) and mobile (390×844), with a narrow 320×568 check for help labels and
English/Russian variants. Keyboard focus reveals disabled-action tooltips; photo suggestion menus,
command search, CSV import, inline edit and filter reset still open/act correctly. Download retains
its link and `download` attribute. Mobile actions measure 40×40 px; the catalog input retains 224 px
next to its 40 px add button at 390 px. A pre-existing mobile role-badge overflow found in the affected
view was removed by allowing wrapping. Small-screen help hides its secondary details word.

The photo-library preview lacks successful result fixtures, so its filters and error/retry state were
inspected; successful results/reset behavior also has existing regression coverage. Issuing credentials,
clipboard success for newly issued secrets, production mutations and physical touch were not exercised.
No permissions, operational decisions or persistence semantics changed.

The preview uses synthetic SVG evidence and typed read-only fixtures. No production decisions, catalog
changes, AI calls or employee messages were performed. Physical touch/pinch, all role permutations,
all translated long-text combinations, screen-reader certification and authenticated production QA
remain unverified. CI is the full integration gate and is checked after delivery. The dated audit
remains baseline evidence: this batch addresses UX14/UX15 and the owner's review-layout request;
the other backlog items are not represented as fixed.
