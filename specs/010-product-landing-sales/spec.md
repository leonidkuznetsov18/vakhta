# Feature Specification: Product Landing Page and Sales Handoff

**Change**: 010-product-landing-sales | **Created**: 2026-09-18 | **Status**: Draft for implementation
**Baseline**: 811003a | **Checkout**: master
**Authority**: Owner requests a trilingual landing-page plan and specification for Sales to present
Vakhta to business owners and prospective investors.
**Product document**: [Product landing](../../docs/features/product-landing.md)
**Engineering memory**: [Product landing](../../docs/engineering/features/product-landing.md)

## RECON: Current Behavior

Vakhta is a Connected Worker / Frontline Operations platform. Its established domain is continuous
manufacturing with shift teams. Workers use Telegram and QR kiosks; managers use a web panel.
This checkout has no dedicated marketing application. Operational documentation does not provide
a standalone sales narrative or evidence of commercial traction.

| Capability               | Evidence in the current checkout                                                                              | Presentation boundary                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Mission and roles        | `docs/product-vision.md`                                                                                      | Connect shift execution, evidence and accountable decisions                                           |
| QR attendance and shifts | `docs/features/03-attendance-qr-kiosk.md`, `docs/features/04-shift-flow.md`, `packages/domain/src/shift-fsm/` | Recorded attendance and activity; unknown departure stays unknown                                     |
| Scheduling               | `docs/features/05-schedule.md`, `apps/api/src/scheduling/schedule.service.ts`                                 | Planning and publication; rehearse selected scenarios because documentation contains stale statements |
| Checklists and handover  | `docs/features/06-checklists-and-handover.md`, `apps/api/src/handover/handover.service.ts`                    | Photo evidence and recorded human decisions                                                           |
| Incidents                | `docs/features/07-incidents-and-downtime.md`, `apps/api/src/incidents/incidents.service.ts`                   | Reporting and escalation, without a guaranteed reduction in downtime                                  |
| Requests                 | `docs/features/08-requests.md`, `apps/api/src/requests/requests.service.ts`                                   | Approval workflows, not a complete HR suite                                                           |
| Bonus                    | `docs/features/09-bonus.md`, `apps/api/src/bonus/bonus.service.ts`                                            | Rule-based scores and audited adjustments, not payroll                                                |
| Reports and audit        | `docs/features/10-reports-and-audit.md`, `apps/api/src/reports/admin-reports.controller.ts`                   | Recorded time and decisions, not equipment output or OEE                                              |
| Communications           | `docs/features/employee-communications.md`, `apps/api/src/communications/`                                    | Messages/questionnaires; sending does not prove reading                                               |
| Photo review assistance  | `docs/features/photo-inspection.md`, `apps/api/src/photo-inspection/photo-inspection.service.ts`              | AI suggestions subject to human review; no accuracy claim                                             |
| Master agent             | `docs/features/master-agent.md`                                                                               | Proposed direction, not available autonomous management                                               |

These are source-supported descriptions, not fresh production verification or measured customer benefits.

## SPEC: Outcome and Boundaries

### Mission and central problem

Help shift teams act on problems in time and transfer work with clear evidence and responsibility.
Schedules, messages, photos, attendance and decisions can be scattered across tools. Managers must
reconstruct events and the next shift inherits incomplete context. Vakhta connects these records
inside the working shift and its management workflow.

### Audience

- Primary buyers: manufacturing owners, operations directors and production heads. Shift masters
  champion daily adoption; workers, planners, HR, inspectors and accounting participate.
- Adjacent discovery segments: hotel housekeeping/service teams, warehouses, cleaning and facility
  services. Describe possible workflows, subject to process-fit validation. Do not imply hotel
  deployments, room inventory, reservations, PMS, WMS or dispatch features exist.
- Investors: need a product thesis, demonstration and private evidence discussion. Their journey is one of three visible conversion choices alongside demo and pilot requests.
- Poor fit: teams unable to use Telegram/connected devices, or buyers seeking payroll, machine
  telemetry, production planning, OEE or autonomous AI decisions.

### Scope and assumptions

This task delivers specifications, a build plan and equivalent Ukrainian, English and Russian sales
handoffs. Building/publishing the site and contacting prospects are subsequent work.

The future page is a responsive public landing experience in `uk`, `en`, `ru`. Owner decision: offer all three conversion choices: **Request a demo**, **Discuss a pilot**,
**Discuss investment**. All are visible in the opening and contact sections. The workflow link remains
a reading/navigation action. Each conversion has its own explanation and contact context.
Contact v1 uses an owner-confirmed email or booking link plus a visible copyable address. No form,
lead database, CRM, CMS or analytics service is required. Pricing follows qualification; no free
pilot, response SLA or rollout duration is promised. Existing product locale defaults remain unchanged.

### Page information architecture

