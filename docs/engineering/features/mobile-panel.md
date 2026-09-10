# Mobile panel usability

## Outcome and audit, 2026-09-10

Owner request: make the existing panel comfortable on phones while preserving behavior and desktop
styles. Reuse shadcn primitives and the existing mobile DataTable cards; do not replace the panel or
change attendance, permissions, mutations or query ownership. New navigation gesture code is an FSD
feature, with a public entry point and isolated Zustand gesture state. Existing legacy UI imports
remain an incremental boundary exception; no unrelated migration or forbidden hooks were added.

| Surface inspected                                                                               | Finding                                                                                                 | Change                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App navigation                                                                                  | Small trigger, no swipe, menu remained over the selected page                                           | Persistent mobile header; swipe right on noninteractive header space to open, left on free sidebar space to close; visible close button; selecting a menu action closes the mobile menu |
| Shared form controls                                                                            | 28–32 px controls; native select/search text too small                                                  | Phone controls at least 40 px, input/select/search text 16 px; textarea at least 112 px with bounded height and scrolling; sidebar entries at least 44 px                               |
| DataTable consumers: incidents, knowledge, handover, operations, requests, reports, directories | Compact card labels and values; rich headers disappeared in cards                                       | 16 px values, 14 px labels, constrained two-column definitions, larger spacing; rich header fallback; explicit handover deadline label                                                  |
| Expanded records                                                                                | Desktop-size prose on narrow screens                                                                    | 16 px mobile full text, existing bounded wrapping/scrolling and read-only finished records retained                                                                                     |
| Calendar, tabs, popovers, dialogs                                                               | Larger touch controls risk overflowing the viewport                                                     | 40 px calendar cells; taller, horizontally scrollable tab strips; mobile popover height follows available space; dialogs are bounded by dynamic viewport height                         |
| Schedule matrix                                                                                 | Dense day selects; sticky totals and long employee names consume the phone viewport; hover-only actions | 40 px/16 px day selectors, wrapped 112 px employee name, totals stick only on desktop, row actions visible on touch                                                                     |
| Async surfaces                                                                                  | Prior delivery already distinguishes pending/refresh/error/offline/saving                               | Preserve Query feedback and retry; no additional fetching or production mutation                                                                                                        |

Opening swipes are deliberately limited to the header and ignore controls; closing swipes use free
sidebar space. Form interaction, vertical scrolling, pinch zoom, the browser's edge navigation and
horizontal schedule scrolling must remain available. A gesture requires 64 px of primarily horizontal
movement within 700 ms; cancellations, secondary pointers and vertical drags do not navigate. The
existing menu button, Escape and shadcn focus handling remain primary accessible alternatives.

## Evidence and limits

- Production v0.71.1 mobile handover inspected before changes: small controls and missing card deadline
  label confirmed. No real worker records or messages were changed.
- Local real-component fixture uses clearly marked synthetic data. Chrome touch events opened and
  closed the sidebar; selecting a menu entry closed it. No DOM patch simulated these outcomes.
- Screenshots captured and visually inspected at 390×844 and 1440×1000: shell/sidebar, form controls,
  expanded incident cards/prose, calendar and schedule. Mobile document width equals viewport width
  (390 px); schedule alone scrolls horizontally. A clipped calendar found during QA was fixed with
  available-height scrolling. Desktop fields remain 32 px/14 px; mobile input/select 40 px/16 px,
  textarea 112 px. Existing full-text scrolling and desktop table presentation remain intact.
- Focused gesture/DataTable/handover regressions: 12 tests passed; panel typecheck and changed-code
  lint passed. Existing CI is the full integration gate, not duplicated locally.
- These are browser-emulation results, not physical iOS/Android or soft-keyboard evidence. No claim of
  every page/device permutation being tested. Phone keyboard, landscape and real shop-floor glove use
  remain useful follow-up observations. The scheduling workflow itself has not been redesigned.

Sources consulted: [shadcn Sidebar](https://ui.shadcn.com/docs/components/radix/sidebar),
[MDN touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action).
No existing project gesture utility exists; a small pointer recognizer adds no dependency and retains
shadcn's overlay/focus behavior instead of replacing it with a second drawer implementation.

## Lean recommendation

Proceed. Shared touch targets and readable records reduce precision tapping and repeated menu closing.
Gestures add no mandatory step; buttons remain visible. Preserve production decisions and observe
mis-taps, navigation retries and time to find/complete a record on actual phones before claiming
measured time savings. Do not turn the dense month matrix into a different planning workflow here.

### Follow-up: sidebar alignment

The owner reported a raised incident counter on the phone. The original shadcn badge/action offsets
were sized for 32 px rows, while mobile menu entries now have 44 px minimum height. Mobile badges
and trailing actions are vertically centered; button text reserves space for badges to avoid overlap.
Desktop offsets remain unchanged. Dark-theme screenshots at 390×844 and 1440×1000 were inspected;
DOM measurements confirmed identical row/indicator centers for single/double-digit counters and actions.
This presentation-only correction needs no new behavior tests. Diff/format and the existing CI apply.
