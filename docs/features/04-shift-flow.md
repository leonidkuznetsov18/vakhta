# The shift: states and buttons (spec 4.3–4.5)

States: PREPARATION → WORKING → temporary states (BREAK, MEAL, SERVICE_TIME, DOWNTIME) →
CLEANING → HANDOVER → READY_TO_CLOSE → SHIFT_CLOSED (or EMERGENCY_EXIT).

- "Начать смену": needs an open presence (QR arrival) unless the master opens it. Opens
  PREPARATION.
- "Принять зону": when the schedule assignment has a zone, the employee accepts the zone before
  work; the previous shift's handover report (if any) is shown for review.
- "Начать работу": WORKING. From here: "Перерыв" (15 min), "Обед" (60 min), "Служебное время",
  "Начать простой" (reason required), "Сообщить о проблеме" (incident with optional photo).
- "Вернуться": leaves a temporary state; after a meal or break that started from a downtime the
  bot asks whether the obstacle is still there.
- "Начать уборку" → CLEANING; "Уборка завершена" → HANDOVER, where the checklist and photos live
  (see checklists doc). "Передать смену" needs a submitted report when the position has a
  checklist. "Закончить смену" closes and shows the summary: total, work, breaks, meal, downtime.
- "Экстренный уход": leaves with a reason; the master reviews it.

Timers: a reminder before the planned end to start cleaning, return reminders for long breaks,
downtime escalation to the master after N minutes.

Every transition is one event in the log with server time; intervals are computed from events, so
the panel and the bot always agree. The master can perform any transition for the employee from
the panel ("Действие мастера", comment required) and mark a shift "Нужна проверка".

## Typical questions

- "The button does nothing": the screen is outdated; the bot redraws it, press again.
- "I forgot to press return from the break": press it now; the master can correct intervals
  through a request ("Коррекция события") if needed.
