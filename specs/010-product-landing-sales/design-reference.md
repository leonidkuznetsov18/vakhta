# Connecteam reference and Vakhta design direction

**Date:** 2026-09-18. **Status:** implementation brief, not a delivered interface.
**Authority:** owner asks to adopt Connecteam's design and approach for a more understandable and
appealing landing page and product. Manufacturing-only positioning and demand validation remain primary.

This brief supplements [spec.md](spec.md) and [plan.md](plan.md). It is the design input for #83, #84,
#86 and #88 under [epic #81](https://github.com/leonidkuznetsov18/vakhta/issues/81). Product candidates
remain with [workforce epic #3](https://github.com/leonidkuznetsov18/vakhta/issues/3), not landing dependencies.

## Reference evidence

Fresh public-page review on 2026-09-18; no authenticated Connecteam account or private product trial.
The homepage and forms hero were visually inspected in desktop Chrome; the forms hero was also
inspected at 390 × 844. Page text/navigation was read for all three sources. This is a bounded design
review, not a full accessibility/performance audit. No competitor media is included in Vakhta assets.

| Source                                                                | Observed presentation                                                                                                                                                                                                                                                | Transferable lesson                                                                                                              |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [Connecteam homepage](https://connecteam.com/)                        | A large centered outcome headline, worker imagery, light surfaces, dark display type, blue filled/outlined actions, recurring contact choices, role-specific content, customer evidence and adoption explanations                                                    | Explain the problem and role value quickly; repeat the next step after useful evidence                                           |
| [Forms and checklists](https://connecteam.com/forms-checklist-app/)   | A split desktop hero pairs benefit copy with desktop/mobile product views. Creation, completion, follow-up and records are explained as a workflow. On mobile the hero stacks copy and actions; a chat overlay covered part of the lower content in this observation | Pair each promise with a readable real screen; explain both worker action and manager response; keep mobile content unobstructed |
| [Manufacturing](https://connecteam.com/industries/manufacturing-app/) | Industry-specific language and worker imagery connect reporting, management, knowledge and training; trial/demo choices recur                                                                                                                                        | Use one manufacturing story and a low-friction next step appropriate to Vakhta's actual offer                                    |

Connecteam's leadership, customer counts, savings, certifications and rollout claims are vendor
statements, not independently established facts in this review. Their public pages also display
different customer totals. None of those figures or promises transfers to Vakhta.

The existing [deep product research](../../docs/research/2026-09-13-connecteam-deep-research.md) and
[candidate contracts](../003-connecteam-workforce-discovery/spec.md) remain dated inputs. Recheck the
actual Vakhta source and selected competitor behavior before implementing a product candidate.

## Adaptation decisions

| Pattern                     | Vakhta decision                                                                                                                 | Delivery owner |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Benefit before feature name | Each core section explains the production problem, supported action, visible evidence and next step                             | #83, #86       |
| Desktop plus worker view    | Pair a real incident/review/report crop with the related Telegram worker step; label roles and sequence                         | #83, #84       |
| Clear visual hierarchy      | Large short headline, concise paragraph, primary pilot action, outlined demo action and secondary investment link               | #84, #86       |
| Role-specific relevance     | Explain owner/production head, shift master and worker value within the same manufacturing scenario                             | #83, #86       |
| Product walkthrough         | Show one incident-to-review story. Use stills as the baseline; an authorized short video is optional, never a launch dependency | #83, #86       |
| Contextual conversion       | Repeat pilot/demo after the workflow and pilot explanation. Retain all three intents in hero/contact                            | #84, #87       |
| Adoption explanation        | Show what the worker, master and pilot owner need to do; address Telegram, connectivity and training                            | #83, #86       |
| Credibility                 | Use authorized product evidence and explicit human review. Add customer evidence only when dated and permitted                  | #83, #88       |

Do not transplant the competitor's logo, copy, images, customer badges or exact page composition.
Do not reproduce its industry directory, broad HR pitch, free-plan/trial promises, chat overlays,
large mega-menu or decorative video wall. Those do not help this bounded manufacturing experiment.
No manufactured customer wall, rating stars, certification strip or numerical savings counter.

## Visual direction for Vakhta

Proposed landing tokens, to be checked in #84; these are original choices, not sampled Connecteam values.
Keep operational screenshots' existing semantic colors intact. Landing tokens do not redesign the panel.

| Token           | Starting value | Purpose                                                      |
| --------------- | -------------- | ------------------------------------------------------------ |
| Canvas          | `#FFFFFF`      | Main reading surface                                         |
| Section surface | `#F3F6FA`      | Separate related content without heavy boxes                 |
| Text            | `#172033`      | Headlines and body text                                      |
| Secondary text  | `#475569`      | Captions and supporting explanation                          |
| Action          | `#1D4ED8`      | Contact and navigation emphasis                              |
| Border          | `#CBD5E1`      | Grouping and image frames, not the sole control-boundary cue |

Use a Cyrillic-capable sans-serif family: prefer the existing licensed workspace face; otherwise use
the system sans stack. One family, deliberate weight contrast, 16–18px body text, 1.5 line height,
approximately 60–70 characters per prose line. Suggested H1: 48–64px desktop and 32–40px mobile;
final sizes must accommodate real Ukrainian and Russian strings without forced English line breaks.

Content width approximately 1200px, 24–32px desktop gutters and 16–20px mobile gutters. Use 64–96px
section spacing on desktop and 40–56px mobile. These are design starting values, not fixed-height rules.
Contact targets have at least a 44px usable height. Keep visible focus and sufficient text/control
contrast; semantic states require labels/icons, not color alone.

Use broad sections and a few purposeful image frames with 12–16px radii. Avoid reducing the whole
page to identical feature cards. Product evidence is the memorable visual: a worker report connected
to the master's response and recorded loss context. Manufacturing photographs provide context only.

## Page composition and behavior

Keep the stable anchors and full locale content from the specification. Compact header navigation
links to workflow, capabilities, pilot and FAQ, with locale selection and sign-in separated from Sales.
The desktop hero is left aligned and pairs the agreed headline with one original product composition.
On mobile, use headline → explanation → contact actions → legible product evidence. Do not compress a
full desktop table into a phone-sized thumbnail as the only proof.

```text
Desktop
[Brand] [Workflow] [Capabilities] [Pilot] [FAQ] [Language] [Sign in]
[Headline and short explanation]    [Telegram report + panel response]
[Pilot] [Demo] [Investor link]      [Plain caption stating demo context]
[Recognizable production problems]
[Report → response → checks/handover → investigate recurring losses]
[Outcome + concise evidence]       [Readable product detail]
[Readable product detail]          [Next outcome + concise evidence]
[Owner / production head] [Shift master] [Worker]
[Demo] [Bounded pilot] [Trust] [Secondary investor section]
[FAQ] [Contact choices] [Operator footer]

Mobile
[Brand] [Language] [Menu]
[Headline, explanation, three contact choices]
[Worker evidence, then manager evidence with captions]
[Same sections in one reading column]
[Contact choices and readable footer]
```

Core capability sections, in the existing `capabilities` area:

1. **Investigate recurring losses:** a real report and recorded reason, with scope/period/units readable.
   Explain what the manager can investigate; no equipment telemetry or automatic root-cause claim.
2. **Respond to incidents:** report, responsible role and recorded handling history. Show the actual
   demonstrated states; do not imply a corrective-task workflow exists just because it is proposed.
3. **Make personnel checks clear:** show supported checklist setup alongside worker completion,
   comments/photos and review. Explain the action, not the field-schema implementation.
4. **Retain context between shifts:** evidence and unresolved matters with a human decision.

Each gets a short outcome heading, at most three supporting points, one relevant screen/caption and a
clear reading or contact action. Supporting schedules/attendance/requests/communications/bonus live
in a compact secondary area. All essential content remains in HTML, including when scripts fail.

Role explanations use the same evidence: the production head investigates repeated loss reasons;
the master sees what needs a response; the worker knows how to report, check and hand over. Keep all
three readable by default. Role tabs or chapter selectors are optional progressive enhancement;
if used, they must support keyboard/focus, retain fallback content and never auto-rotate.

Media is permissioned Vakhta evidence with demo data, date, revision and locale, not a competitor
screenshot with the logo changed. If a screen does not support the promised behavior, revise the
claim or use an explicitly labeled future concept outside current capability proof. Prefer separate
mobile crops and adjacent text explanations. Video, if later supplied, is user-started with captions,
a text alternative and reduced-motion support. Images reserve their space and load without hiding CTAs.

## Product adoption candidates with existing owners

These are proposed priorities for discovery, not approved implementations or public landing promises.
Use existing C1–C4 and UX-01–06 contracts instead of creating a second roadmap. Current implementation
status must be rechecked when an issue is selected.

| Suggested order   | Candidate and benefit                                                                                    | Existing owner                                                                                                                 | Evidence to collect                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| First             | Make urgent work and the next responsible action easy to find; keep delivery and acknowledgment distinct | [#53](https://github.com/leonidkuznetsov18/vakhta/issues/53), C1                                                               | Missed/late response reasons, notice failures and time spent finding the relevant record |
| First             | Reduce checklist authoring uncertainty with worker preview and a few validated production examples       | [#41](https://github.com/leonidkuznetsov18/vakhta/issues/41), [#42](https://github.com/leonidkuznetsov18/vakhta/issues/42), C3 | Existing customer checklists, setup/completion difficulty and missing required evidence  |
| Next if confirmed | Link an incident or failed check to accountable corrective work without re-entering evidence             | [#43](https://github.com/leonidkuznetsov18/vakhta/issues/43), C2                                                               | How work is assigned, handed over, returned and verified today; owner and review policy  |
| Next if confirmed | Put short approved instructions beside the task or check that needs them                                 | [#47](https://github.com/leonidkuznetsov18/vakhta/issues/47), C4                                                               | Repeated questions, retrieval difficulty, revision ownership and language approval       |

Template examples are authored and validated for the specific factory; they are not universal safety
procedures. Adding templates, general tasks or instructions to the product requires the corresponding
bounded feature plan. The landing can launch using current evidence while these issues remain open.

## Acceptance and handoff

- **DR-01 / AC-015:** design contains the original split hero, benefit/evidence sections, manufacturing
  role explanations, adoption steps and contextual CTAs; no adjacent-industry expansion or cloned assets.
- **DR-02 / AC-016:** every core promise has readable current Vakhta proof with worker/manager context;
  roadmap concepts remain separate. Mobile crops, captions and text work in all three languages.
- **DR-03 / FR-007:** #84 supplies desktop/mobile layouts with long translations, focus and no overlay
  obscuring content. #88 captures and inspects every affected section per the existing verification matrix.
- **DR-04:** Sales and a manufacturing reviewer can identify the production problem, next responsible
  action and pilot contact path without explanation. Record misunderstandings and fix copy before launch;
  this comprehension check is not demand evidence.
- **DR-05:** validate the chosen visual tokens, all CTA destinations, and role/media fallback behavior.
  Keep mandatory static HTML and current Russian operational default unchanged.

The current five-page Sales exports keep their accepted positioning. This design brief adds visual
requirements; it does not require re-exporting unchanged sales copy. Future public media/downloads
are handled by #83 and #87. No application, hosting, competitor account or prospect outreach is changed.
