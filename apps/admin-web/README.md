# admin-web

The administrator panel: React 19, Vite, shadcn/ui. See `docs/features/11-admin-panel.md` for what
it does and the conventions.

## Visual check without an API

`pnpm --filter admin-web dev`, then open <http://localhost:5173/preview.html>. The page renders the
signed-in shell with fixtures instead of the API (`src/preview.tsx` stubs `fetch`), so the sidebar,
the header and the pages can be screenshotted while working on layout:

- `?collapsed=1` opens the icon rail, `?theme=dark` the dark theme, `?lang=uk|en|ru` the language;
- `#/schedule` and the other section hashes open a section directly.

The page is dev-only: `vite build` bundles `index.html` alone.
