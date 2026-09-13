# Employee profile

Updated: 2026-09-13. Epic #65, children #66–72. Specification: `specs/005-employee-profile/`.
Implementation is complete locally; delivery and moderated acceptance are tracked below.

## Decisions and architecture

- Employee reads and writes use each applicable role's current assignment scope. Unassigned employees
  need enterprise scope. Restricted fields are omitted server-side; mixed grants cannot borrow a
  privileged role from another unit. The shared organization snapshot exposes designated employee
  identifiers/name/status only to ADMIN grants covering that unit; profiles use their own scoped read. Birth year is limited to ADMIN/HR/ACCOUNTANT.
- ADMIN/HR write compensation; ACCOUNTANT reads it. Other roles receive no compensation or marital
  status. Restricted audit entries contain field names/entry identifiers, never their values.
- Migration 0050 follows the delivered 0049 birth-date migration. Compensation is append-only with
  correction/date/employee constraints, concurrent-write serialization and explicit scale checks.
  Numeric columns are unconstrained numeric plus checks so PostgreSQL rejects excess precision
  rather than silently rounding it. Compensation is reference data, not payroll or bonus input.
- Nest modules and pure domain functions retain their boundaries. The new frontend feature has a
  deliberate public API; AdminPage composes the existing assignment editor through a render slot.
  Query owns server state; forms own drafts. No effect-based state synchronization was introduced.
- Avatar writes normalize JPEG/PNG/WebP to private 512 px WebP. Employee versions prevent stale swaps.
  Durable staged media expires after failed linking; a per-object retrying cleanup checks live
  references under a lock. An uncertain commit never triggers immediate object deletion.
- One explicit master per unit; designation grants no panel permissions. Zone derives from the
  current open shift or next published assignment; schedule totals exclude drafts.
- Owner refinement: row click opens a read-only Sheet, names and its deep-link button open the
  profile. The disclosure chevron and old editable subrow are removed. One profile Edit action
  exposes personal fields, avatar and assignment controls. Dated compensation retains add/correct.
  Unchanged and pending forms are disabled; conflicts retain drafts and require explicit acknowledgement.

## Open decision outcomes

- OD-1: retain `manager_employee_id` as the assignment's historical master snapshot. New assignments
  capture the designated master; historical nulls remain unknown. Do not backfill invented history.
- OD-2: bonus nominations still use existing e-mail matching. Changing bonus accountability needs a
  separate explicit decision and is outside this feature.
- OD-3: resolved by the owner's read-only Sheet / dedicated editable profile decision above.

## Verification evidence

- Domain: 11 tests passed, including order-independent effective compensation and zone precedence.
- PostgreSQL migration invariants: 3 tests passed (precision, append-only and correction constraints).
- Scope integration: 8 tests passed. Profile integration: 16 tests passed, including role serialization,
  conflicts, compensation concurrency, master states, draft exclusion, avatar failure/recovery and
  history-preserving deletion. CORS: 2 tests passed, including cross-origin If-Match uploads.
  HTTP avatar delivery: 1 regression test passed for an explicit 302 redirect (Nest otherwise kept 200).
- Independent access/privacy review approved the final boundary changes, cleanup recovery and the
  follow-up organization-snapshot privacy restriction.
- API and panel typechecks and builds passed; scoped ESLint passed. i18n: 10 tests; contracts: 11 tests passed. Panel suite: 59 files / 372 tests passed, including 5 profile
  journeys (read-only Sheet, unified edit/no-op, pending lock, conflict draft, restricted/terminated).
- Browser: real Nest controllers/services with PostgreSQL and synthetic records at localhost:5185.
  Contact save, compensation append/correction with preserved original, row Sheet/deep link, and
  master designation removing a unit from the missing-master filter were exercised successfully.
- Desktop (1440) and mobile (390) screenshots were captured and visually inspected in
  `docs/engineering/evidence/employee-profile-2026-09-13/`. The mobile Sheet width issue found during
  inspection was fixed. These are synthetic local evidence, not production records.
- Browser file selection is blocked by the Chrome extension's file-URL permission; server avatar
  normalization, validation, failure and recovery are covered by integration tests. A synthetic file
  uploaded through the API was displayed correctly in the browser after fixing the redirect status;
  browser removal restored initials. The file chooser itself remains blocked.
- SC-001 moderated check is requested from the owner and pending. SC-004 list-to-profile navigation
  exposes both the master and next published shifts; operator confirmation is pending with SC-001.
- CI/release/announcement and deployed read-only verification: pending delivery.

## Lean completion review

Recommendation: **Simplify**, implemented. Removed the duplicate expanded editor; kept a quick
read-only inspection surface and a single addressable editing destination. Zone is derived instead
of separately maintained; schedule is a short summary with a focused link. Explicit master warnings
avoid assuming designation means panel access. Measure missing-master units and moderated attribute
findability; do not claim adoption from automated tests alone.
