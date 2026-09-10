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
