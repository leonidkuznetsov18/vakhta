# Bonus (spec 7, panel section "Бонус")

Every closed shift gets a score 0–100 from criteria (schedule start, no early leave, presence,
sequence, breaks, no unresolved items, downtime paperwork, handover checklist, photos, remarks,
acceptance). Criteria that do not apply (no plan, no zone, no checklist) are excluded and the
score is the share of applicable points. S month is the weighted average of the month's shifts.

Statuses of a shift: preliminary (computed, may change), pending (a criterion waits for a photo
check, an acceptance or an open request), manual review (fewer than 60 applicable points, e.g. a
shift without a schedule and without a checklist), appealed, confirmed (period closed), not
evaluated (excluded).

Panel "Бонус": the month summary with the period status explained, a "Как это работает" guide
(four numbered steps for the administrator), "Лучшие за месяц" (chart and rating by S month), the
second-approval queue, and the employees table. A row click expands the employee's month right
under the row (no side panel): a header with S month, shifts, evaluated shifts and the two point
actions, then one card per shift in a grid that uses the page width. Every card shows the status
with a plain explanation, the score "N / 100" and an explicit action row:

- "Ручная проверка" shows a "Что делать" box: why the rules could not score the shift (how many
  points apply, which criteria do not) and three steps. The primary button is "Завершить проверку":
  set a score (the default is the share of points earned) or exclude the shift, with a comment;
  the employee is notified. A reviewed shift offers "Изменить решение проверки"; an excluded one
  "Вернуть смену в расчёт".
- Any other evaluated shift has "Начислить баллы" and "Снять баллы" (also in the footer of the
  employee card and as "Начислить или снять баллы" in the ⋯ row menu). The dialog is preset to a
  reward or a violation: amount (1–100), a reason from the directory and a comment. Points apply
  to the shift score as a whole (capped at 100); "Дополнительно" binds them to one criterion. A
  penalty above the threshold (10 points) waits for a second manager's approval.
- Adjustments are listed in the card with "Изменить" and "Удалить" buttons while the period is
  open; a deleted one stays in the history as "Удалена" and the score is recomputed.
- "Расшифровка" shows the criteria with their basis; "Пересчитать" recomputes.

"Закрыть период" confirms scores and notifies employees; HR then sets the bonus base, accounting
exports the CSV. A closed period shows a "Период закрыт" banner: nothing can be reviewed, added or
deleted. "Открыть период снова" (production head or administrator, comment required) returns the
confirmed scores to "Предварительно" and keeps the bonus base; after the fix the period is closed
again. The employee sees "Мои баллы" in the bot and can appeal within the appeal window.
Reports → "Бонус" lists the best employees for any period.
