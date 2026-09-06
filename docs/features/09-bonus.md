# Bonus (spec 7, panel section "Бонус")

Every closed shift gets a score 0–100 from criteria (schedule start, no early leave, presence,
sequence, breaks, no unresolved items, downtime paperwork, handover checklist, photos, remarks,
acceptance). Criteria that do not apply (no plan, no zone, no checklist) are excluded and the
score is the share of applicable points. S month is the weighted average of the month's shifts.

Statuses of a shift: preliminary (computed, may change), pending (a criterion waits for a photo
check, an acceptance or an open request), manual review (fewer than 60 applicable points, e.g. a
shift without a schedule and without a checklist), appealed, confirmed (period closed), not
evaluated (excluded).

Panel "Бонус": the month summary with the period status explained, "Лучшие за месяц" (chart and
rating by S month), the second-approval queue, and the employees table. A row opens the employee
card with one block per shift:

- the status with a plain explanation;
- "Завершить проверку" for manual review: set a score (the default is the share of points earned)
  or exclude the shift, with a comment; the employee is notified;
- "Начислить или снять баллы": choose the shift, reward or violation, the amount (1–100), a reason
  from the directory and a comment. Points apply to the shift score as a whole (capped at 100);
  "Дополнительно" binds them to one criterion. A penalty above the threshold (10 points) waits for
  a second manager's approval;
- adjustments can be edited and deleted while the period is open; the history stays;
- "Расшифровка" shows the criteria with their basis; "Пересчитать" recomputes.

"Закрыть период" confirms scores and notifies employees; HR then sets the bonus base, accounting
exports the CSV. The employee sees "Мои баллы" in the bot and can appeal within the appeal window.
Reports → "Бонус" lists the best employees for any period.
