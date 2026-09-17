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

Final visual check exposed another placement issue: an overlay inside the scrolling element can
scroll out of view with a tall image. Loader feedback now belongs to the stationary photo wrapper,
while only the image viewport scrolls. A new failing mobile assertion caught the loader's displaced
center; the final 26 browser cases verify its center after scrolling as well as stable page/frame
geometry. Screenshots now wait for the loading state before capture. Focused UI tests, typecheck and
lint passed again after this DOM-only adjustment. The superseded CI run was canceled before release
so both fixes publish together.

## 2026-09-17 — Reuse loaded photos before preparing more work

Accepted scope: a decoded table preview or gallery image switches immediately without a photo
loader or another image download. A cold image retains local loading and recovery. Keep frame
geometry, latest selection, natural proportions, scoped access checks and audit requests intact.

The thumbnail already contains the full image. Reuse its existing Query cache entry instead of
waiting for a newly signed URL and review metadata. The shared navigation hook has a synchronous
ready path; only a cache miss enters asynchronous preparation. The gallery prepares its two
neighbors through existing image queries. Inspection image selection/retry and navigation belong
to small feature model hooks; rendering consumes their results. No new cache, timer or dependency.

Metadata remains separate: show cached pixels read-only while fetching the selected review. Drop
only an inactive target's old detail before creating its editor, so cached annotations/permissions
cannot become its editing baseline. Returning from a pending selection to the still-visible photo
preserves its editor. The scoped link observer remains mounted across loading/editor replacement,
and explicit retry switches to a fresh signed source for that media only.

Verification: the new delayed-metadata test failed on desktop/mobile before implementation. All
32 photo browser cases and 12 focused component cases now pass; panel typecheck and changed-file
ESLint pass. Tests cover no new image download when an audited link changes, offline cached
navigation, fresh permissions on return, current-image retention on canceled navigation, cold-image
retry, proportions and stable geometry. Captured and visually inspected desktop/mobile screenshots
in `test-results/photo-cache-reuse-2026-09-17/` (ignored). An independent recovery review found stale
editor initialization and retry identity issues; both were corrected and the follow-up found no
remaining concrete defect. Production deployment verification remains a separate delivery check.

Lean: Simplify. Reuse prepared evidence and remove the network wait from photo navigation. A review
still waits for its current server data; image loading feedback remains only for missing pixels.

## 2026-09-17 — Preserve photos during dialog exit

Reproduction: closing removed the entire dialog while its state was still open, bypassing Radix's
exit animation. Desktop/mobile regression cases failed before the fix. Keep the dialog's local open
state until Radix finishes closing, then clear the parent's selection through onCloseAutoFocus.
Both gallery close buttons use the same Dialog close primitive; Escape and outside clicks follow
the same path. Detach pending photo navigation before closing. Keep dirty-review confirmation.
IncidentWorkspace mounts the viewer only for a selected image set, so reopening starts a fresh
dialog session. No timers, effects or custom animation lifecycle were added.

Verification: 38 photo browser cases passed, including exit image retention, close/reopen, Escape,
outside clicks and close during pending navigation. After the gallery host/footer correction,
all four affected desktop/mobile gallery cases passed again. The real incident reopen regression
failed before its fix; 18 incident/gallery component tests and nine inspection component tests pass.
Captured and visually inspected desktop/mobile closing and closed screenshots in
`test-results/photo-close-2026-09-17/` (ignored). Independent recovery review found no remaining
concrete issue. Production verification remains separate from local evidence.

Lean: Simplify. Reuse the existing dialog lifecycle and keep the same photo through its exit;
one close path replaces immediate parent cleanup and avoids extra render orchestration.

CI exposed a geometry-test race: boundingBox resolved the read-only preview just before fresh
metadata replaced it with the editor. The trace shows metadata completion during that measurement.
Wait for the editor's enabled tool before measuring its settled geometry; delayed-metadata tests
still cover the preview frame separately. Twenty repeated desktop/mobile navigation cases pass.
