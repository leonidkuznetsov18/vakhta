# Vakhta future development plan and Connecteam feature map

## Purpose and decision status

Saved at the owner's request on 2026-09-12 for a future planning conversation. This document keeps
the complete researched feature inventory together with a proposed order of development. It is an
idea backlog, not a commitment to build every Connecteam feature, an approved implementation spec,
or an agreed delivery schedule. No development is authorized by saving this plan.

The 90 numbered capabilities below are the reference inventory. Their status reflects the source
snapshot recorded below; recheck the selected area when work resumes. Preserve the distinction
between existing functionality, reliability gaps, extensions and independently valuable modules.

## Proposed development sequence

All entries remain unselected. Priority is a proposal based on manufacturing relevance, existing
Vakhta capabilities and dependencies, rather than measured customer demand.

| Stage / ID | Candidate | Reference capabilities | Small first outcome and completion evidence |
| --- | --- | --- | --- |
| Foundation F1 | Reliable notifications and acknowledgment | 20, 86–88 | Trace an incident to its intended recipient, delivered notice, acknowledgment and fallback; make existing schedule acknowledgment visible. Verify actual delivery rather than only recorded events. |
| Near term M1 | Corrective operational tasks | 36–40 | Link a finding to one owner, deadline and closure evidence. Pilot with real recurring issues and measure unresolved issues and master follow-up effort. |
| Near term M2 | Production instructions and acknowledgment | 46–50, 56–60 | Give each role/zone relevant, versioned instructions and photo examples; acknowledge material changes. Compare instruction retrieval time and repeated questions. |
| Near term M3 | Qualifications, expiring documents and onboarding | 23, 61–68, 79–80 | Track a small set of real qualifications, renewal dates and onboarding steps, with authorized human sign-off. Make missing or expired requirements visible. |
| Near term M4 | Required staffing and coverage | 22–24 | Agree required people and roles per zone/shift, then show shortages and eligible replacements. Check against one real planning cycle before adding blocking rules. |
| Conditional M5 | Richer production forms | 26–35 | Extend current checklists for two or three repeatedly requested processes, adding only needed field types and conditions. Avoid duplicate entry and measure manual follow-up removed. |
| Conditional M6 | Targeted announcements | 41–50, 81 | Reach relevant teams through the existing Telegram channel and collect explicit acknowledgment where necessary. Sending a message alone does not prove reading. |
| Later M7 | Automatic schedule assignment | 21–25 | Suggest a draft from agreed coverage, qualifications, absence and scheduling rules; explain unresolved assignments and retain planner approval. Depends on M3/M4 and adequate data. |
| Later M8 | Operational AI assistant | 59–60, 86–89 | Answer a small set of useful operational questions from permitted, current evidence. Keep product-help AI distinct and retain human verification; reconcile with the separate Master-agent plan before scoping. |

### Deferred and separately scoped ideas

- Corporate chat, social feed, events, celebrations and gift redemption: revisit only if existing
  Telegram communication and recognition demonstrably fail a useful business need.
- GPS, geofencing, movement tracking and NFC: revisit only for a concrete attendance/access problem;
  QR already serves the current workflow. Biometrics requires a separate scope decision.
- General hiring, leave accrual, signatures and HR administration: establish an actual owner and
  repeated workflow before expanding into a broad HR suite.
- A general automation builder, AI course/form generation and an integration marketplace: defer
  until repeated use cases justify a reusable platform.
- Payroll, ERP/MES/access-control integrations, equipment, output and OEE: separate scope decisions
  outside the current MVP. Employee activity intervals do not establish equipment performance.

## Module planning

The intended model is a base product with recurring support and separately scoped future modules.
M1–M8 are candidate module boundaries; combine related needs when that reduces duplicate work.
Define acceptance criteria, support impact and price when a module is selected. Reliability fixes
for already agreed behavior belong to the existing scope, rather than a new paid feature.

## How to resume this plan

1. Review the next representative period of factory use with the owner: recurring problems,
   manual follow-up, missed information and the steps that burden workers.
2. Recheck the current implementation and relevant competitor sources for the selected area.
3. Select one candidate by business value and dependencies; record why others can wait.
4. Define a bounded module: problem, users, current/expected workflow, included and excluded scope,
   permissions, acceptance evidence, pilot measures and support impact.
5. Agree the commercial scope and price before development, then create/update that feature's
   product and engineering documents. Retain this document as the cross-product backlog.

Lean recommendation: **Simplify**. Use the smallest useful module that removes observed waiting,
rework or repeated questions. Do not add worker steps merely to match a competitor's checklist.

