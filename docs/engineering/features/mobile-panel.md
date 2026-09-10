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

The initial opening swipe was limited to free header space; the full-height edge revision below
supersedes that limitation. Closing swipes use free sidebar space. Form interaction, vertical scrolling, pinch zoom, the browser's edge navigation and
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

## 2026-09-10 — Card and list alignment

The shared mobile card header now centers the selection checkbox, primary value and action menu on
one axis, reserving the existing 40px control height. Definition labels and values share a 24px line
height so short badges and multiline values start consistently. Inline information icons use middle
alignment. Checklist editor item numbers center against the first input row at 40px mobile / 32px
desktop instead of a fixed top padding. Sidebar counter/action centering is included in the preceding
patch. Selection, menus, editing and keyboard behavior remain unchanged.

Verification: inspected 390px/1440px screenshots of actual shared controls with synthetic records.
Mobile checkbox/title/menu centers match exactly; desktop number/input/action centers match. No page
horizontal overflow. Production verification follows publication. Lean: Proceed;
consistent alignment reduces visual searching without adding controls or changing worker tasks.

## 2026-09-10 — Full-height 60px opening gesture

Before-change reproduction on production v0.73.2 in Chrome touch emulation (390×844): rightward drags
starting at x=30, y=100/420/780 did not open navigation; free header space at x=110, y=28 did.
The owner requested a 60px region across the full viewport height.

A native touch listener attached through a React 19 callback ref now recognizes opening gestures
starting at x=0..60. It does not overlay controls. The first intentional horizontal movement is claimed
through a non-passive touchmove listener; taps, long presses, vertical movement, multi-touch and canceled
scrolls remain native. An established vertical scroll cannot later become a navigation gesture.
The existing pure recognizer determines completion. Listener cleanup occurs on unmount, desktop
breakpoint or opening the sidebar. Existing header/closing pointer gestures and shadcn focus handling
remain. No new forbidden hooks, dependencies or production mutations.

Verification: focused gesture tests, panel typecheck and feature lint. Actual shared components in
Chrome touch emulation opened at y=28/420/780, including x=60 after scrolling. A swipe beginning on a
button opened navigation without clicking it; a tap clicked once. A swipe at x=90 did not open it.
Vertical scrolling at x=30 and horizontal table scrolling outside the edge worked; a leftward sidebar
swipe closed it. Mobile/desktop screenshots were captured and inspected. Real iPhone Safari hardware
is not connected here; browser-native edge/back gestures remain subject to the browser's own handling.

Sources: [React callback-ref cleanup](https://react.dev/reference/react-dom/components/common#ref-callback),
[Touch events](https://developer.mozilla.org/en-US/docs/Web/API/Element/touchmove_event).
Lean: Proceed. A larger consistent touch target removes precision effort while preserving ordinary
control taps and scrolling. No extra worker actions or data entry.

## 2026-09-10 — Compact mobile lightbox navigation

The owner reported gallery thumbnails stacking between previous/next controls on phones. The shared
Lightbox now omits the thumbnail strip below the existing 768px breakpoint rather than hiding mounted
images with CSS. Previous/next controls share the available width and allow label wrapping. The active
photo, counter, keyboard arrows, close controls and desktop thumbnails retain their behavior.

Lean: Simplify. Removing the mobile strip keeps navigation independent of the photo count and avoids
extra scrolling without adding a worker action or losing access to evidence. Focused regressions cover
a 100-photo mobile gallery, wraparound/keyboard navigation and retained desktop thumbnail selection.
Both focused tests passed. Screenshots at 320px, 390px and 1440px were captured and inspected using
synthetic photos: mobile navigation fits without page overflow, Enter advances the photo, and desktop
thumbnails remain visible. Changed-file lint passed; physical-device coverage is not claimed.
