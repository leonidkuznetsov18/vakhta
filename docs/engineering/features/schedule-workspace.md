# Schedule workspace

Status: implemented and locally verified, 2026-09-12. Baseline: `0f41794`.
Authority: owner requests full implementation of the attached Schedule UX audit.

## RECON

The employee/month grid exposes versions before tasks, cannot show zone coverage, collapses
assignment zones and drops kind/position/team metadata. Rotation overwrites the remaining month
without an undo path. Mobile exposes roughly one date after several stacked configuration panels.
Product source: [Schedule](../../features/05-schedule.md).

## SPEC

- Default to zone schedules and the current published version; expose a distinct employee matrix
  and change history. Current publication and a prepared draft must remain distinguishable.
- Show day/night assigned people, assignments, distinct workers and planned person-hours for the
  selected period. Counts do not imply required staffing, actual attendance or productivity.
- Desktop supports week/month overview; mobile defaults to a day with date navigation and zone
  details underneath their parent. All dates remain in the selected version month.
- Add assignments from zone/date context; edit zone/date/template for one assignment. Batch creation
  selects people, range and template/rotation, with an impact preview before applying replacements.
- Preserve every unchanged assignment field; maintain one employee/date entry across zones. Submit
  the entire month, never the filtered table. Exclude cancelled/replaced history from new payloads.
- Undo/redo local edits and discard to saved state; retain unsaved drafts across navigation/reload.
- Explicit editing and publication: show added/removed/changed assignments, affected workers and
  notification consequences. Existing create/save/submit/revise/return/publish/delete APIs remain.
- Enforce existing scoped editor/approver roles in controls and handlers. Do not grant masters new
  write rights or change workflow rules. Preserve server transactions and notification delivery.
- Keep invalid input, failed writes and stale edits recoverable; block stale baseline overwrites.
  Background responses cannot select a different workspace or clear subsequent edits.
- Read-only history uses text; retain inactive employee/template labels where available. Correct
  stale help rather than claiming absent rest/hour/cross-unit checks or acknowledgements UI.
- Reuse shadcn controls, shared dates/tables/row details/feedback, all three locale catalogs, keyboard
  navigation and reachable mobile actions. No new effect/ref/memo/callback hooks.

## DESIGN

Coherent FSD slice: `features/schedule-management/{api,model,ui}` with deliberate public exports
for the workspace and overview preset action. App composes the public workspace. Retain the established
React/Vite architecture and migrate the old schedule slice; no empty layers or unrelated router work.

TanStack Query owns validated API results and cancellation. The persisted editor store owns local
drafts, undo history and their saved baselines. Pure model functions own lossless serialization,
batch application, diff summaries, scope capabilities and period calculations. UI connects named
actions and renders prepared data. Navigation supplies existing scoped grants from `/me`.

## Boundaries and verification plan

No staffing norms, multiple assignments per employee/day, prior-month copy semantics, schedule rule
engine, notifications rewrite or production employee actions. The existing employee list is capped
at 200; handle missing identity lookups without treating a failed supplemental request as an empty
schedule. Existing version-list cap remains a server limitation.

Focused tests: metadata round-trip, cross-zone moves, full-month saves from filtered views, rotation
range/overwrite/undo, counts, persisted recovery, scoped controls, publication payloads, stale response
ownership and invalid/error states. Run affected type/lint/build and one independent fixed-diff review
because assignments and publication are involved. Visually inspect desktop/mobile, long data, empty,
read-only and edit flows using synthetic data. Do not repeat unrelated kiosk/bot production journeys.

## Lean review

Simplify: the master starts at a zone/date, sees assigned people and changes the relevant assignment.
Batch preview and undo reduce rework; technical versions move into history. Preserve published truth,
access, recorded history and notification consequences. Validate improvement with real masters on
finding tomorrow's night team, adding a worker, moving one assignment and reviewing a publication;
measure time, mistakes and explanations needed. No measured productivity claim is made.

## Verification and remaining work

- Focused Schedule suite: 26 tests pass (9 existing grid regressions, 8 planning/store cases,
  9 workspace interactions). Coverage includes metadata and per-date zones, full-month writes,
  fill/replace/undo, DST hours, scoped permissions, explicit overview presets, publication reasons,
  stale drafts and read-only/legacy recovery. I18n catalog parity: 10 tests pass.
- Panel TypeScript, affected-file ESLint and production Vite build pass. Vite retains dependency
  annotation and large-bundle warnings; bundle splitting is outside this change. The initial build
  invocation from the repository root failed to resolve the app-local React compiler; the normal
  app-directory invocation succeeds without dependency changes.
- Captured and visually inspected local preview at 1440x900 and 390x844: zone overview, day/night
  details, individual editor, monthly worker matrix, batch selection, impact preview and publication.
  Document width equals viewport (1440 and 390). The worker matrix has one tabbable date cell;
  its horizontal scrolling remains an explicit secondary monthly-view behavior.
- In synthetic preview, added an assignment, reviewed and applied it, published a new version and
  observed the updated counts. Separately moved one assignment between zones and undid it.
  Real employee assignments, notification delivery, physical touch and screen readers were not tested.
- Independent read-only review found legacy metadata loss, an IN_REVIEW local/server mismatch and
  DST totals. These were corrected and regression-tested; targeted re-review confirmed all findings
  resolved, including zero-diff legacy recovery. Backend transactions and permissions are unchanged.
- Lean completion: the normal path starts with a zone/date, keeps selection separate from impact
  review, and provides local reversal. No measured productivity claim; validate task times with masters.

Master write permissions and staffing requirements remain unchanged. The existing employee and
version-list caps remain a server limitation; unknown staffing requirements are never labelled as
shortages. Production deployment/CI evidence is reported with the delivery, not inferred from preview.

## Selected zone/day visibility — 2026-09-12

- Replace the low-contrast secondary fill with the shared primary button tokens and a separated
  selection outline. Day/night icons inherit the selected foreground for light/dark contrast.
  `aria-pressed` exposes the same existing zone/date selection; changing or closing the row removes
  the previous selected state. No scheduling rules or mutation behavior changed.
- Lean: make the currently inspected team obvious without another click or legend.
- Verified and visually inspected preview screenshots at 1440×900 in light and dark themes and
  390×844 on mobile. Switching dates left exactly one pressed day. Focused ESLint, formatting and
  diff checks passed; no new tests or full build for this presentation-only correction.
