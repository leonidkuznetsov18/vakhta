# Feature Specification: Product Landing Page and Sales Handoff

**Change**: 010-product-landing-sales | **Created**: 2026-09-18 | **Status**: Implemented; delivery and Sales rehearsal tracked separately
**Baseline**: 811003a | **Checkout**: master
**Authority**: Owner requests a trilingual landing-page plan and specification for Sales to present
Vakhta to business owners and prospective investors.
**Product document**: [Product landing](../../docs/features/product-landing.md)
**Engineering memory**: [Product landing](../../docs/engineering/features/product-landing.md)
**Implementation epic**: [#81](https://github.com/leonidkuznetsov18/vakhta/issues/81) with nine native
child issues; see [task mapping](tasks.md#future-implementation).

## RECON: Current Behavior

Vakhta is a Connected Worker / Frontline Operations platform. Its established domain is continuous
manufacturing with shift teams. Workers use Telegram and QR kiosks; managers use a web panel.
At the planning baseline this checkout had no dedicated marketing application. The implementation now lives in `apps/landing`. Operational documentation does not provide
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

### Owner refinement: manufacturing demand validation

Owner decision, 2026-09-18, supersedes the earlier adjacent-industry positioning. The current landing
serves manufacturing only and tests whether production businesses have sufficient need for Vakhta.
It does not launch the site or authorize prospect outreach as part of this planning/publication task.

### Mission and central problem

Help manufacturers identify recurring causes of downtime and time loss, respond to incidents faster,
and use personnel checklists and evidence-backed handover to reduce avoidable interruptions.
The page leads with operational pain and a concrete problem-to-action workflow, not a broad HR suite.

A production problem can go unreported, wait for a responsible person's response or recur because the
cause and corrective action were not retained. Incomplete checks and handover lose context between
shifts. Vakhta connects worker reports, incident handling, checklists/photos and recorded-time reports.

Bottleneck discovery means identifying recurring recorded loss categories, reasons and affected
units for investigation. Employee activity intervals do not prove machine downtime, line capacity,
root cause or OEE. Reducing downtime is the intended outcome to test, never a demonstrated percentage
or guaranteed result. Do not sum overlapping employee downtime as equipment stop duration.

### Audience

- Manufacturing owners, operations directors and production heads responsible for shift operations,
  incident response and recurring production interruptions. Shift masters are the daily champions;
  frontline personnel and cleanliness/quality reviewers participate.
- Start qualification with the production process, shift organization, reporting method and a recent
  incident. Do not invent company-size bands, proven sectors or customer references.
- Investors may discuss the manufacturing thesis through the retained contact path. Their visits or
  interest do not count as evidence of manufacturing customer demand.
- Hotels, warehouses as standalone businesses, cleaning providers and general service businesses are
  outside the current campaign. Do not publish adjacent-industry cards or expansion pitches.
- Poor fit: buyers requiring automatic equipment telemetry, OEE, production planning, autonomous AI,
  payroll or mandatory integrations before any bounded test; teams unable to use connected devices.

### Scope and assumptions

This task delivers specifications, a build plan and equivalent Ukrainian, English and Russian sales
handoffs. Building/publishing the site and contacting prospects are subsequent work.

The future page is a responsive public landing experience in `uk`, `en`, `ru`. Owner decision: offer all three conversion choices: **Request a demo**, **Discuss a pilot**,
**Discuss investment**. Preserve all three in the opening/contact areas, with the manufacturing pilot
as the strongest action, demo as an alternative and investor contact visually secondary. The workflow
link remains a reading action. This hierarchy does not remove any owner-requested contact intent.
Contact v1 uses an owner-confirmed email or booking link plus a visible copyable address. No form,
lead database, CRM, CMS or analytics service is required. Pricing follows qualification; no free
pilot, response SLA or rollout duration is promised. Existing product locale defaults remain unchanged.

### Page information architecture

| Order / stable anchor | Visitor question                     | Required content                                                                                                            |
| --------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| 1 / `top`             | Where is production losing time?     | Downtime/time-loss and incident-response promise; pilot, demo and secondary investor contact                                |
| 2 / `problem`         | Is this our problem?                 | Late reporting, slow response, recurring reasons, missed checks, incomplete handover                                        |
| 3 / `workflow`        | What changes in the response?        | Report problem → responsible person responds → record actions → check/handover → review recurring losses                    |
| 4 / `capabilities`    | Which tools support that?            | Incident reporting/escalation, time-loss reports, personnel checklists/photos, handover; other features in secondary detail |
| 5 / `teams`           | Who at a production site benefits?   | Owner/production head, shift master, frontline worker, inspector; manufacturing examples only                               |
| 6 / `demo`            | Can I see my problem in the product? | Sanitized incident, checklist/handover and loss-report demonstration                                                        |
| 7 / `pilot`           | How can we test the value?           | One production process, responsible owner, baseline, success measures and agreed commercial discussion                      |
| 8 / `trust`           | What can the records prove?          | Recorded evidence, human accountability, role scope and measurement boundaries                                              |
| 9 / `investors`       | What thesis is being tested?         | Manufacturing demand hypothesis; no expansion or traction claims                                                            |
| 10 / `faq`            | Will it fit our site?                | Phones/Telegram/connectivity, machine data limits, integrations, pricing, incident/checklist workflow                       |
| 11 / `contact`        | What should I tell you?              | Production process, recurring problem and responsible role; three distinct contact intents                                  |
| Footer                | Who operates the site?               | Confirmed operator/privacy/contact, language links and panel sign-in                                                        |

Lead with loss reasons, incident response, checklists and handover. Scheduling, QR attendance,
requests, communications and bonus remain discoverable supporting capabilities, not the hero.
Use real authorized product evidence, no invented savings, machine telemetry or customer stories.

### Owner design reference

Owner decision, 2026-09-18: use Connecteam as a reference for understandable benefit-led presentation,
product evidence, role relevance and adoption. The [design brief](design-reference.md) records freshly
observed public patterns, original Vakhta visual choices and their issue ownership. Preserve the
manufacturing-only experiment, three languages and all three contact intents. Product candidates
remain with workforce epic #3 and never become current-feature claims or landing launch dependencies.

### Demand-validation protocol

- **H1 Problem:** multiple independent manufacturing prospects describe recurring downtime/time-loss
  or delayed incident response and explain their current workaround with a concrete recent example.
- **H2 Fit:** they identify a bounded production process where reporting, checklists and handover
  could improve the situation without an unbuilt mandatory integration.
- **H3 Commitment:** an authorized buyer agrees to a specific next step, names a pilot owner and
  discusses data/time access and commercial terms. Compliments, visits and CTA clicks alone do not qualify.
- Before the campaign, owner/Sales define the initial manufacturing cohort, acquisition channel,
  observation window, review date and continue/adapt/stop thresholds. Record these before collecting
  outcomes; do not choose targets after seeing results or invent them in this planning task.
- A qualified conversation includes company/process, decision role, recent recurring problem, current
  workaround and agreed next step. Deduplicate by company and record source/date/language when known.
- Separate exposure, contacts received, qualified conversations, held demos, agreed pilots, started
  pilots and explicit willingness to discuss payment. Investor and internal/test interest are separate.
- Record objections, no-fit reasons and refusals as well as positive signals. No contacts without
  sufficient reach is inconclusive; do not describe it as proof that manufacturers have no need.
- No tracking service is required: use a manual experiment sheet and known exposure counts where
  available. Never calculate a site conversion rate without a reliable visit/exposure denominator.
- Pilot effectiveness is a later test, distinct from demand: measure recorded response time, repeated
  incident reasons, time-loss records and checklist completeness on comparable scopes. Actual machine
  downtime needs the manufacturer's independent equipment/event evidence and a non-duplicating method.

## User Scenarios and Testing

### US1: Business buyer understands relevance (P1)

- **AC-001**: From the opening and workflow, a new visitor can identify the target team, central
  problem of downtime/time loss, response workflow and next action without signing in.
- **AC-002**: Every capability claim has an internal evidence reference and a rehearsed demonstration
  before publication. Every public industry example targets manufacturing; no adjacent-industry cards remain.
- **AC-003**: FAQ answers explain Telegram, connectivity, integrations, AI and commercial boundaries
  without presenting proposals or goals as existing results.

### US2: Sales presents the product (P1)

- **AC-004**: All three handoffs contain equivalent positioning, capabilities, landing narrative,
  buyer/pilot/investor scripts, qualification, objections, pilot measures and build plan.
- **AC-005**: Sales can demonstrate issue → responsible response → checklist/handover → loss report using authorized demo
  records. No production employee actions or private data are created/exposed for a sales demonstration.

### US3: Visitor changes language (P1)

- **AC-006**: `/uk/`, `/en/`, `/ru/` directly render complete localized copy, metadata, accessible
  labels, captions and sales downloads with the same section structure.
- **AC-007**: Locale switching preserves recognized section anchors and browser Back; no forced
  browser-language redirect occurs, and the operational product default does not change.
- **AC-008**: Missing translations fail publication checks. Unknown anchors leave a usable page;
  root and unsupported language routes expose working language choices.

### US4: Buyer or investor contacts Sales (P1)

- **AC-009**: All three contact intents open the owner-approved recipient with appropriate context.
  Per the owner's explicit override, the email address is hidden from visible copy and appears in the
  composer. A configured email application is required; do not claim a fallback delivery service.
- **AC-010**: A contact click never displays a submission-success message. No placeholder address,
  unverified booking availability or invented response deadline appears publicly.

### US5: Investor evaluates the thesis (P2)

- **AC-011**: Current capabilities, manufacturing demand hypotheses and proposed Master-agent work are distinct.
  Customer counts, revenue, retention, market size, funding ask and use of funds appear only with
  dated supporting evidence and owner clearance for disclosure.

### US6: Owner tests manufacturing demand (P1)

- **AC-012**: Before collecting campaign outcomes, a recorded protocol defines cohort, channel,
  observation window, review date, qualification and continue/adapt/stop thresholds.
- **AC-013**: The first review separates actual manufacturing contacts, qualified conversations and
  pilot commitments from visits, clicks, investor interest and test data; it includes negative evidence.
- **AC-014**: The review reaches an evidence-backed continue/adapt/stop/inconclusive decision. Missing
  reach or outcomes are explicitly unknown. No demand or downtime-saving claim is inferred from a page launch.

### US7: Manufacturing visitor understands the product visually (P1)

- **AC-015**: The page implements the design brief's benefit/evidence structure, worker/manager
  explanation, role relevance and adoption steps using an original Vakhta composition.
- **AC-016**: Every core workflow has readable, authorized Vakhta proof and an adjacent text
  explanation in all three languages; proposed product features remain distinct. Mobile content and
  contact actions are unobstructed, and essential meaning is available without animation or scripts.

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
- **FR-009**: Apply the manufacturing-only campaign and demand-validation protocol (AC-012–014).
- **FR-010**: Apply the owner-selected Connecteam reference through the Vakhta design brief (AC-015–016).

### Key Entities

No new operational entities. Editorial concepts: localized page, evidence-backed claim, permitted
media asset with caption, versioned sales handoff and configured contact destination.

## Success Criteria

- **SC-001**: Sales and a business reviewer can each explain whom Vakhta serves, its central problem,
  one complete workflow and the next action without help from the author.
- **SC-002**: All three languages pass the same content, navigation and contact checks.
- **SC-003**: Every capability is traceable; no unverified outcome, integration or autonomy is claimed.
- **SC-004**: Sales can deliver customer and investor scripts, propose a pilot and record a concrete next step.

- **SC-005**: The first bounded campaign review uses the pre-recorded protocol to make a demand
  decision, including an inconclusive result where exposure or evidence is insufficient (AC-012–014).

Page correctness is necessary to run the experiment; it is not proof of demand. Do not invent ROI,
conversion targets, customer counts or machine-downtime savings.

## Verification Scope

Current delivery: source/link review, formatting, translation parity and visual review of exported
documents. No behavior change means no application build, domain tests or employee-action QA.
The implementation plan defines future UI and release verification.

## Accepted implementation refinements (2026-09-18)

- Use [accepted inputs](publication-inputs.md), including the owner-maintained demand protocol.
- Lead with reducing downtime and incident recurrence, not merely recording problems.
- Show all twelve current capability groups on their own localized pages, with screenshot, steps
  and value. Provide six selectable kiosk/Telegram/panel scenarios and twenty FAQ answers.
- Show actual equipment-photo handover and resolved incident cases alongside clearly labelled
  demo panel overviews. Portraits are original generated manufacturing professions.
- **AC-017**: Image expansion stays on the page in a viewport-filling dialog, loads the full asset,
  supports 100% size and scrolling, closes with Escape, and restores trigger focus. Scenario
  expansion shows the selected scenario. Core content remains available without JavaScript.
- Screenshots currently show the Ukrainian product UI; explanatory copy and controls are trilingual.
  Translated screenshot sets and a complete live worker rehearsal are tracked gaps, not claimed done.
