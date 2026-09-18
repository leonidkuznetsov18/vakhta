# Product landing engineering memory

## Status and scope

2026-09-18; active feature `specs/010-product-landing-sales`, current `master` checkout.
Implementation for [epic #81](https://github.com/leonidkuznetsov18/vakhta/issues/81). Publication
and campaign outcomes are separate. No operational feature, employee record or bot action changed.

## Decisions

- Manufacturing only. Lead with reducing downtime and recurring incidents; recording is a means.
- Approved operator Vakhta, email behind composer buttons only. Pilot primary; demo and investment
  secondary. No lead service, tracking cookies, pricing promise or invented traction.
- Root is Ukrainian; three direct locale routes and twelve feature pages per locale (40 documents).
- React 19/Vite/Tailwind build-time rendering, typed i18n copy, no shipped React runtime. FSD page
  owns presentation and prepared content; three small features own contact, language anchors and
  image/scenario expansion. No operational app imports or runtime routing framework.
- Six selectable scenarios, twenty FAQ answers, three public-only text handouts. Native HTML works
  without JavaScript. The dialog is a full viewport overlay, not browser chrome fullscreen: full
  source image, scrolling, 100% toggle, Escape and focus restoration. No unsolicited new tab.
- Original generated portraits follow the Connecteam composition reference; no competitor assets.
  Prompts are tracked in the spec folder. Portraits are labelled illustrations, not testimonials.
- Owner accepted the experiment and keeps the record. See publication-inputs.md. No outreach,
  campaign start, qualified conversation, pilot or saving is claimed from implementation.

## Media evidence

All public assets live in `apps/landing/public/`; working captures are ignored under
`apps/landing/test-results/visual/`. Screens show the Ukrainian product UI with trilingual surrounding
copy. The owner explicitly authorized real product/problem screenshots and the kiosk QR.

| Asset                                                                                                                                              | Provenance and boundary                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `overview-uk`, `overview-full-uk`, `schedule-full-uk`, `bonus-full-uk`, `panel-losses-uk`, operations, requests, administration, checklists, audit | Actual panel components at local `/preview.html?lang=uk`; synthetic demo records. Caption identifies demo data, not customer outcomes. Full overview contains all lower sections; bonus includes the table. |
| `communications-uk`                                                                                                                                | Actual panel composer with a local demonstration draft; no message sent.                                                                                                                                    |
| `kiosk-uk`                                                                                                                                         | Live paired kiosk captured read-only. QR was transient and expired before publication; no attendance scan.                                                                                                  |
| `telegram-uk`                                                                                                                                      | Actual native Telegram bot menu. Personal greeting concealed; private calendar link excluded. This is a menu capture, not proof of a rehearsed active-shift flow.                                           |
| `incident-live-uk`                                                                                                                                 | Actual resolved glue-shortage case, 2026-09-15. Crop shows recorded cause and resolution; employee fields excluded. No record edited.                                                                       |
| `handover-live-uk`                                                                                                                                 | Actual 2026-09-15 handover reviewed on 2026-09-16: checklist, three equipment photos and recorded master remarks. Crop excludes employee row. No decision made during capture.                              |
| `photos-live-uk`                                                                                                                                   | Actual photo-review dialog from that handover, showing equipment and existing suggestions for a cup/rag. No analysis or save triggered. Suggestions are not a final decision or model accuracy evidence.    |
| `people/*.webp`                                                                                                                                    | Six original AI-generated fictional manufacturing profession portraits, visually inspected.                                                                                                                 |

Live case captures were read-only in the current authenticated production panel. Captures and crops
were visually inspected. Demo screenshots are not represented as current customer data. Real-case
photos support what the interface looks like, not a numerical downtime-reduction claim.

## Verification

- `pnpm --filter landing... run build`: passed; includes strict TypeScript. Forty static HTML pages,
  404, sitemap, robots and localized text handouts. Client JS approximately 1.14 KB gzip, no React runtime.
- `pnpm --filter landing lint`: passed.
- `pnpm --filter landing test`: 13 passed, including full-asset dialog, selected scenario, 100% toggle,
  close/focus restoration, all routes, localized contact intents and public handout boundaries.
- `pnpm --filter @vakhta/i18n test`: 13 passed.
- Real Chrome: desktop 1440px and mobile 390px screenshot capture AND visual inspection of hero,
  product/scenario expansion and feature presentation. Image expansion keeps URL unchanged, native
  Escape closes and returns focus; mobile 100% mode renders the 1184px source with internal scrolling.
- Public screen captions distinguish synthetic overviews from real cases. Mail recipient inspected,
  no test email sent. No production worker actions manufactured for a demonstration.
- Full integration belongs to existing GitHub CI; do not report local checks as CI or deployment.

## Delivery and rollback

Cloudflare Pages project `vakhta-landing` created with production branch master; `vakhta.xyz`
associated. Existing panel/kiosk projects remain separate. CI builds and deploys landing using the
existing Pages credentials. No duplicate release notification path or manual Telegram message.

Before the first apex record, DNS had MX/TXT and no A/AAAA/CNAME. Add only the marketing CNAME,
preserving mail. Read back the domain status and verify HTTPS/locales/404/assets after deployment.
For rollback, redeploy the prior verified landing deployment in Pages or revert this feature commit
normally on master. Do not modify panel/kiosk routes, mail records or operational data. First-launch
rollback may remove only the newly added marketing CNAME if no earlier landing deployment exists.

## Remaining work and honest limits

- #88: human Sales/business-reader rehearsal, full per-section all-locale a11y matrix and complete
  live Telegram worker walkthrough. Native Telegram automation exposed the menu but did not reliably
  activate historical chat controls. Do not claim a complete worker journey was exercised.
- Screenshots currently use Ukrainian UI; translated explanatory pages do not imply translated media.
- #90: real demand campaign, dated start/review, refusals and pilot commitments, owned by the user.
- No actual machine telemetry, OEE, ERP/MES integration, autonomous master decisions or measured ROI.
