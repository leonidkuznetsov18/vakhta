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
