# Feature Specification: Architecture standardization

**Change**: 009-architecture-standardization | **Created**: 2026-09-15 | **Status**: Accepted
**Baseline**: be779fc | **Checkout**: master
**Authority**: Owner requested a specification, plan and start of implementation after the audit.
**Product documents**: Existing admin, reports, bonus and schedule documents.
**Engineering memory**: [Development workflow](../../docs/engineering/features/development-workflow.md)

## RECON: Current Behavior

The [audit](../../docs/audits/2026-09-15/architecture-standardization.md) identifies fourteen opportunities.
This spec retains their adoption sequence and defines the first independently deliverable increment.
Completing that increment does not complete the program.

HR uses `apps/admin-web/src/admin/ImportDialog.tsx`. The handwritten `lib/csv.ts` parser guesses
separators without respecting quoted punctuation, accepts unfinished quotes, duplicates employee
constraints and can mistake header-like data for headers. A late file read can overwrite a newer
preview. Reading/errors have no explicit state. The API accepts one to 1,000 employees per request.
Losses and bonus exports manually serialize CSV. Personal calendar feeds manually escape and fold
iCalendar. Existing integration tests protect snapshot, permission and feed-token behavior. SheetJS
already handles XLSX, but its npm distribution is outdated; shared dependency ranges are repeated.

## SPEC: Outcome and Boundaries

Adopt maintained commodity implementations and explicit ownership incrementally, preserving the
current frameworks, pure domain rules, transactions and recorded evidence.

**First delivery**: employee CSV import, all current CSV serializers, calendar-feed serialization,
supported XLSX dependency sourcing and shared dependency declarations. No DB migration, grant,
bonus calculation, attendance, publication or feed-token change belongs to this increment.

**Following deliveries**: form and REST-contract pilots; typed state/persistence and architecture
checks; network/browser test standards; correlation and reliability contracts; conditional library
evaluations. Each later delivery refines its exact files and tests here before coding. Conditional
recommendations are evaluation authority, not permission to weaken guarantees or buy commercial tools.

Assumptions: imports remain UTF-8 CSV with personnel number and full name as the first two columns,
optional recognized headers, comma/semicolon separation and ignored extra columns. Preserve invalid-row
preview and import of the valid subset. Bound browser resource use at 2 MiB and 1,000 data records,
comfortably covering valid two-column records under existing length limits. Oversize inputs fail
visibly, never truncate. File replacement and close invalidate pending reads.

## User Scenarios and Testing

### US1: HR previews the selected file (P1)

- **AC-001**: BOM, LF/CRLF/CR, both delimiters, quoted punctuation, escaped quotes and multiline fields
  parse correctly. `0001` stays `0001`; shared employee rules normalize/validate values. Only recognized
  headers are omitted; header-like employee data is retained.
- **AC-002**: Malformed quoting, read errors, >2 MiB or >1,000 records show localized errors and disable
  import. Empty/header-only files have an explicit empty state. Invalid employee rows stay visible
  and are excluded from submission; parser errors are never hidden.
- **AC-003**: Late success/failure for file A cannot replace file B. Close/reopen cannot revive old
  reads. Reading clears stale rows and disables submission. Failed imports retain the active preview.
- **AC-004**: Submit sends only contract-valid items once per pending mutation. Reading/saving/errors
  are accessible, desktop/mobile fit, and the created/skipped report and existing permissions remain.

### US2: Report files preserve data (P1)

- **AC-005**: CSV retains column order, localized headers, semicolon, LF, current BOM policy, no final
  newline, filenames/content types and snapshot/audit behavior. Text round-trips quotes, Unicode and
  CR/LF. Formula-like text is neutralized; numeric cells, including negatives, receive no apostrophe.
- **AC-006**: XLSX retains cell types, metadata, permission redaction, counts, saved revision
  and numeric values with the supported upstream dependency. Rename the bonus `history` sheet to
  `Bonus history`: the existing name is reserved by Excel and rejected by the supported dependency.
  Other sheets retain their names. No new spreadsheet features are added.