## Research snapshot and reading guide

Research date: 2026-09-12. Vakhta source baseline: 4195d82632d3f2be00ffcb2fa2a2ece2e5f5bd1f. This is a comparison of 90 substantive capabilities in 18 publicly documented product areas, not every cosmetic setting or plan quota. Connecteam was researched through official documentation; no account trial was performed. Vakhta was inspected in the current checkout; no tests, deployment checks or production mutations were performed. Existing untracked master-agent specifications are not evidence of implemented functionality.

Present means a source-verified counterpart, not complete product equivalence. Partial identifies a narrower or different implementation. Not found is limited to the inspected runtime/UI/contracts/schema source. Manufacturing relevance is a proposed assessment, not an approved roadmap. Recommendations do not authorize implementation.

## Attendance and time clock

Official sources: [1](https://help.connecteam.com/en/articles/3310664-starting-guide-to-the-time-clock), [2](https://help.connecteam.com/en/articles/6489625-time-clock-must-have-capabilities). Vakhta evidence: V1, V2 below.

| # | Connecteam capability | Vakhta status | Exact current scope | Manufacturing relevance |
| --- | --- | --- | --- | --- |
| 1 | Mobile/desktop clock-in and current attendance | Partial | QR/Telegram attendance and live panel; not direct desktop worker clocking. | High |
| 2 | Time by jobs, projects, clients and sub-jobs | Partial | Time by employee, shift, zone and activity; no generic client/project hierarchy. | High |
| 3 | Paid/unpaid breaks and automatic deductions | Partial | Break/meal intervals and reminders; no configurable wage deduction policy engine. | High |
| 4 | Timesheets, correction requests and manager editing | Present | Audited corrections and shift summaries. | High |
| 5 | Shift notes and attachments including signatures | Partial | Comments and handover photos; no employee e-signature. | High |

## Presence verification, kiosk and NFC

Official sources: [1](https://help.connecteam.com/en/articles/6135619-the-kiosk-app), [2](https://help.connecteam.com/en/articles/11462177-starting-guide-to-nfc-clock-in), [3](https://help.connecteam.com/en/articles/13263966-how-to-set-nfc-events-in-connecteam). Vakhta evidence: V1 below.

| # | Connecteam capability | Vakhta status | Exact current scope | Manufacturing relevance |
| --- | --- | --- | --- | --- |
| 6 | Shared PIN/selfie kiosk with automatic logout | Partial | Paired rotating-QR display that opens Telegram; no PIN/selfie shared worker session. | High |
| 7 | Restrict attendance to selected interfaces | Partial | QR verification plus audited master fallback; no configurable interface policy builder. | Medium |
| 8 | GPS stamps, maps and geofences | Not found | No location-based attendance implementation identified. | Conditional |
| 9 | Breadcrumbs and automatic clock-out rules | Partial | Automatic closure and unknown-departure reconciliation; no movement tracking/geofence closure. | Conditional |
| 10 | NFC site/job tags and external scan events | Not found | Current terminal workflow uses QR. | Conditional |

## Timesheet control, labor cost and payroll

Official sources: [1](https://help.connecteam.com/en/articles/6489625-time-clock-must-have-capabilities), [2](https://help.connecteam.com/en/articles/15944148-what-integrations-does-connecteam-offer). Vakhta evidence: V2, V3 below.

| # | Connecteam capability | Vakhta status | Exact current scope | Manufacturing relevance |
| --- | --- | --- | --- | --- |
| 11 | Payroll periods, reminders and timesheet-day locking | Partial | Bonus period finalization; not general payroll/timesheet locking. | Medium |
| 12 | Pay rates and overtime/payment rules | Partial | Overtime duration/approval and bonus rules; no payroll engine. | Conditional |
| 13 | Timesheet and labor report export | Partial | CSV/XLSX interval-loss reports and bonus/history exports; not equivalent wage-cost reports. | High |
| 14 | Scheduled attendance/payroll report delivery | Not found | On-demand exports exist; no user-configurable report distribution found. | Medium |
| 15 | Payroll integrations and supported payslip connections | Not found | No supported external payroll adapter identified. | Separate decision |

## Schedule creation and publication

Official sources: [1](https://help.connecteam.com/en/articles/4100339-starting-guide-to-the-job-scheduler), [2](https://help.connecteam.com/en/articles/6400563-job-scheduling-must-have-capabilities). Vakhta evidence: V4 below.

| # | Connecteam capability | Vakhta status | Exact current scope | Manufacturing relevance |
| --- | --- | --- | --- | --- |
| 16 | Day/week/month calendars and draft/published shifts | Present | Zone views and worker matrix with versioned publication. | High |
| 17 | Repeating shifts, templates and schedule reuse | Partial | Shift templates and rotation fill; cross-month date-shifting copy not verified. | High |
| 18 | Bulk schedule changes and spreadsheet import/export | Partial | Bulk fill/replace, preview and undo; no general schedule spreadsheet import found. | High |
| 19 | Shift jobs, sites, custom fields, files and shortcuts | Partial | Employee/zone/template assignments; no generic rich shift-attachment/custom-field builder. | Medium |
| 20 | Confirm/reject shifts, notifications and live share links | Partial | Acknowledgment and cannot-attend requests; no public live schedule link/calendar sync found. Acknowledgment administration is not fully exposed in current workspace. | High |

## Staffing coverage and scheduling intelligence

Official sources: [1](https://help.connecteam.com/en/articles/8886939-automatically-assign-shifts-in-connecteam), [2](https://help.connecteam.com/en/articles/12829136-starting-guide-to-scheduling-rules-and-shift-quotas), [3](https://help.connecteam.com/en/articles/9745134-job-schedule-issues). Vakhta evidence: V4, V5 below.

| # | Connecteam capability | Vakhta status | Exact current scope | Manufacturing relevance |
| --- | --- | --- | --- | --- |
| 21 | Open shifts, claims and manager approval | Partial | Extra-shift requests; no published open-shift marketplace. | Medium |
| 22 | Swaps and employee availability | Partial | Consent-based shift swaps and absence requests; no recurring preference/availability calendar. | High |
| 23 | Qualification-based assignment eligibility | Not found | Positions exist; certified skill eligibility does not. | High |
| 24 | Coverage/conflict/rest/hour rules and warnings | Partial | Basic assignment validation and counts; no required staffing baseline or comprehensive scheduling-rule engine. | High |
| 25 | Automatic staffing assignment | Not found | Deterministic rotation fill is not a staffing optimizer. | Later |

## Forms and evidence collection

Official sources: [1](https://help.connecteam.com/en/articles/4225197-starting-guide-to-forms), [2](https://help.connecteam.com/en/articles/6803911-forms-how-to-create-conditional-forms), [3](https://help.connecteam.com/en/articles/11008729-can-i-record-voice-input-in-form-fields), [4](https://help.connecteam.com/en/articles/10714480-how-to-create-a-form-in-connecteam-with-ai). Vakhta evidence: V6 below.

| # | Connecteam capability | Vakhta status | Exact current scope | Manufacturing relevance |
| --- | --- | --- | --- | --- |
| 26 | Reusable form/checklist builder and templates | Partial | Admin-configurable, immutable-versioned production checklists. | High |
| 27 | Text, choice, numeric/date, media, signature and location fields | Partial | CHECK, NOTE and PHOTO only; broader field types not found. | High |
| 28 | Required fields and configurable conditional questions | Partial | Required photos/answers and fixed domain branches; no arbitrary condition builder. | High |
| 29 | Calculated/formula fields | Not found | No generic formula field implementation. | Conditional |
| 30 | Voice form answers and AI file-to-form conversion | Not found | Support voice Q&A is separate from form entry or form generation. | Later |

## Submission processing

Official sources: [1](https://help.connecteam.com/en/articles/5949142-the-operations-hub), [2](https://help.connecteam.com/en/articles/6865546-how-to-view-form-submissions-and-summaries), [3](https://help.connecteam.com/en/articles/8300373-how-do-i-send-a-completed-form-to-a-client-who-is-not-a-user-in-connecteam). Vakhta evidence: V6, V3 below.

| # | Connecteam capability | Vakhta status | Exact current scope | Manufacturing relevance |
| --- | --- | --- | --- | --- |
| 31 | Submission tables, filters and insights | Present | Handover, incident and photo review lists; domain-specific rather than arbitrary forms. | High |
| 32 | Approval/rejection and manager status/comments | Present | Master decisions, remarks and preserved review history. | High |
| 33 | Automatic routing or external email sharing | Partial | Fixed domain routes and Telegram notifications; no configurable external sharing. | Medium |
| 34 | Reminders, submission limits/windows and follow-up | Partial | Domain deadlines/reminders/guards; no general form policy builder. | High |
| 35 | Form PDF/Excel exports and scheduled summaries | Partial | Domain exports exist; no arbitrary submitted-form PDF/Excel and scheduled-summary engine. | Medium |

## Tasks and execution

Official sources: [1](https://help.connecteam.com/en/articles/6475029-create-single-and-multiple-tasks), [2](https://help.connecteam.com/en/articles/8527883-group-tasks), [3](https://help.connecteam.com/en/articles/6475064-quick-tasks-recurring-tasks), [4](https://help.connecteam.com/en/articles/6474694-quick-tasks-task-description-and-comment-board), [5](https://help.connecteam.com/en/articles/9362458-what-is-the-difference-between-quick-tasks-and-the-shift-tasks-in-the-schedule). Vakhta evidence: V7 below.

| # | Connecteam capability | Vakhta status | Exact current scope | Manufacturing relevance |
| --- | --- | --- | --- | --- |
| 36 | Ad hoc tasks with owner, start/due dates and location | Not found | Incidents and requests exist, but no general operational task model. | High |
| 37 | Group tasks and per-worker task copies | Not found | No user-facing general task assignment system. | Conditional |
| 38 | Subtasks, attachments and task discussions | Not found | Evidence/history belong to incidents and handovers instead. | Medium |
| 39 | Recurring daily/weekly/monthly tasks | Not found | Technical background jobs are not employee tasks. | High |
| 40 | Progress, overdue views, labels, exports and shift tasks | Partial | Action queues and domain checklists; no general task lifecycle. | High |

## Internal chat

Official sources: [1](https://help.connecteam.com/en/articles/5951839-the-communication-hub), [2](https://help.connecteam.com/en/collections/3425366-the-communication-hub). Vakhta evidence: V8 below.

| # | Connecteam capability | Vakhta status | Exact current scope | Manufacturing relevance |
| --- | --- | --- | --- | --- |
| 41 | Private chats, team chats and broadcast channels | Partial | Admin-to-one-employee Telegram messages; no built-in corporate chat/channel model. | Low |
| 42 | Media, polls and read receipts | Partial | Domain media and sent-message tracking; no polls or Telegram read receipts. | Medium |
| 43 | Scheduled messages, pinning and deep links | Partial | Domain reminders/deep links; no general scheduled conversation tools. | Low |
| 44 | Communication permissions and team restrictions | Partial | Roles restrict existing message action; no team-chat policy system. | Medium |
| 45 | AI translation and voice-message transcripts | Not found | Support voice processing is a different flow. | Conditional |

## Announcements, feedback and events

Official sources: [1](https://help.connecteam.com/en/articles/5951839-the-communication-hub), [2](https://help.connecteam.com/en/articles/6514885-set-up-guide-for-cleaning-companies-communications-hub). Vakhta evidence: V8 below.

| # | Connecteam capability | Vakhta status | Exact current scope | Manufacturing relevance |
| --- | --- | --- | --- | --- |
| 46 | Company feed with posts, media and engagement | Not found | No announcement/feed publishing model. | Medium |
| 47 | Read analytics and mandatory acknowledgment | Partial | Schedule-specific acknowledgment only; message sent status is not acknowledgment. | High |
| 48 | Scheduled/recurring targeted posts and topics | Not found | No configurable announcement campaigns. | Medium |
| 49 | Anonymous surveys and live polls | Not found | Photo AI-feedback rating is not an employee survey module. | Low |
| 50 | Events, RSVP, capacity and participant export | Not found | No corporate event-management flow. | Low |

## Directory and internal help desk

Official sources: [1](https://help.connecteam.com/en/articles/5951839-the-communication-hub), [2](https://help.connecteam.com/en/articles/9725892-starting-guide-to-the-help-desk), [3](https://help.connecteam.com/en/articles/9726353-adding-managing-help-desks). Vakhta evidence: V8, V9 below.

| # | Connecteam capability | Vakhta status | Exact current scope | Manufacturing relevance |
| --- | --- | --- | --- | --- |
| 51 | Searchable employee directory | Partial | Admin employee records/contact links; no employee-facing directory. | Medium |
| 52 | External work contacts | Not found | No supplier/departmental contact directory model. | Low |
| 53 | Contact/profile visibility controls | Partial | Role/scope access exists; no configurable employee-directory field visibility. | Medium |
| 54 | Department help desks with representatives | Partial | Structured requests and product support; no configurable departmental desks. | Conditional |
| 55 | Help-desk assignment and query tracking | Partial | Fixed request routing/history; no agent-assigned threaded help-desk workflow. | Conditional |

## Knowledge and company AI

Official sources: [1](https://help.connecteam.com/en/articles/5951839-the-communication-hub), [2](https://help.connecteam.com/en/articles/11112114-connecteam-s-knowledge-base-agent-your-company-s-ai-assistant). Vakhta evidence: V10 below.

| # | Connecteam capability | Vakhta status | Exact current scope | Manufacturing relevance |
| --- | --- | --- | --- | --- |
| 56 | Company knowledge folders, pages, files and links | Partial | Product guides/FAQ; no admin-editable company SOP library. | High |
| 57 | Knowledge assignment by worker/group | Not found | No general content-assignment workflow. | High |
| 58 | Knowledge search/read insights | Partial | AI product Q&A; no company KB readership dashboard. | Medium |
| 59 | Source-based company AI agents and custom instructions | Partial | Implemented product help assistant; no live shift/employee/score access or arbitrary company resource selection. | High |
| 60 | Multiple targeted agents and automatic knowledge updates | Partial | Repository knowledge loading exists; no admin-created agent catalogue. | Later |

## Learning and competency checks

Official sources: [1](https://help.connecteam.com/en/articles/6385698-starting-guide-to-courses), [2](https://help.connecteam.com/en/articles/6451819-starting-guide-to-quizzes), [3](https://help.connecteam.com/en/articles/9556009-how-to-view-quiz-entries), [4](https://help.connecteam.com/en/articles/12517029-our-ai-tools-a-complete-guide). Vakhta evidence: V9, V10 below.

| # | Connecteam capability | Vakhta status | Exact current scope | Manufacturing relevance |
| --- | --- | --- | --- | --- |
| 61 | Courses with text, files, videos, forms and quizzes | Not found | Product help is not tracked learning. | High |
| 62 | Sections, ordered release and deadlines | Not found | No learning assignment/completion model. | High |
| 63 | Read/watch confirmation and completion tracking | Not found | No employee training completion ledger. | High |
| 64 | Quizzes, pass marks, attempts and result exports | Not found | No employee assessment system. | High |
| 65 | Course templates and AI course creation | Not found | First establish useful training before AI generation. | Later |

## Employee documents and signatures

Official sources: [1](https://help.connecteam.com/en/articles/5957871-introduction-to-the-hr-hub), [2](https://help.connecteam.com/en/articles/13628062-e-signatures-for-document-signing). Vakhta evidence: V9 below.

| # | Connecteam capability | Vakhta status | Exact current scope | Manufacturing relevance |
| --- | --- | --- | --- | --- |
| 66 | Document packs and employee uploads | Partial | Restricted sick-leave attachments only; no general employee document packs. | High |
| 67 | Review, permissions and missing-document visibility | Partial | Sensitive attachment access exists; no general document checklist. | High |
| 68 | Expiry dates and renewal follow-up | Not found | No certificate/license expiry registry. | High |
| 69 | Fillable/signable PDF and profile prefill | Not found | No employee e-sign workflow. | Conditional |
| 70 | Multiple signers, signing order and audit | Not found | Audit logs are not document signing. | Conditional |

## Leave and absence

Official sources: [1](https://help.connecteam.com/en/articles/6713889-starting-guide-to-time-off). Vakhta evidence: V5, V9 below.

| # | Connecteam capability | Vakhta status | Exact current scope | Manufacturing relevance |
| --- | --- | --- | --- | --- |
| 71 | Paid/unpaid categories and leave requests | Partial | Fixed vacation/sick/day-off request types; no customizable entitlement policies. | High |
| 72 | Approve/decline with available balances | Partial | Approval exists; accrued available balance does not. | High |
| 73 | Hourly/day accrual and tenure-based allowance | Not found | No accrual ledger or policy engine. | Conditional |
| 74 | Carryover, negative balance and request-limit policies | Not found | No configurable entitlement rules. | Conditional |
| 75 | Attachments, history, balance export and schedule visibility | Partial | Attachments/history and approved schedule changes; no balance log. | High |

## Hiring and onboarding

Official sources: [1](https://help.connecteam.com/en/articles/13311464-starting-guide-to-hiring), [2](https://help.connecteam.com/en/articles/12801593-starting-guide-to-the-onboarding-feature). Vakhta evidence: V9 below.

| # | Connecteam capability | Vakhta status | Exact current scope | Manufacturing relevance |
| --- | --- | --- | --- | --- |
| 76 | Public vacancies, application fields and CV uploads | Not found | No candidate/application system. | Conditional |
| 77 | Candidate stages, notes and rejection reasons | Not found | No recruiting pipeline. | Conditional |
| 78 | Convert successful applicant to employee | Not found | Employee import/create exists, not candidate conversion. | Conditional |
| 79 | Onboarding packs: information, documents, policies, tasks | Not found | Telegram activation is identity linking, not onboarding. | High |
| 80 | Onboarding completion, missing items and approval/reopen | Not found | No onboarding process state. | High |

## People organization and platform administration

Official sources: [1](https://help.connecteam.com/en/articles/6114686-smart-groups-and-segments), [2](https://help.connecteam.com/en/articles/10321251-starting-guide-to-org-chart), [3](https://help.connecteam.com/en/articles/5956786-starting-guide-to-the-timeline), [4](https://help.connecteam.com/en/articles/5956739-starting-guide-to-rewards), [5](https://help.connecteam.com/en/articles/6419701-checking-your-account-activity-with-connecteam), [6](https://help.connecteam.com/en/articles/6141378-the-enterprise-plan). Vakhta evidence: V9, V11 below.

| # | Connecteam capability | Vakhta status | Exact current scope | Manufacturing relevance |
| --- | --- | --- | --- | --- |
| 81 | Custom profiles, tags and automatic Smart Groups | Partial | Fixed employee fields and dated structural assignments; no custom-field/group rule engine. | High |
| 82 | Org chart and hierarchy export | Partial | Organization/manager relationships exist; no org-chart visualization/export found. | Low |
| 83 | Unified employee timeline | Partial | Position history, bonus history and audit; no consolidated HR timeline. | Medium |
| 84 | Recognition, celebrations and gift-card rewards | Partial | Operational points/awards/monthly nominations; no gift redemption or birthday automation. | Low |
| 85 | Web/mobile admin, branding, access, logs, SSO and app lock | Partial | Responsive panel, roles/scopes, audit, TOTP; no native admin app or SSO/SAML/OIDC integration found. | High |

## Automation, AI productivity and integrations

Official sources: [1](https://help.connecteam.com/en/articles/13438104-starting-guide-to-automations), [2](https://help.connecteam.com/en/articles/15701250-automations-common-use-cases), [3](https://help.connecteam.com/en/articles/12517029-our-ai-tools-a-complete-guide), [4](https://help.connecteam.com/en/articles/15944148-what-integrations-does-connecteam-offer), [5](https://developer.connecteam.com/docs/api-access). Vakhta evidence: V7, V10, V11 below.

| # | Connecteam capability | Vakhta status | Exact current scope | Manufacturing relevance |
| --- | --- | --- | --- | --- |
| 86 | Cross-module trigger/action workflows | Partial | Fixed domain transitions, timers, outbox and recovery; no user-configurable automation builder. | High |
| 87 | Conditions, delays, recurrence, AI building and run logs | Partial | Fixed execution infrastructure; no general business-flow editor. | Later |
| 88 | Messages, SMS, phone calls and NFC triggers | Partial | Telegram transport exists; SLA event persistence is not proof of delivered escalation; no SMS/call/NFC stack found. | High |
| 89 | AI content drafting, translation and generation | Partial | Product support and specialized photo analysis; no announcement/form/course generator. | Later |
| 90 | Public APIs, webhooks, Zapier and payroll/HR/POS adapters | Partial | Internal authenticated HTTP APIs and Telegram/provider integrations; no packaged customer integration platform. | Separate decision |

## Differentiation and limitations

No capability was proven globally unique. Strong combinations include shared Smart Groups, qualification-aware staffing, configurable forms, cross-module automation, embedded knowledge agents and NFC-linked actions.

Vakhta has a specialized, guarded production shift lifecycle and human-controlled photo inspection, including object rules, drawn regions, AI suggestions, versioned human reviews and usefulness feedback. No matching industrial-photo inspection workflow was found in reviewed Connecteam material. Connecteam's AI file-to-form conversion digitizes documents; it is not evidence of scene defect detection. Photo-inspection accuracy and production benefit were not measured in this research. See V12.

The current Vakhta handover decision belongs to the shift master; the incoming worker review method is legacy and was not found exposed in the current bot. The former six report tabs were removed; do not market them as present. Current reporting centers on time intervals/losses, bonus history and audit. Employee activity time is not equipment downtime, throughput or OEE.

Connecteam caveats:

- [Standard attendance needs internet](https://help.connecteam.com/en/articles/16287971-does-the-time-clock-support-offline-mode); custom physical-clock API integrations are a separate offline exception. Vakhta also has no verified offline attendance queue; an offline indicator is not offline operation.
- [Ukrainian is absent from the published interface language lists](https://help.connecteam.com/en/articles/5365277-configure-your-preferred-language); this was not checked in an installed app. Vakhta has uk/en/ru catalogs.
- Automations remains Beta with gradual rollout. Advanced/Expert and purchased hubs affect available actions; notification calls use SMS credit.
- API access needs Expert or higher for the relevant hub. AI agents require Communications Expert according to the help article. Some AI file-to-form plan descriptions conflict between the pricing matrix and feature guide; confirm entitlement rather than promise a tier.
- NFC commonly means a phone scanning a site tag. Kiosk selfie capture is not proof of biometric identity recognition.
- [Help Desk priorities are not supported](https://help.connecteam.com/en/articles/10903814-can-i-prioritize-help-desk-tickets); pinning is documented as a workaround.
- Generic e-signatures, payroll adapters, US onboarding documents and gift-card catalogues do not establish Ukrainian legal, payroll or regional compatibility.
- An obligatory clock-out confirmation field is not proof a particular form was actually completed: [documented approach](https://help.connecteam.com/en/articles/9293586-how-can-i-set-requirements-for-completing-a-form-before-clocking-out). Newer custom workflows need a scenario test.

## Proposed Lean priorities

These are hypotheses. Validate each with the plant owner before making it a paid module or adding worker steps. Apply [standardized work](https://www.lean.org/lexicon-terms/standardized-work/) with attention to the actual task and burden.

| Decision | Opportunity | Smallest useful scope | Evidence to collect | Burden/guardrail |
| --- | --- | --- | --- | --- |
| Proceed with verification | Complete existing incident escalation | Trace event through named recipient, delivery, acknowledgment and fallback; surface existing schedule acknowledgment controls | Missed critical notices, delivery and acknowledgment times in a representative pilot | Fix agreed behavior as reliability work; do not sell a defect as a new feature. Source event alone proves no push delivery. |
| Simplify | Corrective operational tasks | One finding creates one accountable task with due date and evidence of closure, reusing incidents | Reopened/unresolved issues and master follow-up time over several shift cycles | Avoid a second parallel incident tracker or duplicated employee input. |
| Proceed to discovery | Position/zone instructions and acknowledgment | Versioned SOP, relevant photo examples and acknowledgment on actual change | Repeat questions, observed errors and retrieval time before/after a small pilot | Do not require repetitive daily confirmation of unchanged material; reading is not skill proof. |
| Proceed to discovery | Competence, document expiry and onboarding | Record a few real qualifications, validity, required learning and authorized sign-off | Manual qualification checks, expired documents, uncovered eligible roles | Owner defines authorization policy; quiz/AI output alone does not authorize hazardous work. |
| Simplify | Staffing coverage | Define required people/roles by zone and shift; show unmet requirements | Planner time and uncovered assignments across a real planning cycle | Counts alone are not staffing requirements. Do not restore previously removed blocking rules without a new decision. |
| Defer until repeated need | Richer forms and automation | Extend current checklist types for two or three demonstrated processes | Form changes requiring development and duplicated data entry | Start with useful fields/rules; avoid an unrestricted low-code platform. |
| Defer | Automatic roster optimizer and operational AI agent | Build only after staffing constraints/data quality and permission boundaries are defined | Manual scheduling bottleneck or repeated operational query pattern | Current product support assistant is not an operational agent; preserve human decisions. |
| Defer | Corporate chat, events, celebrations and gift marketplace | Consider only if existing Telegram and current awards fail an actual need | Actual adoption/communication gap | Avoid duplicating channels and engagement work without production benefit. |
| Separate decision | Payroll, ERP/MES, equipment/production/OEE integrations | Explicit business case and integration scope | Owner-approved requirement and external system access | Outside current MVP; worker intervals cannot establish equipment metrics. |

## Source evidence in Vakhta

V1 — Attendance/kiosk: [challenge and pairing](../../apps/api/src/kiosk/kiosk.service.ts:39), [arrival/departure](../../apps/api/src/attendance/attendance.service.ts:176), [master fallback](../../apps/api/src/attendance/attendance.service.ts:235), [kiosk UI](../../apps/qr-kiosk/src/main.ts:251).

V2 — Shift states, reminders and corrections: [transition rules](../../packages/domain/src/shift-fsm/machine.ts:128), [summary](../../packages/domain/src/shift-fsm/summary.ts:19), [closure](../../apps/api/src/shift/shift-auto-close.service.ts), [corrections](../../apps/api/src/requests/requests.service.ts:314), [overtime](../../apps/api/src/requests/requests.service.ts:386).

V3 — Reports: [loss report](../../apps/api/src/reports/losses.service.ts:45), [CSV/XLSX export](../../apps/api/src/reports/losses.service.ts:104), [removed old reports](../../apps/api/src/reports/reports.service.ts:25), [bonus history exports](../../apps/api/src/bonus/admin-bonus.controller.ts:78).

V4 — Schedule: [views and planning](../../apps/admin-web/src/features/schedule-management/model/planning.ts:23), [rotation patterns](../../apps/admin-web/src/features/schedule-management/model/grid.ts:190), [editor state](../../apps/admin-web/src/features/schedule-management/model/store.ts), [template service](../../apps/api/src/scheduling/templates.service.ts:41), [validation](../../apps/api/src/scheduling/schedule.service.ts:373), [publication](../../apps/api/src/scheduling/schedule.service.ts:479), [acknowledgment](../../apps/api/src/scheduling/schedule.service.ts:817).

V5 — Requests: [routes](../../packages/domain/src/requests/routes.ts:48), [swaps and approved absences](../../apps/api/src/requests/requests.service.ts:773), [swap candidates](../../apps/api/src/requests/requests.service.ts:585).

V6 — Checklists/handover: [versioned definition](../../packages/contracts/src/checklists.ts:60), [field kinds and validation](../../packages/domain/src/handover/checklist.ts:24), [master-only review](../../apps/api/src/handover/handover.service.ts:310), [master decision](../../apps/api/src/handover/handover.service.ts:621).

V7 — Incidents/attention: [incident creation](../../apps/api/src/incidents/incidents.service.ts:158), [SLA event](../../apps/worker/src/timers/incident-sla.ts:49), [downtime event](../../apps/worker/src/timers/shift-timers.ts:61), [panel-based master visibility](../../apps/api/src/shift/shift.service.ts:1105), [action queues](../../apps/admin-web/src/features/overview/model/attention.ts:13). Runtime-source references to INCIDENT_REPORTED, INCIDENT_ESCALATED, INCIDENT_SLA_BREACHED and DOWNTIME_ESCALATED did not identify an outbound master notification consumer. This is a source finding, not a live delivery test.

V8 — Communications: [individual message API](../../apps/api/src/identity/admin-employees.controller.ts:139), [audited Telegram outbox send](../../apps/api/src/identity/employees.service.ts:430), [outbox states](../../packages/db/src/schema/notifications.ts:14), [schedule acknowledgment](../../apps/api/src/telegram/bot.factory.ts:1230).

V9 — People/HR: [fixed identity fields/history](../../packages/db/src/schema/identity.ts:20), [employee API/import](../../apps/api/src/identity/admin-employees.controller.ts:61), [roles/scopes](../../packages/domain/src/access/roles.ts:5), [medical attachment](../../apps/api/src/requests/requests.service.ts:108), [bonus awards](../../packages/db/src/schema/bonus.ts:175), [monthly nominations](../../packages/domain/src/bonus/month-nominations.ts:18).

V10 — Knowledge/AI support: [repository knowledge loading](../../apps/api/src/support/knowledge.service.ts:64), [explicit data boundary](../../apps/api/src/support/support.service.ts:32), [voice flow](../../apps/api/src/support/support-bot.factory.ts:74).

V11 — Platform: [TOTP configuration](../../apps/api/src/auth/auth.config.ts:54), [languages](../../packages/domain/src/locale.ts:2), [configured backup workflow](../../.github/workflows/db-backup.yml:6). Backup enablement and recent recovery success were not checked. Existing internal APIs and Telegram/provider integration are not a public integration marketplace.

V12 — Specialized photo review: [manual versioned save](../../apps/api/src/photo-inspection/photo-inspection.service.ts:265), [explicit analysis request](../../apps/api/src/photo-inspection/photo-inspection.service.ts:344), [run feedback](../../apps/api/src/photo-inspection/photo-inspection.service.ts:426), [library](../../apps/api/src/photo-inspection/photo-library.service.ts:64), [object detection prompt](../../apps/worker/src/photo-inspection/gemma.ts:64), [prediction processing](../../apps/worker/src/photo-inspection/tasks.ts:105).

Absence searches covered application runtime, UI, contracts, schema and domain terms for courses, quizzes, hiring, qualifications, expiration, balances, Smart Groups, announcements, chat, tasks, generic automations, SSO and external integration adapters. A schema match or an unexposed method alone was not counted as an end-to-end feature. Existing test files were sometimes read for intent, but none was executed for this research.
