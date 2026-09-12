# Product roadmap and issue navigation

This index organizes planned work and research. It does not describe shipped product behavior.
GitHub is the live authority for issue state and progress; this document records the initial grouping.
Source requirements remain in their existing product and engineering documents.

## Naming and hierarchy

Use `Epic | Capability | Outcome` for child titles and `Epic | Epic | Outcome` for parents.
Source IDs belong in the body, where they remain stable if a title changes. Native GitHub sub-issues
show completion progress; the parent checklist provides a readable scope inventory.

## Schedule

Epic: [#1](https://github.com/leonidkuznetsov18/vakhta/issues/1).

| Issue                                                        | Capability and outcome                                                           | Initial status | Source IDs                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------ |
| [#4](https://github.com/leonidkuznetsov18/vakhta/issues/4)   | Policy decisions — Agree the first calendar slice and baseline                   | needs-decision | T-00                                                         |
| [#5](https://github.com/leonidkuznetsov18/vakhta/issues/5)   | Calendar component — Select and validate a reusable calendar engine              | needs-decision | T-01, SC-11, SC-12, SC-21, SC-22, SC-30, SC-31               |
| [#6](https://github.com/leonidkuznetsov18/vakhta/issues/6)   | Calendar workspace — Build day and week planning with mobile views               | backlog        | T-01, SC-11, SC-12, SC-21, SC-30                             |
| [#7](https://github.com/leonidkuznetsov18/vakhta/issues/7)   | Existing workflows — Preserve draft publication and worker acknowledgement       | backlog        | T-02, SC-08, SC-09, SC-18, SC-19, SC-20, SC-24, SC-25, SC-28 |
| [#8](https://github.com/leonidkuznetsov18/vakhta/issues/8)   | Master proposals — Enforce scoped planning and approval authority                | backlog        | T-03, SC-10                                                  |
| [#9](https://github.com/leonidkuznetsov18/vakhta/issues/9)   | Draft reliability — Support full roster search and stale-save recovery           | backlog        | T-04, SC-23, SC-29                                           |
| [#10](https://github.com/leonidkuznetsov18/vakhta/issues/10) | Period planning — Coordinate cross-month reads and writes                        | backlog        | T-05, SC-22                                                  |
| [#11](https://github.com/leonidkuznetsov18/vakhta/issues/11) | Staffing demand — Model coverage norms and qualifications                        | backlog        | T-06, SC-01, SC-04                                           |
| [#12](https://github.com/leonidkuznetsov18/vakhta/issues/12) | Eligibility — Explain conflicts rest limits and availability                     | backlog        | T-07, SC-02, SC-05, SC-06, SC-17, SC-33                      |
| [#13](https://github.com/leonidkuznetsov18/vakhta/issues/13) | Open shifts — Collect interest and select eligible employees                     | backlog        | T-08, SC-15, SC-16                                           |
| [#14](https://github.com/leonidkuznetsov18/vakhta/issues/14) | Batch planning — Add patterns bulk changes and accessible moves                  | backlog        | T-09, SC-26, SC-27, SC-31                                    |
| [#15](https://github.com/leonidkuznetsov18/vakhta/issues/15) | Assignment time — Support custom hours and linked work segments                  | backlog        | T-10, SC-32, SC-37                                           |
| [#16](https://github.com/leonidkuznetsov18/vakhta/issues/16) | Workload and relief — Show distribution and planned break coverage               | backlog        | T-11, SC-35, SC-36                                           |
| [#17](https://github.com/leonidkuznetsov18/vakhta/issues/17) | Operational context — Connect absences requests swaps and borrowing              | backlog        | T-12, SC-03, SC-07, SC-13, SC-14, SC-34, SC-38               |
| [#18](https://github.com/leonidkuznetsov18/vakhta/issues/18) | Records and output — Add notes linked evidence reports print and export          | backlog        | T-13, SC-39, SC-40, SC-41, SC-42, SC-43, SC-50               |
| [#19](https://github.com/leonidkuznetsov18/vakhta/issues/19) | Personal feeds and proposals — Offer revocable calendars and reviewed allocation | backlog        | T-14, SC-44, SC-45                                           |
| [#20](https://github.com/leonidkuznetsov18/vakhta/issues/20) | Forecasts and costs — Define separately approved HR and financial scope          | deferred       | T-15, SC-46, SC-47, SC-48, SC-49                             |
| [#54](https://github.com/leonidkuznetsov18/vakhta/issues/54) | Rollout and acceptance — Verify calendar parity and safe cutover                 | backlog        | AC-01–11, UX-01–15; cross-cutting rollout evidence           |

Calendar research follow-up, 2026-09-12: #1 and #4–20 incorporate the
[Deputy/When I Work research](../research/2026-09-12-deputy-wheniwork-calendar-deep-research.md).
Related discovery #39/#40 maps into the same implementation owners. New native child #54 owns
integrated acceptance, compatibility/cutover and pilot evidence; it adds no SC capability and does
not replace the existing implementation issues. A first bounded release does not complete the full
redesign. The initial publication snapshot remains historical; GitHub contains the updated bodies.

## AI Master

Epic: [#2](https://github.com/leonidkuznetsov18/vakhta/issues/2).

| Issue                                                        | Capability and outcome                                                        | Initial status | Source IDs |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------- | ---------- |
| [#21](https://github.com/leonidkuznetsov18/vakhta/issues/21) | Pilot evidence — Curate and reconcile the handover evaluation set             | backlog        | A1         |
| [#22](https://github.com/leonidkuznetsov18/vakhta/issues/22) | Access boundaries — Enforce full grants on records photos and actions         | backlog        | A2         |
| [#23](https://github.com/leonidkuznetsov18/vakhta/issues/23) | Vision reliability — Represent incomplete and invalid evidence conservatively | backlog        | A3         |
| [#24](https://github.com/leonidkuznetsov18/vakhta/issues/24) | Provider reliability — Bound attempted calls quota and queue costs            | backlog        | A4         |
| [#25](https://github.com/leonidkuznetsov18/vakhta/issues/25) | Review policy — Version criteria and reference-photo mapping                  | backlog        | B1         |
| [#26](https://github.com/leonidkuznetsov18/vakhta/issues/26) | Review contracts — Persist scoped snapshots policies and results              | backlog        | B2         |
| [#27](https://github.com/leonidkuznetsov18/vakhta/issues/27) | Durable processing — Admit and recover automatic handover reviews             | backlog        | B3         |
| [#28](https://github.com/leonidkuznetsov18/vakhta/issues/28) | Shadow review — Assess complete reports with linked evidence                  | backlog        | B4         |
| [#29](https://github.com/leonidkuznetsov18/vakhta/issues/29) | Evaluation — Replay frozen evidence without reference leakage                 | backlog        | B5         |
| [#30](https://github.com/leonidkuznetsov18/vakhta/issues/30) | Master workspace — Show findings and capture human corrections                | backlog        | C1         |
| [#31](https://github.com/leonidkuznetsov18/vakhta/issues/31) | Decision safety — Recheck freshness and apply actions transactionally         | backlog        | C2         |
| [#32](https://github.com/leonidkuznetsov18/vakhta/issues/32) | Incident assistance — Add scoped triage and related-case evidence             | backlog        | D1         |
| [#33](https://github.com/leonidkuznetsov18/vakhta/issues/33) | Request assistance — Review the current approval step with verified context   | backlog        | D2         |
| [#34](https://github.com/leonidkuznetsov18/vakhta/issues/34) | Human escalation — Route urgent findings with delivery evidence               | backlog        | D3         |
| [#35](https://github.com/leonidkuznetsov18/vakhta/issues/35) | Limited autonomy — Gate allowlisted actions behind explicit approval          | deferred       | E1         |

## Workforce Platform

Epic: [#3](https://github.com/leonidkuznetsov18/vakhta/issues/3).

Connecteam deep research, 2026-09-13: [90 detailed capability analyses and UI evidence](../research/2026-09-13-connecteam-deep-research.md)
and [C1–C7 candidate acceptance contracts](../../specs/003-connecteam-workforce-discovery/spec.md).
The follow-up enriches #3/#36–53 and reuses Schedule/AI owners; it creates no duplicate issues or
implementation approval. Publication evidence lives in [Connecteam engineering memory](features/connecteam-reference.md).

| Issue                                                        | Capability and outcome                                                                 | Initial status | Source IDs                        |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------- | -------------- | --------------------------------- |
| [#36](https://github.com/leonidkuznetsov18/vakhta/issues/36) | Attendance — Assess remaining clock and timesheet gaps                                 | discovery      | CT-01, CT-02, CT-03, CT-04, CT-05 |
| [#37](https://github.com/leonidkuznetsov18/vakhta/issues/37) | Presence verification — Validate a need for alternatives to QR                         | deferred       | CT-06, CT-07, CT-08, CT-09, CT-10 |
| [#38](https://github.com/leonidkuznetsov18/vakhta/issues/38) | Payroll and reporting — Separate reporting needs from payroll expansion                | deferred       | CT-11, CT-12, CT-13, CT-14, CT-15 |
| [#39](https://github.com/leonidkuznetsov18/vakhta/issues/39) | Schedule creation — Map competitor planning gaps to the calendar epic                  | discovery      | CT-16, CT-17, CT-18, CT-19, CT-20 |
| [#40](https://github.com/leonidkuznetsov18/vakhta/issues/40) | Staffing and coverage — Validate qualifications shortages and reviewed allocation      | discovery      | CT-21, CT-22, CT-23, CT-24, CT-25 |
| [#41](https://github.com/leonidkuznetsov18/vakhta/issues/41) | Forms — Validate repeated workflows before extending checklist fields                  | discovery      | CT-26, CT-27, CT-28, CT-29, CT-30 |
| [#42](https://github.com/leonidkuznetsov18/vakhta/issues/42) | Submission workflows — Validate routing reminders and export gaps                      | discovery      | CT-31, CT-32, CT-33, CT-34, CT-35 |
| [#43](https://github.com/leonidkuznetsov18/vakhta/issues/43) | Operational tasks — Define accountable follow-up from finding to closure               | discovery      | CT-36, CT-37, CT-38, CT-39, CT-40 |
| [#44](https://github.com/leonidkuznetsov18/vakhta/issues/44) | Internal chat — Assess gaps beyond current Telegram communication                      | deferred       | CT-41, CT-42, CT-43, CT-44, CT-45 |
| [#45](https://github.com/leonidkuznetsov18/vakhta/issues/45) | Targeted announcements — Validate instruction delivery and acknowledgement             | discovery      | CT-46, CT-47, CT-48, CT-49, CT-50 |
| [#46](https://github.com/leonidkuznetsov18/vakhta/issues/46) | Directory and help desk — Validate worker lookup and accountable support routes        | discovery      | CT-51, CT-52, CT-53, CT-54, CT-55 |
| [#47](https://github.com/leonidkuznetsov18/vakhta/issues/47) | Knowledge and company AI — Define versioned instructions and scoped answers            | discovery      | CT-56, CT-57, CT-58, CT-59, CT-60 |
| [#48](https://github.com/leonidkuznetsov18/vakhta/issues/48) | Learning and qualifications — Define training evidence needed for role eligibility     | discovery      | CT-61, CT-62, CT-63, CT-64, CT-65 |
| [#49](https://github.com/leonidkuznetsov18/vakhta/issues/49) | Employee documents — Validate document expiry and qualification evidence               | discovery      | CT-66, CT-67, CT-68, CT-69, CT-70 |
| [#50](https://github.com/leonidkuznetsov18/vakhta/issues/50) | Leave administration — Validate needs beyond existing absence approvals                | deferred       | CT-71, CT-72, CT-73, CT-74, CT-75 |
| [#51](https://github.com/leonidkuznetsov18/vakhta/issues/51) | Hiring and onboarding — Separate onboarding needs from recruitment expansion           | discovery      | CT-76, CT-77, CT-78, CT-79, CT-80 |
| [#52](https://github.com/leonidkuznetsov18/vakhta/issues/52) | Organization and access — Validate targeting and directory gaps within existing scopes | discovery      | CT-81, CT-82, CT-83, CT-84, CT-85 |
| [#53](https://github.com/leonidkuznetsov18/vakhta/issues/53) | Automation and delivery — Prioritize reliable notifications before platform expansion  | discovery      | CT-86, CT-87, CT-88, CT-89, CT-90 |

## Labels and status

- `area:schedule`, `area:ai-master`, `area:workforce`: primary roadmap area.
- `type:epic`, `type:feature`, `type:decision`, `type:discovery`: kind of work.
- `status:backlog`: planned, not started; prerequisite links remain visible.
- `status:needs-decision`: the next deliverable is a concrete policy or technical choice.
- `status:discovery`: establish the need and bounded scope before implementation.
- `status:deferred`: explicitly excluded from immediate execution.
- `status:in-progress`: an owner is actively executing the issue.
- `status:blocked`: active work cannot proceed; document the blocker and next action.
- `priority:p0/p1/p2`: source priorities from the AI Master plan only; no invented priority elsewhere.
- `source:connecteam`: dated competitor research, not an approved parity commitment.
- `scope:separate-approval`: an explicit expansion gate from the source plan.

Keep exactly one status label on open work. On completion, close the issue with acceptance evidence;
remove its active status label. If scope is rejected, close as not planned and record why. Epic progress
counts closed children; closure alone does not distinguish shipped work from a declined proposal,
so review the recorded outcome before claiming delivery. Update parent checklists when scope changes.

No assignees, milestones, delivery dates or paid module commitments were invented. An open backlog
item can have prerequisites without being marked blocked: blocked is reserved for an active impediment.

## Useful GitHub views

- [All open roadmap work](https://github.com/leonidkuznetsov18/vakhta/issues?q=is%3Aissue%20is%3Aopen)
- [Epics](https://github.com/leonidkuznetsov18/vakhta/issues?q=is%3Aissue%20label%3Atype%3Aepic)
- [Schedule](https://github.com/leonidkuznetsov18/vakhta/issues?q=is%3Aissue%20label%3Aarea%3Aschedule)
- [AI Master priorities](https://github.com/leonidkuznetsov18/vakhta/issues?q=is%3Aissue%20is%3Aopen%20label%3Aarea%3Aai-master)
- [Discovery](https://github.com/leonidkuznetsov18/vakhta/issues?q=is%3Aissue%20is%3Aopen%20label%3Astatus%3Adiscovery)
- [Decisions](https://github.com/leonidkuznetsov18/vakhta/issues?q=is%3Aissue%20is%3Aopen%20label%3Astatus%3Aneeds-decision)
- [Deferred scope](https://github.com/leonidkuznetsov18/vakhta/issues?q=is%3Aissue%20is%3Aopen%20label%3Astatus%3Adeferred)
- [Active work](https://github.com/leonidkuznetsov18/vakhta/issues?q=is%3Aissue%20is%3Aopen%20label%3Astatus%3Ain-progress)

## Connecteam candidate modules and overlap

F1 is reliability of agreed behavior, not an upsell. M1–M8 are candidate boundaries from the research,
not additional commitments. The same source capability may inform more than one candidate; the
18 discovery issues own its assessment, while linked Schedule/AI issues own corresponding delivery.

| Candidate                           | Assessment / existing delivery                                                                                                                                                                                                                                                                                       | Boundary                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| F1 Reliability                      | [#53](https://github.com/leonidkuznetsov18/vakhta/issues/53), [#7](https://github.com/leonidkuznetsov18/vakhta/issues/7), [#34](https://github.com/leonidkuznetsov18/vakhta/issues/34)                                                                                                                               | Event → recipient → delivery → acknowledgement → fallback; reuse existing paths.    |
| M1 Operational tasks                | [#43](https://github.com/leonidkuznetsov18/vakhta/issues/43)                                                                                                                                                                                                                                                         | One finding, accountable owner, due date and closure evidence.                      |
| M2 Instructions and acknowledgement | [#45](https://github.com/leonidkuznetsov18/vakhta/issues/45), [#47](https://github.com/leonidkuznetsov18/vakhta/issues/47)                                                                                                                                                                                           | Versioned role/zone instructions and material-change acknowledgement.               |
| M3 Qualifications and onboarding    | [#40](https://github.com/leonidkuznetsov18/vakhta/issues/40), [#48](https://github.com/leonidkuznetsov18/vakhta/issues/48), [#49](https://github.com/leonidkuznetsov18/vakhta/issues/49), [#51](https://github.com/leonidkuznetsov18/vakhta/issues/51), [#11](https://github.com/leonidkuznetsov18/vakhta/issues/11) | Human-verified eligibility and expiry; no automatic broad HR expansion.             |
| M4 Coverage                         | [#40](https://github.com/leonidkuznetsov18/vakhta/issues/40), [#11](https://github.com/leonidkuznetsov18/vakhta/issues/11), [#12](https://github.com/leonidkuznetsov18/vakhta/issues/12)                                                                                                                             | Agree demand and qualification rules before blocking assignments.                   |
| M5 Richer forms                     | [#41](https://github.com/leonidkuznetsov18/vakhta/issues/41), [#42](https://github.com/leonidkuznetsov18/vakhta/issues/42)                                                                                                                                                                                           | Extend fields/conditions only for repeated demonstrated processes.                  |
| M6 Targeted communication           | [#44](https://github.com/leonidkuznetsov18/vakhta/issues/44), [#45](https://github.com/leonidkuznetsov18/vakhta/issues/45), [#52](https://github.com/leonidkuznetsov18/vakhta/issues/52)                                                                                                                             | Relevant Telegram audiences; sending does not prove reading.                        |
| M7 Reviewed allocation              | [#40](https://github.com/leonidkuznetsov18/vakhta/issues/40), [#19](https://github.com/leonidkuznetsov18/vakhta/issues/19)                                                                                                                                                                                           | Later; depends on qualifications and coverage, with human publication.              |
| M8 Operational AI                   | [#47](https://github.com/leonidkuznetsov18/vakhta/issues/47), [#53](https://github.com/leonidkuznetsov18/vakhta/issues/53), [#2](https://github.com/leonidkuznetsov18/vakhta/issues/2)                                                                                                                               | Scoped evidence and current answers; separate product help from operational review. |

## Execution with Spec Kit

1. Select one issue and inspect its current implementation, source IDs and prerequisites.
2. Use `speckit-specify` for the bounded outcome, then `speckit-plan` and `speckit-tasks` for design
   and execution steps. Keep the existing product brief and feature memory authoritative.
3. Use `speckit-taskstoissues` only for genuinely new child work; check open and closed issues first
   to avoid duplicating this catalog. Update or reference the existing issue for the selected stream.
4. Use `speckit-implement` for the accepted slice. Preserve current master and single-writer rules.
5. Use `speckit-converge` to identify remaining accepted work; attach actual acceptance evidence
   and close only delivered work. Discovery may end with a documented defer/reject decision.

Start Schedule with operating decisions and calendar component validation; AI Master with pilot
curation, access boundaries and conservative vision. Select a Connecteam candidate after observing
an actual operational need. Do not execute every catalog issue as one implementation batch.

The [publication specification](../../specs/001-roadmap-issue-catalog/spec.md),
[payload snapshot](../../specs/001-roadmap-issue-catalog/catalog.json) and
[issue receipts](../../specs/001-roadmap-issue-catalog/issues.json) support traceability and recovery.
They are not a live status cache or automatic issue synchronizer. Evidence is recorded in
[the engineering memory](features/roadmap-issues.md).