### US3: Calendar subscriptions remain stable (P1)

- **AC-007**: Preserve method/name/product ID, refresh metadata, event UID, sequence, timestamps,
  UTC start/end, title/description and CRLF. Reserved characters and Unicode fold correctly; lines
  are valid UTF-8 and at most 75 octets. Empty feeds remain valid calendars.
- **AC-008**: Only eligible published assignments for that employee appear. Revisions retain identity;
  draft hiding, token issuance/rotation/revocation and invalid-token behavior remain unchanged.

### US4: Engineers use reproducible dependencies (P2)

- **AC-009**: Shared agreed ranges are declared once and consumed consistently; the pinned package
  manager reproduces the lockfile. Resolved versions stay unchanged except the named protocol libraries,
  supported SheetJS and separately justified compatibility adjustments.
- **AC-010**: Remove superseded CSV/iCalendar implementations and import module. New code has deliberate
  ownership/public APIs; existing domain transactions and policy tests remain authoritative.

### US5: Form and HTTP contract pilots (P2, subsequent delivery)

- **AC-011**: A representative form retains edit/revert/reset/error/keyboard behavior; a REST resource
  retains validation/error/auth/pagination/cancellation through reproducible client generation.
  Malformed responses fail visibly. Choose exact pilot resources/fixtures during that delivery's recon.

### US6: Enforced ownership and real journeys (P2, subsequent delivery)

- **AC-012**: Touched state has one owner and tested recovery; scoped checks reject invalid imports;
  reusable network fixtures and browser tests cover success/failure/mobile/keyboard. Legacy exceptions
  are explicit. New standards replace old implementations rather than running alongside them forever.

### US7: Operational guarantees and conditional decisions (P2, subsequent delivery)

- **AC-013**: Redacted correlation survives processes. Specify and fault-test inbox/outbox/idempotency
  before changing jobs. A pg-boss decision records proven guarantees and remaining custom machinery;
  no end-to-end exactly-once delivery claim is made.
- **AC-014**: Calendar interaction, localization, virtualization and every other audit item has a
  traceable adopt/defer/retain outcome. Distinguish implemented, evaluated and pending work.

### Edge Cases

Header-only/blank input; extra columns; leading zeros; malformed quotes; invalid rows; resource limits;
overlapping reads; dismissed dialog; failed submit; formula prefixes versus numbers; Unicode at fold
boundaries; empty feed; revised subscriptions; revoked tokens; unchanged monetary/snapshot rules.

## Requirements

- **FR-001**: Use maintained protocol implementations through owned adapters (AC-001,005,007,010).
- **FR-002**: Shared schemas and explicit async ownership govern import (AC-001–004).
- **FR-003**: Preserve export/subscription contracts and evidence (AC-005–008).
- **FR-004**: Keep dependencies reproducible (AC-009).
- **FR-005**: Introduce remaining standards through compatible pilots (AC-011–014).
- **FR-006**: Record local, browser, CI and deployed evidence separately per increment.

### Key Entities

Reuse ImportEmployeesCommand/Result, existing report matrices, assignments and feed tokens. Import
read state distinguishes idle, reading, ready and error. Query owns mutation state. No DB entities.

## Success Criteria

- **SC-001**: First delivery satisfies AC-001–010 with protocol/behavior evidence and no changes to
  recorded business facts. Users recover by choosing another file or explicitly retrying.
- **SC-002**: Subsequent increments satisfy AC-011–014 and retire superseded implementations. No first
  increment is reported as completion of the entire audit.

## Verification Scope

Parser, ownership and UI regression tests; protocol fixtures; existing PostgreSQL export/feed tests;
affected type/lint/build because dependencies change; one independent export compatibility review;
desktop/mobile import screenshots. No production employee creation, Telegram message or QR scan.
Full CI remains the integration gate. Exact commands and evidence are in the plan and engineering memory.
