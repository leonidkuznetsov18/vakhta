# Product landing engineering memory

## Status and scope

2026-09-18; baseline `811003a`; owner: project owner; writer: Codex.
Planning and sales-content delivery only. No application, DNS or hosting changes.
Active feature: `specs/010-product-landing-sales`, existing `master` checkout.

## Decisions

- Owner refinement: manufacturing only; lead with recurring downtime/time-loss reasons, faster
  incident response, personnel checklists and handover. The earlier adjacent-industry positioning
  is superseded and excluded from this campaign.
- Owner selected all three contact paths: demo, business pilot and investment. Contact links and a visible address
  avoid a new form service, lead database or tracking cookies in v1. Emphasize the manufacturing
  pilot; investor interest remains separate from customer demand.
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
and translated structural parity. The manufacturing refinement replaces the initial six-page exports
with five-page handoffs in each language; all 15 final pages were rendered and visually inspected.
Exports are in `Documents/Vakhta/landing-sales-2026-09-18/`; the tracked English source is
[sales-brief.en.md](../../../specs/010-product-landing-sales/sales-brief.en.md).
No app build/tests or live product QA were run because this delivery changes documentation only.
The landing is not implemented; no new marketing contact, domain or publication is claimed.
CI/release/announcement status is reported in the delivery handoff, not inferred from local checks.

## Remaining work

### GitHub backlog publication

Owner request, 2026-09-18: publish a separate implementation epic and issues for later execution.
Created [epic #81](https://github.com/leonidkuznetsov18/vakhta/issues/81) and nine native children
[#82–#90](../../../specs/010-product-landing-sales/tasks.md#future-implementation). T07–T13 are
covered; T10 is split into static foundation, page composition and conversion/download journeys.
Completed planning work was not recreated, and no product implementation was started.
The owner then narrowed the existing epic/children to manufacturing demand validation; preserve IDs.

The existing roadmap naming and stable body markers take precedence over generic task-ID titles.
All ten issues have `area:landing` and one status label. #82 needs an owner/Sales decision; the
epic and other children start in backlog. No individual assignees, deadlines or priorities were invented.
Each child records its responsible role, source task, dependencies, scope, acceptance and verification.
The initial source was `a4a5ff3a258e941a21ca28a5e955e815ebaf999d`; refinement links and hashes are
recorded in the publication receipt.

Live API readback passed: exact titles/labels, open states, nine native parent-child links, parent
checklist, unique markers across all open/closed issues, source links, dependencies, T07–T13 and
AC-001–014 coverage after the manufacturing refinement. Prelaunch protocol AC-012 is distinct from
postlaunch review AC-013–014, avoiding a circular launch dependency. Full-body hashes and IDs are retained in
[publication.json](../../../specs/010-product-landing-sales/publication.json). This is a historical
receipt, not an automatic synchronizer; preserve later edits and use GitHub for live status.

No application code, runtime translations, hosting, prospect outreach or operational data changed.
Local publication checks cover Markdown/JSON formatting, link resolution and diff whitespace only.

### Implementation inputs

Confirm contact, operator, hostname, media permissions and commercial wording. Review translations
with Sales, prepare demo assets, implement, verify and publish the page. The
[plan](../../../specs/010-product-landing-sales/plan.md) defines owners, acceptance and rollback.

## Manufacturing demand refinement

The page is an experiment, not proof of market need. Before launch, record manufacturing cohort,
channel, observation window, review date and continue/adapt/stop thresholds. Separate contacts,
qualified recurring problems, held demos and concrete pilot commitments; include refusal/no-fit
evidence. Investor/test activity is separate. Insufficient reach means inconclusive, not no demand.
No conversion rate without a reliable denominator. Reporting identifies recorded loss patterns for
investigation, not automatic machine bottlenecks or proven root causes; never aggregate overlapping
employee intervals into machine downtime. Product effectiveness requires separate pilot evidence.

## Connecteam design direction

Owner decision, 2026-09-18: apply Connecteam's presentation and adoption approach while retaining
manufacturing demand validation. The [design brief](../../../specs/010-product-landing-sales/design-reference.md)
records three official public sources, desktop home/forms visual review and the forms mobile hero
at 390 × 844. No authenticated competitor app, full responsive/a11y audit or market-leadership
verification was performed. Existing deep product research is reused as a dated input.

The brief adds original visual tokens, page composition, readable worker/manager evidence, role
explanations and adoption steps. AC-015–016 map to existing content/design/page/acceptance issues;
AC-013–014 remain postlaunch demand outcomes. Product candidates reuse #41/#42/#43/#47/#53 under #3
and are not advertised as available or required for landing launch. Existing Sales export copy is unchanged.

Verification scope: scoped formatting, local links, acceptance/issue mapping, exact GitHub section
readback and preserved issue metadata/native children. No application behavior changed; no app tests,
product UI screenshots or production actions are required for this documentation refinement.