| Order / stable anchor | Visitor question            | Required content                                                                                |
| --------------------- | --------------------------- | ----------------------------------------------------------------------------------------------- |
| 1 / `top`             | What is Vakhta?             | Plain-language promise, Telegram + panel + QR, demo, pilot and investor CTAs plus workflow link |
| 2 / `problem`         | What problem does it solve? | Scattered records, delayed reaction, incomplete handover                                        |
| 3 / `workflow`        | How does it work?           | Plan → arrival → work and issues → checklist/handover → review/reports                          |
| 4 / `capabilities`    | What can I use?             | Every current capability category from the evidence inventory; AI boundaries                    |
| 5 / `teams`           | Is it for my business?      | Manufacturing first; conditional hotel, warehouse and service examples                          |
| 6 / `demo`            | Can I see it?               | Sanitized real screenshots and a reproducible demonstration                                     |
| 7 / `pilot`           | How do we start?            | Discover, configure a bounded workflow, train, run pilot, review evidence                       |
| 8 / `trust`           | Who decides?                | Human responsibility, scoped access, recorded evidence; factual claims only                     |
| 9 / `investors`       | What is the opportunity?    | Product thesis and expansion hypotheses; private evidence discussion                            |
| 10 / `faq`            | What are the limits?        | Telegram, internet, existing tools, AI, pricing, rollout, hotel fit                             |
| 11 / `contact`        | What next?                  | Demo, pilot and investor choices, verified contact and honest expectations                      |
| Footer                | Who operates the site?      | Confirmed operator, privacy information, languages and panel sign-in                            |

Use a legible operational visual identity and a consistent action hierarchy with all three contact choices visible. Desktop may pair the hero with
an actual product view; mobile stacks narrative before evidence. No autoplay, invented dashboard
numbers, fake customer imagery or decorative AI promises. Expandable details may hold feature depth;
mission, limits and contact remain easy to find.

## User Scenarios and Testing

### US1: Business buyer understands relevance (P1)

- **AC-001**: From the opening and workflow, a new visitor can identify the target team, central
  problem, complete shift journey and next action without signing in.
- **AC-002**: Every capability claim has an internal evidence reference and a rehearsed demonstration
  before publication. Adjacent-industry examples explicitly require process-fit validation.
- **AC-003**: FAQ answers explain Telegram, connectivity, integrations, AI and commercial boundaries
  without presenting proposals or goals as existing results.

### US2: Sales presents the product (P1)

- **AC-004**: All three handoffs contain equivalent positioning, capabilities, landing narrative,
  buyer/pilot/investor scripts, qualification, objections, pilot measures and build plan.
- **AC-005**: Sales can demonstrate schedule → issue → handover → report using authorized demo
  records. No production employee actions or private data are created/exposed for a sales demonstration.

### US3: Visitor changes language (P1)

- **AC-006**: `/uk/`, `/en/`, `/ru/` directly render complete localized copy, metadata, accessible
  labels, captions and sales downloads with the same section structure.
- **AC-007**: Locale switching preserves recognized section anchors and browser Back; no forced
  browser-language redirect occurs, and the operational product default does not change.
- **AC-008**: Missing translations fail publication checks. Unknown anchors leave a usable page;
  root and unsupported language routes expose working language choices.

### US4: Buyer or investor contacts Sales (P1)

- **AC-009**: All three contact intents reach verified destinations with appropriate context. A visible
  copyable contact remains available when no email client is configured.
- **AC-010**: A contact click never displays a submission-success message. No placeholder address,
  unverified booking availability or invented response deadline appears publicly.

### US5: Investor evaluates the thesis (P2)

- **AC-011**: Current capabilities, expansion hypotheses and proposed Master-agent work are distinct.
  Customer counts, revenue, retention, market size, funding ask and use of funds appear only with
  dated supporting evidence and owner clearance for disclosure.

### Edge Cases

- No JavaScript: core copy, language links, FAQ and contact remain accessible.
- Slow/unavailable images: captions and CTA remain readable.
- Long translations, 320px viewport and 200% text zoom: no clipping or page overflow.
- Offline: no promise of offline operational use or delivered contact requests.
- Missing case studies: omit them instead of fabricating testimonials or numerical benefits.
- Unconfirmed contact/assets: planning can finish; public launch waits for those inputs.

## Requirements

### Functional Requirements

- **FR-001**: Explain mission, problem, audience and workflow (AC-001–003).
- **FR-002**: Cover capability categories and limits with evidence (AC-002–003).
- **FR-003**: Supply equivalent trilingual sales material (AC-004–005).
- **FR-004**: Support linkable locale pages and predictable navigation (AC-006–008).
- **FR-005**: Provide verified contact and honest feedback (AC-009–010).
- **FR-006**: Distinguish investor thesis from verified commercial facts (AC-011).
- **FR-007**: Support keyboard access, visible focus, semantic headings, readable contrast, alt text
  and mobile layouts across all visitor journeys.
- **FR-008**: Publish only authorized media and attributable claims (AC-002, AC-005, AC-011).

### Key Entities

No new operational entities. Editorial concepts: localized page, evidence-backed claim, permitted
media asset with caption, versioned sales handoff and configured contact destination.

## Success Criteria

- **SC-001**: Sales and a business reviewer can each explain whom Vakhta serves, its central problem,
  one complete workflow and the next action without help from the author.
- **SC-002**: All three languages pass the same content, navigation and contact checks.
- **SC-003**: Every capability is traceable; no unverified outcome, integration or autonomy is claimed.
- **SC-004**: Sales can deliver customer and investor scripts, propose a pilot and record a concrete next step.

After launch, record qualified conversations and pilot starts by date, language, segment and source
when volunteered. Do not invent conversion or ROI targets before establishing a baseline.

## Verification Scope

Current delivery: source/link review, formatting, translation parity and visual review of exported
documents. No behavior change means no application build, domain tests or employee-action QA.
The implementation plan defines future UI and release verification.
