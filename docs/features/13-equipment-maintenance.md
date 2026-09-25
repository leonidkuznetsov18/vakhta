# Equipment maintenance (spec 014)

Vakhta keeps a register of the shop's machines, their manufacturer manuals, planned maintenance
(«ТО») with reminders to the responsible mechanic, and emergency repairs from the first report to the
return to service.

It is the tenant module "Обслуживание оборудования": the platform operator switches it on or off in
Vakhta Control → Modules. When it is off, the section, the mechanic's bot entry, the machine question
in problem reports and the reminders are gone.

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
  materials, the responsible and backup mechanic (never the same person). Filters by unit and state, and a search by code,
  model or mechanic. "Добавить оборудование" opens the form; only employees whose position maintains
  equipment can be responsible or backup.
- **Machine card** (a row opens it): passport, "Документы", "Планы ТО", "Материалы" and "История".
  A document is either a PDF up to 50 MB stored in the system (the bot sends it as a file) or a link
  to the manufacturer's page or PDF, which opens in a new tab; a warning appears while there is no
  operating manual. "Материалы" lists everything the published plans need — item, kind, quantity,
  "щоразу" or "за потреби", and the plan with its next date — so the stock question is answered from
  one list. The footer shows every action with an icon and a tooltip: "Редактировать",
  "Архивировать", "Исправить состояние" for a record error (a reason is required; not while a repair
  is open), "Аварийный ремонт", and "Допустить к работе" for a stopped machine; a phone shows the
  icons only. A plan's "⋯" menu copies it to another machine as a draft without the first date,
  source and mechanic, which are confirmed there. Opening a plan replaces the card with the plan
  editor; closing it returns to the card.
- **"Календарь ТО"** — the month: planned maintenance (cyan), materials missing (violet), overdue
  (orange), emergency repairs (red), completed (grey) and the forecast of later cycles (dotted, not
  work yet). Above the grid, a list of overdue maintenance. "Месяц" or "Неделя" view; filters by unit,
  mechanic, machine and "Показать" (all, open, overdue, done); the panel remembers them. On a phone the
  calendar becomes a list of days.
- **"Работы"** — the queue with the views "Срочные", "Сегодня", "На проверке", "Все". An open
  emergency repair is shown on top with the time left to accept it. A work card lists its Telegram
  notices and says which were not delivered.
- **"Записать выполнение"** — when a mechanic did the work on paper, the chief mechanic enters the
  answers, the date and the materials for them. The work goes to review and shows who did it and who
  entered it; photos are not required for such a record.

## On the Overview page

"Огляд" shows the module's facts in the reader's scope: cards for emergency repairs (critical for
P0/P1, an escalation or a missed acceptance), overdue maintenance, maintenance awaiting review (admin
and chief mechanic) and maintenance within the first reminder horizon; the "Обладнання" tile with
stopped machines and today's maintenance; and the stopped machine on its zone card. Every card opens
the first work order in "Работы".

## Maintenance plans

A plan says what to do and how often, based on the manual or on a documented plant decision:
interval (days, weeks or months), counting "от выполнения" (the next date counts from the day the work
was actually done) or "фиксированный календарь", the first date, duration, whether the machine must
stop, the operations (each may require a photo) and the materials to have on hand (each item is a
card: the name on its own line, kind, article, quantity, unit and need under it). The Telegram
reminders follow the client parameters (7, 3 and 1 day before at 09:00 by default); a plan may set
its own days, for example "14, 2", in the block "Кто выполняет".

A draft creates nothing. "Опубликовать" creates the first work and the reminders; editing a published
plan creates the next version, and open work keeps the version it was created from. A work card then
says the plan is newer; "Сравнить и применить" shows what changed and moves work that has not started
to the new version (changed materials ask the mechanic for readiness again). A plan can be paused,
resumed or archived with a reason. With "фиксированный календарь", dates a late maintenance skipped
stay in the history as missed.

## Reminders and the mechanic's work in Telegram

The responsible mechanic gets a reminder 7, 3 and 1 day before the planned date at 09:00 site time
(the operator can change the days and the hour per client in Vakhta Control → Parameters),
with the machine, operations and materials. If the date is already too close, one notice comes
at once instead. When the mechanic is on approved leave or has no Telegram, the backup mechanic gets
the reminder with a note; otherwise the unit master does.

Buttons under a reminder: "Открыть", "📄 Руководство" (the manual as a PDF), "✅ Всё есть" and
"⚠️ Чего-то не хватает" (the mechanic checks the missing materials in a list or writes, and the master
is told).

In "🔧 Мои работы" the mechanic opens a work, presses "▶️ Начать" and answers each operation:
"✅ Выполнено", "❌ Не выполнено" or "➖ Не применимо" (the last two ask for a reason; an operation
with 📷 asks for a photo). "⏸️ Пауза" records why the work waits. When every operation is answered,
"📤 Сдать" first asks which materials were used ("✅ Как в плане" or in their own words), then sends the
maintenance for review. The chief mechanic accepts it in the panel, which plans
the next date, or returns it with a comment.

## Emergency repair

An operator reports a problem in the bot and, when the zone has machines, picks the machine ("Не знаю
/ другое" is always available). If work stopped, or the reason is critical or safety, the machine's
emergency repair opens together with the incident; a second report on the same machine joins it.
The machine becomes "Остановлен" and its downtime counts.

The responsible mechanic gets the repair with "✅ Принять" and "✋ Не могу". Deadlines to accept:
2 minutes for danger to people (P0), 5 minutes when work stopped (P1), 30 minutes for a fault
without a stop (P2); the operator can change these per client. Without acceptance, the backup mechanic and the master are notified, and five
minutes later the repair is marked escalated in the panel. "Не могу" passes the repair to the backup
mechanic without resetting the deadline.

The mechanic marks "▶️ Начать", pauses if needed, and finishes with "✅ Готово": the bot then asks
three short questions one after another — what was done, what caused the breakdown, and which parts
or materials were used (a dash means none) — and records each answer in its own field of the repair.
Finishing the repair does not start the machine: the master or the
chief mechanic presses "Допустить к работе" (normal or restricted operation with a condition). The
reporter is told the machine runs again.

The master or chief mechanic can also answer for the materials from the work card in the panel:
"Всё есть" or "Чего-то не хватает" with a note, as long as the work has not started. A shortage
tells the unit master the same way as from the bot.

## Typical questions

- _Why did the mechanic get no reminder?_ The plan is not published, the mechanic has no linked
  Telegram (then the backup mechanic got it), or the work card shows the notice as not delivered.
- _How do I move a maintenance?_ Open it in "Работы" and press "Перенести"; the reminders follow.
- _Why is "Допустить к работе" disabled?_ The mechanic has not finished the repair in the bot yet.
