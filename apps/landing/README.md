# Vakhta manufacturing landing

[Implementation epic #81](https://github.com/leonidkuznetsov18/vakhta/issues/81).
Root is Ukrainian; `/uk/`, `/en/`, `/ru/` contain complete static documents. Twelve feature pages
per language explain current capabilities, steps and manufacturing value. Six selectable scenarios
connect kiosk, worker Telegram and the panel. Twenty FAQ answers describe capabilities and limits.

```sh
pnpm --filter landing... build
pnpm --filter landing preview
pnpm --filter landing test
```

Open `http://127.0.0.1:5175/`. Rebuild after editing. The preview serves the production output.
React 19 renders at build time; no React runtime, tracking or lead backend ships. Native HTML owns
FAQ, contact and navigation. Small enhancements preserve language anchors and open screenshots or
selected scenarios in a viewport-filling native dialog, with Escape, focus restoration and 100% zoom.
Without JavaScript, image links open the full asset in the same tab and core content remains usable.

Approved defaults are Vakhta and the owner-supplied sales email. `LANDING_EMAIL` and
`LANDING_OPERATOR` may override them at build time. Explicit invalid inputs disable contact and
mark documents noindex. The address is in mailto links, not visible page copy; this is not encryption.
Three localized public-only `.txt` handouts are generated. Internal Sales notes are not published.

Vite builds assets and a temporary React server entry; `renderToStaticMarkup` produces 40 documents
and removes the server entry. No runtime router or rendering framework is required. Cloudflare Pages
project `vakhta-landing` serves the root domain. Existing panel and kiosk projects remain separate.
The CI Pages job builds and deploys all three. See the feature engineering memory for delivery evidence,
media provenance, QA limitations and rollback. The historical Pages origin is marked noindex.
