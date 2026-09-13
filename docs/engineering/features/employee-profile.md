# Employee profile

Updated: 2026-09-13. Specification, plan and tasks: `specs/005-employee-profile/`.
Status: specified and published as a GitHub epic; implementation not yet authorized.

## Owner decisions (2026-09-13)

- D-01 "Rate" is both the employment rate (FTE fraction) and an hourly tariff; salary is a separate
  monthly amount.
- D-02 Compensation visible to ADMIN, HR, ACCOUNTANT; marital status to ADMIN and HR; denied access
  audited like medical documents. Masters, planners and the production head see contacts, work and
  schedule; birth date as day/month only.
- D-03 Compensation is versioned by effective date; history kept; append-only with corrections.
- D-04 Every unit has a designated master; an employee's master is derived from their unit and must be
  clearly visible, including when missing.
- D-05 (Lean, overridable) Zone is derived from the current/next published shift, not stored.

## Baseline findings at 64560d7

- Employee reads are role-gated but not grant-scoped; scope enforcement is a prerequisite (US1).
- Masters are inferred from `SHIFT_MASTER` grants matched by e-mail; `employee_positions.manager_employee_id`
  is written but never read.
- No rate/salary fields; no employee avatars; no employee→zone link; no per-employee schedule.
- Birth date is owned by the concurrent calendar/birthday change (migration 0049).

## Lean review (design stage)

Recommendation: **Simplify.** The demonstrated waste is hunting for person data across a large row
card and the unanswerable "who is this employee's master". Adopted: derived zone instead of a second
stored zone; schedule limited to next shifts, month count and a Schedule link; explicit master per unit;
avatar in private storage. Owner decisions keep compensation and marital status in scope; guardrails:
server-side restriction, audited denials, no values in logs or exports, no historical import.
Measures: share of active units without a master (target 0); HR use of the profile vs the row card;
SC-001 moderated check. Open: one master per unit vs per crew with two 12-hour shifts (owner stated
one per unit; revisit if rosters show crew masters).

## Evidence

None yet — implementation not started.

## Remaining work and follow-ups

- OD-1 retire `manager_employee_id`; OD-2 move bonus nominations from e-mail matching to the unit
  master (bonus behavior change, separate decision); OD-3 fate of the expanded row card.
