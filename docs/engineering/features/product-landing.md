# Product landing engineering memory

## Status and scope

2026-09-18; baseline `811003a`; owner: project owner; writer: Codex.
Planning and sales-content delivery only. No application, DNS or hosting changes.
Active feature: `specs/010-product-landing-sales`, existing `master` checkout.

## Decisions

- Manufacturing-first Connected Worker / Frontline Operations positioning. Hotel, warehouse and
  facility-service applications are process-fit hypotheses, not established deployments.
- Owner selected all three contact paths: demo, business pilot and investment. Contact links and a visible address
  avoid a new form service, lead database or tracking cookies in v1.
- Future static marketing app reuses React/Vite and i18n; it does not migrate the operational panel.
- Claims need source evidence and a rehearsed demo. No inferred ROI, customer metrics, market size,
  certification or autonomous Master agent.
- Ukrainian/English/Russian handoffs are external exports; repository documents are English.
  Runtime translations are future i18n work.

## Evidence

The [spec inventory](../../../specs/010-product-landing-sales/spec.md) lists source references.
Schedule documentation contains stale statements; selected public demo paths require release checks.
Source inspection is not fresh production QA or measured customer outcomes.

Planning validation passed: scoped Prettier, local Markdown link resolution, claim/acceptance review
and translated structural parity (six sections, 43 headings and 30 bullets in each language).
All three DOCX exports rendered to six pages each; all 18 final pages were visually inspected.
Exports are in `Documents/Vakhta/landing-sales-2026-09-18/`; the tracked English source is
[sales-brief.en.md](../../../specs/010-product-landing-sales/sales-brief.en.md).
No app build/tests or live product QA were run because this delivery changes documentation only.
The landing is not implemented; no new marketing contact, domain or publication is claimed.
CI/release/announcement status is reported in the delivery handoff, not inferred from local checks.

## Remaining work

Confirm contact, operator, hostname, media permissions and commercial wording. Review translations
with Sales, prepare demo assets, implement, verify and publish the page. The
[plan](../../../specs/010-product-landing-sales/plan.md) defines owners, acceptance and rollback.
