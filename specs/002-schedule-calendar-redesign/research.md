# Calendar rendering decision research

2026-09-13. Read-only research for #5; runtime spike still required. Prefer installed TanStack
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
