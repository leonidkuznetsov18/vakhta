# Implementation Plan: Product Landing Page and Sales Handoff

**Change**: 010-product-landing-sales | **Date**: 2026-09-18 | **Spec**: [spec.md](spec.md)
**Baseline**: 811003a | **Checkout**: master
**Engineering memory**: [Product landing](../../docs/engineering/features/product-landing.md)

## Summary

Refocus planning and trilingual sales material on manufacturing demand validation. Subsequently build an independent public marketing
app with complete static HTML in each language. Reuse the React/Vite workspace and i18n catalogs;
keep the authenticated operations panel unchanged. Contact links avoid an unnecessary lead backend.

## Technical Context

- Existing stack: pnpm 10.9.0, Turborepo, React `^19.1.0`, Vite from the workspace catalog, strict
  TypeScript, React Compiler and Tailwind 4. Recheck installed versions before implementation.
- `apps/admin-web` owns operations; `apps/qr-kiosk` owns the vanilla kiosk. Neither owns marketing.
- `packages/i18n/src/{messages,en,uk,ru}.ts` and `index.ts` provide typed catalogs. Future production
  copy belongs in a deliberate `landing` namespace in all three catalogs.
- Current `.github/workflows/ci.yml` deploys panel/kiosk to Cloudflare Pages. Verify the marketing
  destination and hostname ownership before adding routes or changing DNS.
- No database, API, worker, auth, CMS, CRM or lead-form changes are needed for v1.

### Research and evidence

The spec inventories source evidence. Schedule documentation contains stale statements; demonstrate
selected capabilities against the intended release before publication. No manufacturing demand, downtime reduction, customer traction or fresh
production QA was established by this planning task.

