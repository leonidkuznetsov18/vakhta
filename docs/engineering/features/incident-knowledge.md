# Incident diagnosis and knowledge history

Owner-approved behavior, 2026-09-10:

- A BREAKDOWN report requires a photo; its caption is optional. Other reasons retain their configured
  requirements. The bot blocks skip/stale stop callbacks and the service validates both Telegram IDs.
- Masters record `rootCause` and `resolution`, each trimmed and limited to 2,000 characters. Drafts
  can be saved independently of a status change. RESOLVED requires at least three characters in each
  field; saved drafts satisfy this requirement. Resolved/closed notes cannot be cleared through edits
  or closing. Unchanged historical resolved records may still close without invented diagnoses.
- Migration 0029 adds nullable columns to incidents and status history. Existing worker reports and
  comments remain readable. Updates and transitions append note snapshots, domain events and audits
  inside the incident row-lock transaction. Old text is not guessed into the new fields.
- The knowledge page uses the same authenticated list/detail/media endpoints and Query cache. It
  includes all statuses, text search, photos and history; it does not train or call an LLM.
- Day/month/year filters use inclusive/exclusive opened-at boundaries in the selected site's timezone
  (Europe/Kyiv when viewing all sites). All time is the default so old open incidents remain visible.
  Statistics use the same calendar range; the existing stats aggregation remains independent of the
  open/all queue toggle. All-time statistics cover records since Unix epoch.

## Implementation and reuse

Frontend slice: `features/incident-management` exposes the workspace; the knowledge page is a thin
page wrapper. Query owns server records and invalidation; Zustand owns drafts and filters.
Sign-out clears transient notes/photos. No forbidden React hooks were added. Reuse existing shadcn
fields, calendar, DataTable, photo viewer and hash navigation rather than introducing parallel table or
routing infrastructure. Legacy shared primitives and client-side table pagination remain boundary debt;
server pagination/search should be considered when measured incident volume requires it.

## Lean recommendation — Proceed

One photo and an optional caption give the master evidence without a separate typing step for the
worker. Two short fields capture the diagnosis and successful action once, next to the original photo.
Searchable previous solutions can reduce repeated diagnosis. Do not add AI, mandatory categorization
or worker paperwork in this change. Observe whether masters can locate a similar case and whether the
saved solution is useful; no shop-floor time-saving claim has been measured.

## Verification

Focused PostgreSQL tests cover required photos, note validation/rollback, draft save/clear, immutable
note snapshots, protected resolved notes and inclusive/exclusive dates. Synthetic Telegram updates
cover blocked skip/stop plus photos with/without captions. Component tests cover resolution validation,
knowledge display, calendar query wiring and existing photo/duplicate/SSE behavior. Pure calendar tests
cover DST and month/year boundaries. Affected type/lint checks and an independent transaction/migration
review are required; CI is the full integration gate. Production rollout evidence is reported separately.

Known existing system limitations: broad role/scope enforcement and durable Telegram admission are
separate tracked reliability work. This feature does not claim to resolve those boundaries.

## Completed records — owner clarification

Resolved, closed, rejected and duplicate incidents are read-only in the panel; only open incident
states show decision fields/actions. Remove bulk closing/reopening controls from this view. Terminal
shift details hide the action/message form and use the full detail width. Completed checklist reports
retain their existing read-only rule and show recorded master decisions as text. Filters, search,
photo viewing and history remain available. This is presentation behavior; audited backend correction
and lifecycle APIs retain their existing permissions and semantics.

## Calendar and detail readability

Both incident pages use CalendarPeriodField: an always-visible calendar trigger matching Schedule,
day/month/year tabs inside the same popover, and an all-time reset. All-time remains the default.
RowDetail provides a common bounded reading surface for every expanded table row and mobile card.
Incident cause, solution and legacy text use DetailText (readable line length, preserved line breaks,
long-word wrapping, keyboard-scrollable height limit). History metadata and prose occupy separate lines.
Operations, handovers, requests, employees and users reuse the same detail boundary; forms and photos
have bounded widths and narrow layouts stack vertically. Business permissions and mutations are unchanged.
Lean: proceed; consistent controls and grouping reduce searching and re-reading without extra worker input.
Visual acceptance requires actual desktop/mobile screenshots; no production records are created for QA.
