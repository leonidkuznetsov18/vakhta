# Implementation Plan: Architecture standardization

**Change**: 009-architecture-standardization | **Date**: 2026-09-15 | **Spec**: [spec.md](spec.md)
**Baseline**: be779fc | **Checkout**: master | **Writer/index owner**: root Codex
**Evidence**: [Development workflow](../../docs/engineering/features/development-workflow.md)

## Summary and Technical Context

Deliver the audit in independently verified increments. First replace commodity file-format code,
make file reads explicitly owned and standardize shared dependency declarations. Keep business queries,
transactions, permissions and user workflow intact. Later pilots retain their conditional status.

Installed foundation: React 19/Compiler, Query 5, Zustand 5, Router 1, Nest 11/Fastify, Zod 4,
Drizzle/PostgreSQL, pnpm 10.9.0 and Node 22. Verified candidates: Papa Parse 5.7.0/types 5.5.2,
csv-stringify 6.8.3, ical-generator 11.1.1 (Node 22 or >=24), SheetJS official 0.20.3 tarball.
Use exact new dependency versions and preserve unrelated resolutions.

Compatibility finding: SheetJS 0.20.3 rejects the existing bonus worksheet name `history`, reserved
by Excel. Rename only that worksheet to `Bonus history`, verify its text/numeric cells by reading the
generated workbook, and document the downloadable-file change. This is required to keep export working.

## Constitution Check

Pass: owner authorized spec/plan/start; current master and one writer; no DB/domain policy change;
shared validation; FSD import slice; no application-owned prohibited hooks; three-language feedback;
explicit stale-read ownership; focused integration evidence and one export reviewer. Legacy shared
controls under components/app remain reused according to the incremental architecture rule.
Spec Kit extension hooks are absent. No extra model/contract documents are needed: existing contracts
and the audit provide them. No automatic branch or worktree helper is invoked.

## DESIGN: First-delivery ownership

### Employee import

- Move the coherent dialog into `features/employee-import/ui/import-dialog.tsx`; expose only the
  component from `features/employee-import/index.ts`. EmployeesTab imports that public API.
- `model/preview.ts` owns Papa Parse configuration, recognized header aliases, resource constants,
  employee-schema validation and prepared valid/invalid rows. This is employee-specific, not shared.
  Use `ImportEmployeesCommand.shape.items.element` and validate the final command. Dynamic typing is
  disabled. Trim through contract rules. Preserve optional header and ignored extra columns.
- `model/file-selection.ts` owns a per-dialog vanilla Zustand store with a discriminated read state
  and monotonic read identity. `select(file)` immediately discards old preview, reads asynchronously,
  catches failures and applies results only for the latest identity. `reset()` invalidates reads.
  File.text has no cancellation API; fencing owns stale results explicitly. No persisted file data.
- Query owns the import mutation (retry disabled). Pass an immutable validated command as its variables.
  Disable file changes/dismissal while saving and guard handlers, so completion cannot land in a new
  import session. Closing/unmount cleanup invalidates reads. Preserve API errors and valid preview for
  explicit retry. Successful completion clears preview and retains the created/skipped report.
- Reuse DataTable, Alert/Feedback, LoadingState, Dialog and localized text. Introduce localized read,
  malformed/oversize/row-limit/empty messages in all catalogs. Preserve table pagination and count.
  A bounded body scroll region keeps controls reachable on mobile and long reports readable.
  The opener passes its clicked element for close-focus restoration; do not duplicate that state
  in a separate boolean. A disconnected opener is not focused after navigating away.

### CSV

`apps/api/src/common/csv.ts` is a domain-independent serializer used by losses, bonus history and
closed-period bonus exports. Use `csv-stringify/sync`: semicolon, LF, eof:false, caller BOM policy,
quoted_match for CR/LF and escape_formulas:true. Numeric cast returns field options disabling formula
escaping only for actual numbers; numeric-looking strings remain untrusted text. Preserve metadata
comment fields in the closed-period export through the same adapter so rule labels cannot break
CSV cells, then serialize the whole header/data matrix. No row/transaction
or audit changes. Remove the three handwritten escaping paths.

### iCalendar

`apps/api/src/scheduling/calendar-feed.ts` serializes a prepared assignment projection; FeedService
retains query and token ownership. Use ical-generator with explicit product ID object, Gregorian
scale, PUBLISH, Vakhta name and 10,800-second TTL. Explicitly bind UID, stamp/lastModified, sequence,
start/end and summary/description. Leave timezone unset for UTC. Append the current final CRLF.
Library-added standard NAME is acceptable; event identity/timing semantics must not change.

