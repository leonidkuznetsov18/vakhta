# Checklist catalog

## Inline record details — 2026-09-10

Owner requirement: checklist rows follow the existing panel rule: reading a record expands it under
its row/mobile card, never in a side sheet. `ChecklistsTab` now uses DataTable.expanded and its shared
RowDetail boundary. The persisted open id toggles on row click; saved versions still become the active
row. The complete ordered bot preview, effective timestamp and existing management actions remain.
Name, positions, zone type, version, status and counts stay in the preview only. Creation and versioned
editing retain the existing dialog, validation and mutations. Actions reuse the row-menu definitions.

Validation: five catalog tests passed, including open/close without a dialog, no repeated status,
creation, validation and editing a new version. Panel typecheck passed. Actual ChecklistsTab with
synthetic data was captured and visually inspected at 390px and 1440px: one inline detail, no sheet,
no horizontal overflow, full item text and wrapping action buttons. Live publication checked separately.

Lean: Proceed. Keep the reader in context, remove duplicate metadata and avoid opening another surface
just to read checklist items. No additional employee steps or production records are introduced.

## Photo-rule help — 2026-09-11

Remove the repeated instruction paragraph from the photo-rule card; retain its existing localized
InfoTip. Desktop hover and mobile tap screenshots were captured and visually inspected with an
isolated component fixture. No data, validation or request behavior changes. Lean: proceed; show
explanations on demand without repeating them in the form. Formatting and diff checks passed.

## Organization terminology audit — 2026-09-11

Scope: match unit and zone wording to actual directory, schedule, operations, handover, incident,
report, photo-library and Telegram data. Units own employee assignments/schedules; zones reference
one unit and identify workplace responsibility. Source inspection and read-only production directory
inspection found no swapped unit/zone column data in those paths. Actual production examples:
"Цех Стаканов" is a unit; "Вторая стенка стаканы" is its zone. Stored names remain unchanged.

Canonical terms are recorded in CONTEXT.md and the engineering standards. All three catalogs now
use the shorter Zone field label, distinguish units from zones in directory tooltips/FAQ, and avoid
workshop/department synonyms where the generic unit is meant. The Zones heading previously reused
the zone-type/checklist hint; it now explains the zone itself. The zone-type field retains its own hint.
Existing frontend patterns are preserved; no schema, assignment, authorization or workflow changes.

Evidence: i18n build and 10 catalog tests, panel typecheck/targeted lint and 18 Telegram screen tests
passed. Desktop/mobile directory screenshots with the unit explanation were captured and visually
inspected. Live Telegram was not exercised for this label-only change. The owner has not yet supplied
a specific swapped-label example; do not claim an unobserved unit/zone data mapping bug was fixed.
Lean: proceed; explain the distinction on demand without repeated inline text or additional steps.

## Direct photo-rule editing — 2026-09-14

Owner request/spec: from Photo inspection, provide one-click editing of the displayed checklist's
rules. The edit shortcut must work with an empty rule list and historical checklist versions,
respect existing role permissions, protect unsaved reviews, and work on desktop/mobile. No changes
to analysis, saved reviews, checklist versions or backend authorization.

Design: the rules header links to `#/administration/checklists/<definitionId>` through the existing
navigation provider. Administration composes the public checklist-photo-rules feature in edit mode
on a focused, width-bounded page; it does not require searching or expanding the catalog. The existing
rules API resolves historical definition IDs to the family-wide current rules, whereas the catalog
only lists latest definitions. Server `canEdit` remains authoritative. Ordinary catalog expansion
still starts in view mode. Cross-section navigation preserves browser Back; unsaved photo edits use
the existing discard guard and in-flight save/analysis disables the shortcut. Existing localized
edit copy and IconButton are reused. No new dependencies or cross-feature imports.

Lean: Proceed. Removes closing the photo, finding Administration, searching the checklist and opening
its rule editor. No additional worker task or production record. Guardrails are draft protection,
correct family identity and unchanged server permissions. Verify the click-to-editor journey rather
than claim measured shop-floor time savings.

Verification: 19 focused tests passed (inspection navigation, rule editor, Administration and route
history), including cancelled/confirmed discard, an empty list, historical definition identity,
read-only server responses and initial no-op Save. Panel typecheck and changed-file ESLint passed.
Local synthetic preview screenshots captured and visually inspected at 1440×900 and 390×844:
header shortcut, direct editable form, focus on its heading and browser Back to the photo library.
Only unrelated wallet-extension console errors were observed. No production rule/review writes were
performed. CI/release and deployed smoke verification follow the direct-master push.
