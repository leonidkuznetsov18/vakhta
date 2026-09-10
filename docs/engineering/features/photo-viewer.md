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
