# Design and implementation plan

## DESIGN

Use documented code-based routes: a small explicit route tree fits the existing Vite/FSD structure
without adding generated route files or moving business pages. `app/router` composes page public APIs
and legacy pages; `app/ui` owns the shell; `app/ui/panel-app.tsx` mounts RouterProvider. Lower layers use TanStack
hooks/getRouteApi directly and never import the app router. Type registration is compile-time only.
Existing legacy navigation context remains only as the established cross-feature intent/access API;
its go callback calls TanStack navigate and owns no route state. Remove lib/route entirely.

Use createHashHistory to preserve deployed links. Optional named route params model rows and admin
subpaths. Static route metadata identifies the section. Shell content is Outlet; Link determines
active state. Router controls route commits; no loaders duplicate Query data or cache.

Register one useBlocker in the shell using existing dirty checks; the existing registry owns unload
warnings. Mobile menu closure follows accepted router navigation. Communications receives the same
history instance via its provider, with lifecycle cleanup of its history subscription. Current route-linked record
IDs are URL-only; saved filters/unsaved drafts remain in their existing stores.

Legacy routes redirect through beforeLoad, preserving record/filter intent. Unknown routes redirect
to Overview. Keep all routes behind the shell's existing authentication gate. Route composition is
app-owned; migration of legacy page internals beyond routing is deferred.

Lean recommendation: Simplify. Remove duplicate navigation infrastructure and stale selection fallback;
keep worker steps and existing safeguards. Success is consistent URL/content/menu across the acceptance
matrix, with no additional worker interaction. Historical intermittent root cause remains unproven.

## IMPLEMENT

1. Add pinned TanStack Router; implement route tree/provider and canonical redirects.
2. Replace shell switching and custom link interception with Outlet/Link; wire blocker and menu close.
3. Migrate tabs, record selection, deep links, command navigation and communications history. Delete
   old route module and all its callers; remove obsolete persisted selection writes.
4. Adapt existing component fixtures to real router context; add focused regressions for URL-only
   selection, canceled Back, accepted navigation, redirects and communications history.
5. Run panel verification and inspect browser screenshots; review fixed diff against this specification.
6. Update existing product/engineering feature docs, commit owned paths and push master normally.
   Check CI, release, deployment and announcement; no intermediate documentation-only delivery.

## VERIFY / HARDEN

Use Vitest/jsdom with the production React Compiler on app routing, actual TanStack history and existing
page mocks where shell behavior is the subject. Existing page tests retain their assertions. Browser
preview uses synthetic data and real page components, followed by read-only deployed navigation.
Check encoded IDs, missing/invalid params, same-target clicks, dirty row switches, interrupted/rapid
navigation and Back/Forward. Preserve `.claude/launch.json` and any concurrent edits.

Rollback: revert the coherent source migration commit through a normal new master commit if required;
no data/schema migration. Evidence and remaining limits live in the mobile-panel engineering memory.

## Primary sources

- https://tanstack.com/router/latest/docs/routing/code-based-routing
- https://tanstack.com/router/latest/docs/guide/history-types
- https://tanstack.com/router/latest/docs/guide/navigation
- https://tanstack.com/router/latest/docs/guide/outlets
- https://tanstack.com/router/latest/docs/guide/path-params
- https://tanstack.com/router/latest/docs/guide/navigation-blocking
