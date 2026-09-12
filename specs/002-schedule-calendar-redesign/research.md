# Calendar rendering decision research

2026-09-13. Research and verified rendering spike for #5. Prefer installed TanStack
Table/shadcn for a controlled resource calendar, with pagination until measurements justify Virtual.
This is a rendering boundary, not a second scheduling engine. No paid dependency is authorized.

| Candidate                                | Verified capability/license                                                                                                                                         | Tradeoff                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| FullCalendar current v7 docs             | React 17–19, day/week/list and custom ranges; timeline resource grouping and row/column virtualization (off by default); MIT standard, commercial resources Premium | Strongest ready-made resource engine but paid; Compiler/runtime and 390px parity still need proof                 |
| Schedule-X current v4                    | React adapter declares React 19; core MIT, resources/DnD/resize Premium; Temporal/zoned intervals                                                                   | Paid resource features; docs examples using effect cannot be copied under repository hook rule                    |
| react-big-calendar current master 1.20.0 | MIT, React 19 peers, Vite examples, resources/DnD                                                                                                                   | Resource × date columns rather than hierarchical roster rows; bounded row virtualization not established          |
| Installed Table 9.2.4 + shadcn           | Table v9 Compiler compatibility, MIT, current shared pagination and keyboard controls                                                                               | Build domain-independent presentation; Table is not a virtualizer; actual renderer performance remains to measure |

Official sources consulted by the scoped research agent:

- FullCalendar [React](https://fullcalendar.io/docs/react), [license](https://fullcalendar.io/license),
  [timeline](https://fullcalendar.io/docs/timeline-view), [virtualization](https://fullcalendar.io/docs/virtualization),
  [accessibility](https://fullcalendar.io/docs/accessibility), [touch](https://fullcalendar.io/docs/touch),
  [timezone](https://fullcalendar.io/docs/timeZone), [event groups](https://fullcalendar.io/docs/event-parsing).
- Schedule-X [React](https://schedule-x.dev/docs/frameworks/react), [premium](https://schedule-x.dev/premium),
  [v4 migrations](https://schedule-x.dev/docs/calendar/major-version-migrations),
  [resources](https://schedule-x.dev/docs/calendar/resource-scheduler),
  [configuration](https://schedule-x.dev/docs/calendar/configuration),
  [MIT license](https://github.com/schedule-x/schedule-x/blob/main/LICENSE).
- RBC [package/peers/license](https://github.com/bigcalendar/react-big-calendar/blob/master/package.json),
  [resource rendering](https://github.com/bigcalendar/react-big-calendar/blob/master/src/TimeGrid.js),
  [callbacks](https://github.com/bigcalendar/react-big-calendar/blob/master/src/Calendar.js).
- TanStack [Compiler](https://tanstack.com/table/latest/docs/framework/react/guide/react-compiler),
  [Virtual React](https://tanstack.com/virtual/latest/docs/framework/react/react-virtual).

View model: readonly resources, dates, items, localized text/status and stable item/segment identity.
Renderer emits select/create/move intents. Schedule adapters own intervals, eligibility, allowed
operations and draft mutations. Linked-segment move semantics remain domain-owned for every candidate.
Controlled rendering needs no forbidden application lifecycle hooks or class wrapper.

Compare actual fixture screenshots with the seven canonical Deputy/When I Work references; they
are design references, not implementation or performance evidence. Prototype advanced segments,
conflicts and cross-month dates must be marked as fixture-only until backend owners deliver them.

## Prototype completion evidence — 2026-09-13

Selected installed shadcn/Table renderer; the public API remains prepared readonly resources/dates/
items/parts and named select/create intents. Local form/draft/permissions and time rules remain
caller-owned. Standard context editing is covered by the workspace regression suite; no new runtime
dependency or application lifecycle hook was introduced. Prototype-only surfaces are explicitly marked.

- Fixture: 500 workers, 20 populated zones plus one empty, 7,000 entries, September/October boundary.
  Zone view shows three cards and `22 more`, with a paginated complete list. Person view reuses IDs.
- Custom interval renders 10:15–18:45 and 8.5 localized hours; night displays the next-day date.
  The Sheet switches between whole-shift and segment inspection. Segment editing/persistence is #15,
  not a claimed capability of this rendering proof.
- Keyboard Enter opens the Sheet/date picker, arrow and Enter pick a date, and Enter invokes Move.
  Occupied 29 September rejects without changing the source; free 27 September moves the same ID
  and linked parts, removes the conflict, and disables unchanged Move. Production standard edit
  context/untouched metadata is covered by schedule-workspace.test.tsx.
- Local Chromium development sample, 1280×720: people-to-zones change had 125.619 ms total task CPU,
  84.423 ms script and 9.999 ms layout; browser Nodes metric rose from 2,285 to 5,926. One immediate
  scroll-command interval added 2.676 ms task CPU (not an end-to-end frame-latency benchmark).
  These single diagnostic samples are not production percentiles or participant acceptance.
- Captured and inspected 1280×720 and 390×720 fixtures. Mobile document width equals 390px; full
  names wrap and cards remain bounded. [Screenshots](../../docs/engineering/evidence/schedule-ui-2026-09-13/).
- TypeScript/React Compiler build and affected ESLint passed. Five date-field regressions passed,
  including future-year navigation needed by the keyboard demo. Existing resource/projection/
  workspace checks are reused from the prior UI increment; no backend policy is inferred.
