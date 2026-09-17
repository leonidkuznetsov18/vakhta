# Photo viewer zoom

## Scope and decision

The existing shared Lightbox owns incident, knowledge and handover photo viewing. ZoomablePhoto
adds a bounded viewport and existing shadcn buttons with trilingual accessible labels. Each image
has independent state; its URL key resets that state when gallery selection changes.

Repository reconnaissance found no existing zoom engine. Reuse
[Panzoom 4.6.2](https://github.com/timmywil/panzoom) for pointer/pinch gestures, constraints and
transforms instead of implementing gesture math. A React 19 callback ref binds and cleans up the
instance; Zustand exposes scale to the controls. No effects/ref hooks or image persistence changes.
The keyboard handler consumes arrows only while zoomed, preserving gallery navigation otherwise.
Ctrl/Meta wheel and keyboard combinations remain available to browser accessibility zoom.

Vitest inlines Panzoom so Vite resolves its browser ESM entry; the package main points to UMD.
Tests exercise the actual library, not a zoom mock.

## Verification

- Focused Lightbox tests: mobile 100-photo navigation without thumbnails, desktop thumbnails,
  zoom limits, reset, keyboard navigation protection and resetting on the next photo.
- Panel typecheck and changed-file ESLint.
- Captured and inspected the actual shared component with synthetic images at 390x844 and
  1440x900 in Chrome. Buttons, image clipping, keyboard pan and gallery reset worked; no mobile
  horizontal overflow. Physical phone pinch testing is not available in this environment.
- The separately developed photo-inspection annotation editor must compose compatible zoom
  controls in its own interaction mode; this patch does not alter that concurrent feature.

Lean: Proceed. Inspecting equipment details in the same viewer reduces navigation and worker
rework. Stored evidence, permissions and resolution workflows remain unchanged.

## 2026-09-17 — Stable loading and navigation (accepted)

RECON: Production handover `f2f0399f-4c5a-40d5-9c68-083986a0e981` reproduced a disappearing
photo frame and a loader above the image during navigation. The dialog is keyed by photo identity,
links are discarded immediately, and metadata/link/image stages render different layouts. The
mobile inspection viewport caps height and consequently shrinks portrait images.

SPEC: Keep the dialog, photo frame and navigation stable through initial loading, switching,
retry and background refresh. Retain the current photo until its replacement is ready; rapid
selection must show the latest requested photo. Display original proportions without cropping.
Mobile inspection uses the full available width with vertical scrolling for tall photos. Audit
shared thumbnails and incident/knowledge/handover lightboxes. Preserve review drafts, annotation
coordinates, permissions, explicit retry and signed-link expiry. No backend or stored media changes.

DESIGN: Keep inspection orchestration in its feature and generic decoding/presentation in shared.
TanStack Query owns link/readiness caching; native image decoding prepares replacement pixels.
A navigation mutation prepares the selected image; only the latest observer callback commits the
selection. Retain the dialog across selections, reset only the editor by immutable identity.
Loading and failure feedback overlay the reserved image area. Keep desktop contain sizing and
use width-driven natural proportions on phones. Reuse existing components and Playwright; no new
library or independent media cache. Existing legacy PhotoThumb/Lightbox ownership is retained.

Lean: Proceed. Stable evidence and controls reduce reorientation and repeated waiting while the
master compares photos. No extra worker input. Verify with delayed HTTP/images, different aspect
ratios, rapid navigation, explicit retry, and desktop/mobile screenshots before delivery.

Implementation details: signed links are scoped to an inspection opening, with freshness bounded
by their expiry. The opening action creates the session identity; the dialog receives it as a prop.
No hook stores an inert session constant. Reopening requests a fresh audited link. Thumbnail links
also refetch on mount, while cached pixels keep geometry stable. Tall shared photos retain native
scrolling at base zoom. The toolbar has one scrolling row; the mobile footer accommodates wrapped
Ukrainian labels at 320 px.

Inventory: inspection from Handover/Cleanliness and Photo Library shares the corrected dialog.
Incident reports use the corrected PhotoThumb/Lightbox. Existing two-photo comparisons use the same
ZoomablePhoto. Profile avatars and attachment composition previews already reserve fixed frames;
QR images reserve explicit dimensions and are outside evidence-photo inspection.

Sources: [TanStack Query prefetching](https://tanstack.com/query/latest/docs/framework/react/guides/prefetching)
and [native image decoding](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decode).
Independent read-only review identified tall-image scrolling and per-opening link audit risks;
both were fixed and the follow-up review found no remaining blocking defect.

Verification (2026-09-17):

- 26 Playwright cases passed across desktop and mobile. Coverage includes stable initial geometry,
  delayed decoding, rapid latest-selection navigation, explicit image retry, offline reconnect,
  fresh audited links on reopening, five aspect ratios, tall-image scrolling, and the 320 px
  Ukrainian toolbar/footer. Geometry assertions tolerate less than one CSS pixel of movement.
- 44 focused Vitest cases passed across inspection, editor/viewport, navigation, shared Lightbox,
  thumbnails and Photo Library. Panel typecheck and changed-file ESLint passed; existing lint
  suppressions were only reduced.
- Captured and visually inspected desktop/mobile loading, switching, failure and aspect-ratio
  screenshots. Representative local evidence: `test-results/photo-smooth-2026-09-17/` (ignored).
- Browser integration uses intercepted API responses and synthetic images, including slow/error
  responses; production baseline was reproduced read-only on the owner's supplied handover.
  Physical-device pinch behavior has not been verified. CI and deployed smoke are delivery gates.

Lean completion: Proceed. Photos and actions stay in place, thumbnails preserve all evidence,
and mobile users can inspect the complete image without widening or shrinking the dialog.

## 2026-09-17 — Keep photo loading local

Reproduction: the first browser fixture omitted PanelShell's QueryActivity and MutationActivity.
Photo preparation used a mutation observed by the global saving indicator; inserting its status row
shifted page content behind the dialog. The corrected fixture includes both real indicators and the
page content layout. The new desktop/mobile assertion failed before the fix (one global status
instead of zero).

Accepted scope: switching shows exactly one readable loader inside the unchanged photo frame, with
no photo-related page/header indicator or page movement. Preserve normal save and refresh feedback,
latest-selection behavior, offline recovery, natural proportions and the existing review rules.

Implementation: standard TanStack operation metadata declares locally owned feedback; global
activity filters exclude only that explicit opt-out. Photo decoding, inspection metadata/links and
navigation opt out. The small shared usePreparedPhoto hook owns asynchronous preparation and latest
selection; the inspection API owns its metadata/link/decode sequence. Views receive one loading
label instead of separate pending/paused flags. Loader contrast is independent of image colors.
This uses the library's existing mutation observer, not another cache, timer or request state machine.
See [TanStack filters](https://tanstack.com/query/latest/docs/framework/react/guides/filters).

Verification: 26 browser cases pass with the real page indicators present, including exactly one
local loader and unchanged frame/page coordinates during a delayed switch. Fifteen focused component
and model tests pass, including concurrent real-save feedback and locally owned background reads.
Desktop/mobile screenshots before and after were captured and visually inspected in
`test-results/photo-local-loading-2026-09-17/` (ignored). Production browser interaction was interrupted
by concurrent user activity; no production decisions or reviews were changed.

Lean: Simplify. Keep status beside the evidence being loaded, avoid misleading saving feedback and
reorientation, and share the small navigation behavior between inspection and the gallery.