### Dependencies

Use the exact official SheetJS CDN tarball URL with lockfile integrity. This preserves current Docker
manifest-only dependency stages; vendoring would additionally require image build-context changes.
Centralize already-resolved shared ranges in pnpm catalog and use catalog: references for shared
dependencies, aligning only manifest ranges where the resolved version is already identical. Do not
use catalogMode (not available in pnpm 10.9.0). No package-manager/framework upgrade.

## Project Structure and Allowed Files

First delivery owns `specs/009-architecture-standardization/`, the new `features/employee-import/`
slice, deletion of `admin/ImportDialog.tsx` and `lib/csv.ts`, EmployeesTab's import, removal of the
old import API wrapper in `src/api.ts`, the shared import limit in contracts/identity.ts, API common CSV
adapter/tests, scheduling calendar adapter/tests and FeedService, losses and bonus serializer call
sites/tests, relevant package manifests, pnpm-workspace.yaml/lockfile, four i18n catalog/type files,
the preview.tsx import fixture, existing admin/reports product docs and development-workflow engineering memory. Test-only browser
artifacts live in ignored test-results. No other session's files/index entries are owned.

Subsequent allowed files are selected in T018 onward before that increment. This plan is not authority
to sweep unrelated files or simultaneously rewrite all state/transport paths.

## Lean Review

Proceed: keep select → preview → import → report. Reject broken files early and prevent a stale preview
from causing rework. No new worker step, dashboard, production data or manual approval ceremony.
Measure correctness via known fixtures and retry/read ownership; do not claim productivity savings.

## IMPLEMENT: Ordered Delivery

1. Write/validate spec, plan and tasks; establish exact dependency APIs and retained contracts.
2. Add focused regression fixtures, replace CSV protocols/import state, verify UI behavior.
3. Replace feed serializer and update SheetJS source; exercise existing export/feed integration tests.
4. Consolidate dependency declarations, run affected checks and review the fixed export diff.
5. Record desktop/mobile evidence, update docs, deliver one coherent first batch to master.
6. Next: form and REST contract pilots → ownership/testing/architecture → correlation/reliability →
   conditional queue/calendar/localization decisions. Record exact pilot resources before implementation.

## VERIFY and HARDEN

- AC-001–003: `pnpm --filter admin-web exec vitest run src/features/employee-import/model`.
- AC-004: employee-import UI test; relevant AdminPage test; local preview in real browser at desktop
  and 390px, including valid/malformed/empty/result states, keyboard and bounded scrolling.
  File-read rejection is injected in model/UI tests; the real file chooser covers actual local reads.
- AC-005: `pnpm --filter api exec vitest run src/common/csv.test.ts src/reports/losses.service.test.ts
src/bonus/bonus.service.test.ts`; preserve numeric/formula text distinction in a real export assertion.
- AC-006–008: calendar adapter unit tests; existing scheduling service tests for saved-version XLSX,
  retrospective and personal feeds. PostgreSQL Testcontainers fixture and current Docker runtime.
- AC-009–010: frozen-lock install, API/admin typecheck and changed-file ESLint/Prettier; API build and
  panel build for dependency/bundle compatibility. Compare installed direct versions before/after.
- One read-only independent review of export compatibility; reuse valid test results. Check complete
  import journey with fixtures; never manufacture production employee records. Report blocked deployed
  checks honestly. Full CI/release/announcement remain separate evidence from local tests.

## REPORT and Documentation

Update tasks after actual verification, add concise decisions/evidence to development-workflow memory,
and update existing product documents for import limits/errors and CSV text behavior. First delivery
can satisfy SC-001 while SC-002 and later tasks remain pending. No intermediate docs-only pushes.

## Open Decisions and Research

First-delivery requirements resolved. Future pilot selection and conditional migration gates remain
explicit ordered work, not required user input for this increment. Verify APIs against pinned source.

- [Papa Parse configuration/errors](https://www.papaparse.com/docs)
- [csv-stringify formula escaping](https://csv.js.org/stringify/options/escape_formulas/)
- [csv-stringify field casting](https://csv.js.org/stringify/options/cast/)
- [ical-generator 11.1.1](https://github.com/sebbo2002/ical-generator/tree/v11.1.1/src)
- [SheetJS official distribution](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/)
- [Excel reserved worksheet names](https://support.microsoft.com/en-us/excel/rename-a-worksheet)
- [pnpm 10 catalogs](https://pnpm.io/10.x/catalogs)
