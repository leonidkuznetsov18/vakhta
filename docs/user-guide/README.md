# User guide

End-user documentation handed to the pilot participants: employees (Telegram bot), the
checkpoint terminal, and the panel users (shift master, planner, HR, production head,
accountant, auditor, administrator).

The guide is written in the pilot interface language (Russian, NFR-08). Ukrainian and
English editions are produced from the same structure when the pilot asks for them.

| File                        | What it is                                             |
| --------------------------- | ------------------------------------------------------ |
| `vakhta-user-guide.ru.html` | Source of the guide, print-ready HTML with inline CSS. |
| `vakhta-user-guide.ru.pdf`  | Rendered PDF for distribution.                         |

## Regenerate the PDF

The PDF is printed from the HTML with headless Chrome, A4, no browser headers:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --no-pdf-header-footer --print-to-pdf="$PWD/docs/user-guide/vakhta-user-guide.ru.pdf" \
  "file://$PWD/docs/user-guide/vakhta-user-guide.ru.html"
```

## Keeping it accurate

Every label quoted in the guide comes from `packages/i18n/src/ru.ts`; the shift flow from
`packages/domain/src/shift-fsm`; request routes from `packages/domain/src/requests/routes.ts`;
bonus weights from `packages/domain/src/bonus/rules.ts`; reason codes from
`packages/db/src/seed.ts`; timing defaults from `apps/api/src/config/env.ts` and
`docs/parameters.md`. When any of those change, update the matching section and re-render.

## Photo inspection onboarding

The photo editor has its own **How it works** and **Questions and answers**, using the existing panel
help component. Its full instructions and illustrative, silent one-minute videos are published at
`/guides/photo-inspection.{uk,en,ru}.html` and `.mp4`; the pages support browser printing and provide
text explanations alongside the video. These are synthetic illustrations, not recordings of employee
photos or model-accuracy demonstrations. Video controls support pause, seeking and full screen.

All instructions, FAQ answers and video text originate in
`packages/i18n/src/photo-inspection-guide.ts`. Regenerate the static artifacts after editing the catalog:

```sh
pnpm --filter @vakhta/i18n build
node scripts/docs/build-photo-inspection-guide.mjs
```

The authoring command uses the repository's Sharp/Prettier dependencies and an installed `ffmpeg`;
production serves ordinary HTML, WebP and H.264 MP4 files and needs none of those authoring tools.
Inspect rendered desktop/mobile pages and representative video frames, then commit the generated
files under `apps/admin-web/public/guides/` together with the source changes.
