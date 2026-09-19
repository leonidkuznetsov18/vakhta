# Delivery Tasks: Product Landing Page and Sales Handoff

**Feature**: [spec.md](spec.md) | **Design**: [plan.md](plan.md)
**Checkout**: master | **Writer/index owner**: Codex

**GitHub epic**: [#81](https://github.com/leonidkuznetsov18/vakhta/issues/81).
GitHub is the live implementation-status authority. The checkboxes distinguish implemented work from Sales rehearsal and postlaunch evidence.

## Planning delivery

- [x] T01 Inspect product mission, feature documentation, code boundaries and delivery conventions.
- [x] T02 Write the specification, claim inventory, acceptance criteria and implementation plan.
- [x] T03 Incorporate the owner decision: visible demo, pilot and investment contact paths.
- [x] T04 Write equivalent Ukrainian, English and Russian sales handoffs; retain the English source in [sales-brief.en.md](sales-brief.en.md).
- [x] T05 Validate formatting, local links, translated structure and all rendered document pages.
- [x] T06 Review and prepare only planning-owned files for direct-master delivery; report actual push and CI/release/announcement status in the delivery handoff.

## Future implementation

| Source task | GitHub issue                                                 | Bounded outcome                                             |
| ----------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| T07         | [#82](https://github.com/leonidkuznetsov18/vakhta/issues/82) | Define manufacturing demand protocol and publication inputs |
| T08         | [#83](https://github.com/leonidkuznetsov18/vakhta/issues/83) | Prepare equivalent content and authorized proof             |
| T09         | [#84](https://github.com/leonidkuznetsov18/vakhta/issues/84) | Design desktop/mobile journeys                              |
| T10         | [#85](https://github.com/leonidkuznetsov18/vakhta/issues/85) | Build static locale foundation and metadata                 |
| T10         | [#86](https://github.com/leonidkuznetsov18/vakhta/issues/86) | Implement page narrative and evidence                       |
| T10         | [#87](https://github.com/leonidkuznetsov18/vakhta/issues/87) | Connect demo, pilot, investment and approved downloads      |
| T11         | [#88](https://github.com/leonidkuznetsov18/vakhta/issues/88) | Verify integrated acceptance and rehearse Sales             |
| T12         | [#89](https://github.com/leonidkuznetsov18/vakhta/issues/89) | Publish and verify live routes and rollback                 |
| T13         | [#90](https://github.com/leonidkuznetsov18/vakhta/issues/90) | Evaluate manufacturing need and pilot commitment            |

T10 is split into three reviewable implementation issues, preserving its original scope. Completed
planning tasks T01–T06 were not recreated. Future implementers use the tracked English brief and
obtain or regenerate the localized handoffs; no GitHub issue depends on a private local file path.
Receipts and initial readback evidence: [publication.json](publication.json).

- [x] T07 Owner/Sales define the manufacturing demand protocol (cohort/channel/window/review/thresholds) and supply publication inputs (AC-009–012).
- [ ] T08 Sales verify advertised scenarios and prepare sanitized worker/manager demo assets from the design brief (AC-002–005, AC-016).
- [x] T09 Designer applies the Connecteam adaptation brief to original desktop/mobile layouts for all three languages (AC-015–016, FR-007).
- [x] T10 Frontend chooses the bounded static-build adapter and implements locale pages, content, metadata and three contact intents and the accepted design brief (AC-001, AC-006–010, AC-015–016).
- [ ] T11 QA/Sales complete the plan's browser, visual, language, content and presentation checks (AC-001–012, AC-015–016); campaign outcomes AC-013–014 are completed in T13 after launch.
- [x] T12 Integration owner publishes, verifies live routes and rollback, and checks the existing release announcement.
- [ ] T13 Sales record qualified manufacturing need, objections and pilot commitments; complete the bounded demand review (AC-012–014) before claiming demand or savings.

Dependencies are sequential as shown, except asset preparation and design may overlap after their
inputs are fixed. All writes remain serialized. No tasks authorize operational feature expansion,
prospect outreach or fabricated employee actions. Evidence belongs in the
[engineering memory](../../docs/engineering/features/product-landing.md).

Design input: [Connecteam adaptation brief](design-reference.md). Product adoption candidates reuse
existing workforce issues; their delivery is not required to implement or launch this landing.

## SEO execution tasks — 2026-09-20

- [x] T14 Implement one canonical Ukrainian home, legacy redirects and consistent alternate URLs.
- [x] T15 Expand five manufacturing capability explanations in uk/en/ru and add useful metadata.
- [x] T16 Publish two localized resource templates per language with native downloads and internal links.
- [x] T17 Prepare minimal truthful structured data and social image references without new tracking.
- [ ] T18 Verify focused checks, desktop/mobile views and deployed redirects/resources.
- [ ] T19 Verify GSC ownership, submit the sitemap and record indexing/search baseline (owner access required).
- [ ] T20 Obtain PageSpeed/CrUX baseline (public API quota blocked); optimize measured bottlenecks only.
- [ ] T21 Complete authorized worker demo/rehearsal and obtain actual demand evidence; preserve T08/T11/T13.

T14–T18 are one delivery. T19/T20 are independent external checks, not invented completion signals.