[Vite's SSR guide](https://vite.dev/guide/ssr) supports build-time prerendering of static content and
identifies its SSR API as low level. Before selecting the build adapter, compare maintained
Vite-compatible static-generation tools and workspace reuse. Pick the smallest supported option that
emits the locale pages. Do not build a general rendering framework or migrate to Next.js. This bounded
implementation spike does not block content/design planning.

[Google's localized-page guidance](https://developers.google.com/search/docs/specialty/international/localized-versions)
provides the basis for separate language URLs with reciprocal alternate links. Each locale gets a
self-canonical URL and reciprocal `hreflang` entries; root is the `x-default` language selector.

## Constitution Check

No operational behavior changes. English repository docs coexist with the requested external sales
translations; production copy will use i18n. Proposed FSD ownership has deliberate public APIs and no
prohibited hooks. No lead endpoint means no transaction or async-delivery design is needed. Work
stays serialized on master. Checks are documentation-only now and UI-focused during implementation.
Post-design check: no exceptions required. Missing publication inputs do not block this planning task.

## DESIGN: Ownership and Behavior

### Application boundaries

- `apps/landing/src/app/`: entry composition, static generation wiring, global styles.
- `apps/landing/src/pages/product-landing/`: page, prepared localized content model, public `index.ts`.
- `apps/landing/src/features/contact-sales/`: verified contact configuration and intent links, public API.
- `apps/landing/src/shared/`: only genuinely domain-independent primitives needed by this app.

Keep page sections local until stable reuse warrants widgets. Reuse exported workspace modules;
never deep-import admin-web internals. Do not extract a shared design-system package for one page or
create empty FSD layers. Render content models; keep validation/URL decisions outside JSX.

### Locale and navigation contract

Generate `/uk/index.html`, `/en/index.html`, `/ru/index.html` and a root language selector. Locale is
owned by the path, with no duplicated client state. Root lists all native language names and may
highlight browser preference, but never forces a redirect. Unknown language paths produce a 404 with
working locale links. Shared `DEFAULT_LOCALE` stays Russian for missing/invalid internal values.

Use normal document/anchor links. Switching locale preserves a recognized spec section anchor;
unknown anchors resolve to page top. History works natively. Do not introduce a router just for
three static documents; if stateful routing becomes necessary, use the documented TanStack approach.

Localize `html lang`, title, description, Open Graph, captions and alt text. Emit final canonical,
alternate and sitemap URLs. Preview pages are non-indexable. Do not invent structured ratings,
prices or testimonials. Validate generated HTML with JavaScript disabled.

### Contact and measurement

Demo, pilot and investor are separate intents, as requested by the owner. Require owner-confirmed contact configuration before launch.
Use localized subjects and a visible copyable email alongside a verified email/booking link. A click
never means delivery. No asynchronous submission exists in v1, so retries, cancellation, idempotency
and persisted leads are inapplicable. A later form requires its own validation, storage, delivery,
spam controls and privacy design before implementation.

No third-party analytics or tracking cookies in the baseline. Sales records qualified conversations
and pilot starts manually using the spec's manufacturing-demand protocol. Before launch, record the
cohort, channel, observation window/review date and decision thresholds. Capture recent loss/incident
examples, current workaround, buying role, objections and concrete pilot commitments. Distinguish
customer demand from investor interest and clicks; absent traffic denominators prohibit conversion-rate claims. If tracking is approved later, `demo_contact_click`, `pilot_contact_click`, `investor_contact_click`
and `sales_material_download` may include locale/section, never names, emails or message text. Clicks
are not submitted leads. Do not create an analytics service for this page.

### Design and evidence assets

The [Connecteam adaptation brief](design-reference.md) is the design input for #83/#84/#86/#88.
Use its original token proposal, split hero, worker/manager evidence composition, role explanations,
progressive enhancement rules and product-candidate ownership. Validate tokens with real trilingual
copy; do not introduce a carousel, role-tab state or video requirement when static sections suffice.
Product candidates in epic #3 are not landing dependencies. No competitor assets enter the build.

Prepare desktop/mobile wireframes. Use authorized real product screenshots with synthetic/demo records:
incident/response, personnel checklist, handover/photo review and loss-report reasons. Scheduling is secondary. Record source revision, capture date,
locale and permission. Remove employee details and tokens. Use manufacturing scenes only; label conceptual scenes as illustrations, never customer evidence. Do not depict unimplemented features as screenshots.

Keep main content in HTML. Images need dimensions, responsive variants, alt text and captions;
lazy-load secondary media. No autoplay; respect reduced motion. FAQ can use native details. Mobile
uses a single reading column. Inspect longest translations, focus and keyboard behavior.

## Project Structure and Allowed Files

This task owns `.specify/feature.json`, `specs/010-product-landing-sales/`,
`docs/features/product-landing.md`, `docs/engineering/features/product-landing.md`, and the scoped
Product Landing entry in `docs/engineering/roadmap.md`.
External exports: `Documents/Vakhta/landing-sales-2026-09-18/`. Preserve pre-existing
`.claude/launch.json`. Codex is the writer/index owner. No branch, PR or worktree.

Future implementation owns `apps/landing/`, scoped i18n additions, required workspace/lockfile changes
and narrow hosting workflow edits. Recheck the checkout and inputs before extending this allowlist.

## Applicable Skills

Current: project-local `speckit-specify`, `speckit-plan`, document creation for the external handoff.
Future design: `frontend-design` or `impeccable`; React: `vercel-react-best-practices`; QA:
`webapp-testing`. Load only relevant references at the affected stage.

## IMPLEMENT: Ordered Delivery

| Stage                    | Owner             | Dependency              | Exit evidence                                                                                   |
| ------------------------ | ----------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| 0. Planning package      | Planner + owner   | Repository recon        | Specification, plan, three equivalent sales handoffs                                            |
| 1. Publication inputs    | Owner + Sales     | Stage 0                 | Confirm contact, operator, hostname, permissions and pre-recorded manufacturing demand protocol |
| 2. Content and proof     | Sales + owner     | Stage 1                 | Review translations, rehearse demo, approve sanitized media                                     |
| 3. UX and visual design  | Designer          | Stage 2                 | Desktop/mobile design, localized captions and complete contact journey                          |
| 4. Static implementation | Frontend          | Stages 2–3              | Adapter spike, i18n, locale HTML, responsive page and metadata                                  |
| 5. Acceptance            | QA + Sales        | Stage 4                 | Content, language, links, keyboard, visual evidence and rehearsal                               |
| 6. Release               | Integration owner | Stage 5 + launch inputs | Hosting, canonical routes, CI/release/announce status, live checks, rollback                    |
| 7. Commercial learning   | Sales + owner     | Live page               | First bounded manufacturing-demand review yields continue/adapt/stop/inconclusive with evidence |

Estimate cost and timing after assets, destination and build adapter are known. No manufactured
velocity, free pilot or fixed deployment duration is promised. Batch implementation delivery.

## VERIFY and HARDEN

**Now**: review claim inventory and translated meaning, local links, scoped Prettier and
`git diff --check`; render and inspect every exported document page. No application behavior tests.

**Later**: establish scripts in `apps/landing`, then run `pnpm --filter landing build`,
`pnpm --filter landing typecheck`, `pnpm --filter landing lint`, `pnpm --filter landing test` and
`pnpm --filter landing test:browser`. These are future checks, not checks claimed in this delivery.

| Acceptance         | Evidence                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| AC-001–003, AC-011 | Sales content review, capability traceability and rehearsed demo; no unsupported metrics                                        |
| AC-004–005         | Matching trilingual exports, buyer and investor rehearsal with demo data                                                        |
| AC-006–008         | Locale parity check; direct URLs, language/anchor/Back, root and 404 browser tests                                              |
| AC-012–014         | Inspect the pre-recorded demand protocol and first review; separate exposure, qualified manufacturing need and pilot commitment |
| AC-009–010         | Verify destination and fallback; assert contact click does not claim delivery                                                   |
| AC-015–016         | Inspect the design-reference mapping, role comprehension and current proof; verify all locale/mobile media fallbacks            |
| FR-007             | Keyboard/a11y; capture AND inspect all sections at 390px and 1440px in each locale; 320px and 200% zoom boundary checks         |
| Static/SEO         | No-JS HTML, canonical/alternate/sitemap validation and preview indexing control                                                 |
| Media              | Permission, privacy, truthful captions and legibility of every asset                                                            |

Existing CI remains the full integration gate. After release verify all locale/contact URLs, assets,
canonical host and unaffected panel/kiosk routing. Check release and the existing Telegram announcement
job separately; no manual message. Rollback only the landing build/routing to its previous verified
state, without modifying operational services or data.

## REPORT and Documentation

Record planning evidence now and implementation/hosting evidence later in engineering memory.
The product document must remain marked **planned** until the site exists and is verified. Separate
source-supported capabilities, demonstrated behavior, deployed status and measured outcomes.

## Open Decisions

Launch inputs: real sales destination/operator, intended hostname, media/case permissions, commercial
offer and any investor figures cleared for disclosure. Defaults: three visible conversion choices,
manufacturing-only scope, downtime/time-loss and response positioning. The pilot CTA has strongest
emphasis; investor contact remains available but secondary. These inputs do not block planning; site publication requires them.
Master-agent autonomy remains a separate product decision.
