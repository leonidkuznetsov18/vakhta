# Equipment maintenance (spec 014)

Vakhta keeps a register of the shop's machines, their manufacturer manuals, planned maintenance
(«ТО») with reminders to the responsible mechanic, and emergency repairs from the first report to the
return to service.

## Who uses it

- **Chief mechanic and administrator** (role "Главный механик" / `CHIEF_MECHANIC`, and `ADMIN`): add
  machines, upload manuals, write and publish maintenance plans, review finished maintenance,
  reschedule, reassign or cancel work.
- **Shift master** (`SHIFT_MASTER`): sees the section, creates an emergency repair from a machine card
  and returns a repaired machine to service.
- **Production head, planner, auditor**: read the register, calendar and work.
- **Mechanics** (employees whose position maintains equipment, e.g. "Наладчик"): work in the
  Telegram bot through "🔧 Мои работы". They never use the panel for this.
- **Operators**: name the machine when they report a problem in the bot.

## Panel: section "Обслуживание"

Three tabs:

- **"Оборудование"** — the register: code and model, location, state (Работает / Ограничено /
  Остановлен), the next maintenance with an orange "Просрочено" mark, whether the mechanic confirmed
  materials, the responsible and backup mechanic. Filters by unit and state, and a search by code,
  model or mechanic. "Добавить оборудование" opens the form; only employees whose position maintains
  equipment can be responsible or backup.
- **Machine card** (a row opens it): passport, "Документы" (PDF up to 50 MB; a warning when there is
  no operating manual), "Планы ТО" and "История". Buttons: "Редактировать", "Архивировать",
  "Аварийный ремонт", and "Допустить к работе" for a stopped machine.
- **"Календарь ТО"** — the month: planned maintenance (cyan), materials missing (violet), overdue
  (orange), emergency repairs (red), completed (grey) and the forecast of later cycles (dotted, not
  work yet). Above the grid, a list of overdue maintenance. Filters by mechanic and machine. On a phone
  the calendar becomes a list of days.
- **"Работы"** — the queue with the views "Срочные", "Сегодня", "На проверке", "Все". An open
  emergency repair is shown on top with the time left to accept it.

## Maintenance plans

A plan says what to do and how often, based on the manual or on a documented plant decision:
interval (days, weeks or months), counting "от выполнения" (the next date counts from the day the work
was actually done) or "фиксированный календарь", the first date, duration, whether the machine must
stop, the operations (each may require a photo) and the materials to have on hand.

A draft creates nothing. "Опубликовать" creates the first work and the reminders; editing a published
plan creates the next version, and open work keeps the version it was created from. A plan can be
paused, resumed or archived with a reason.

## Reminders and the mechanic's work in Telegram

The responsible mechanic gets a reminder 7, 3 and 1 day before the planned date at 09:00 site time,
with the machine, operations and materials. If the date is already too close, one notice comes
at once instead. When the mechanic is on approved leave or has no Telegram, the backup mechanic gets
the reminder with a note; otherwise the unit master does.

Buttons under a reminder: "Открыть", "📄 Руководство" (the manual as a PDF), "✅ Всё есть" and
"⚠️ Чего-то не хватает" (the mechanic writes what is missing and the master is told).

In "🔧 Мои работы" the mechanic opens a work, presses "▶️ Начать" and answers each operation:
"✅ Выполнено", "❌ Не выполнено" or "➖ Не применимо" (the last two ask for a reason; an operation
with 📷 asks for a photo). "⏸️ Пауза" records why the work waits. When every operation is answered,
"📤 Сдать" sends the maintenance for review. The chief mechanic accepts it in the panel, which plans
the next date, or returns it with a comment.

## Emergency repair

An operator reports a problem in the bot and, when the zone has machines, picks the machine ("Не знаю
/ другое" is always available). If work stopped, or the reason is critical or safety, the machine's
emergency repair opens together with the incident; a second report on the same machine joins it.
The machine becomes "Остановлен" and its downtime counts.

The responsible mechanic gets the repair with "✅ Принять" and "✋ Не могу". Deadlines to accept:
2 minutes for danger to people (P0), 5 minutes when work stopped (P1), 30 minutes for a fault
without a stop (P2). Without acceptance, the backup mechanic and the master are notified, and five
minutes later the repair is marked escalated in the panel. "Не могу" passes the repair to the backup
mechanic without resetting the deadline.

The mechanic marks "▶️ Начать", pauses if needed, and finishes with "✅ Готово" and a short
description of what was done. Finishing the repair does not start the machine: the master or the
chief mechanic presses "Допустить к работе" (normal or restricted operation with a condition). The
reporter is told the machine runs again.

## Typical questions

- _Why did the mechanic get no reminder?_ The plan is not published, or the mechanic has no linked
  Telegram (then the backup mechanic got it).
- _How do I move a maintenance?_ Open it in "Работы" and press "Перенести"; the reminders follow.
- _Why is "Допустить к работе" disabled?_ The mechanic has not finished the repair in the bot yet.
