# Overview: the shift command center

"Огляд" ("Обзор", "Overview") is the landing page of the admin panel. It is the exception-based
action center of the **current shift**: in one glance a shift master, production head or
administrator sees what needs action first, how the shift is going and what may stop it from
closing well. Everything on the page is limited to the sites and units of the reader's role grants.

The page is built from recorded facts only: schedule versions, QR presence, shift sessions and their
activity intervals, incidents, handover reports and the kiosk heartbeat. It does not show output,
OEE or equipment states.

## Layout from top to bottom

1. **Header**: site and unit selectors, the running shift, freshness.
2. **"Потребує дії зараз"** (Needs action now): priority cards.
3. **"Стан зміни"** (Shift health): four key figures of the current shift.
4. **"Зони зараз"** (Zones now): the live state of every zone.
5. **"Люди і графік сьогодні"**: sick leave, shifts without a person this week and birthdays.
6. **"Останні події"** (Recent events): important operational events of the last 24 hours.
7. **"Налаштування та онбординг"** (Setup and onboarding): debt that does not block the shift.

Help for the page is the "?" button in the section header (purpose, steps and questions). Every
figure and card group has an ⓘ hint with its exact definition.

## Header: where and when

- **"Об’єкт" and "Підрозділ"** list only the sites and units the reader's grants reach. A unit master
  sees their own unit (and its site); a site-scoped production head sees the units of their site; an
  enterprise administrator sees everything and can choose "Усі об’єкти" / "Усі підрозділи". The choice
  is remembered in the browser. A site or unit outside the grants is rejected by the server.
- The **shift line** shows the running shift of each selected site, read from the site's shift
  templates in the site time zone: name and hours ("Денна 08:00–20:00"), the business date (a night
  shift keeps the date it started), time left ("до кінця 3 год 15 хв") and the next shift.
- For two hours after a shift ends, an amber chip **"Закриття зміни «Денна» до 22:00"** says the
  previous shift may still submit its checklist and scan the exit QR.
- On the right: a dot (green — updating live, red — live updates unavailable, the page checks every
  minute) and **"Оновлено HH:MM"**.
- If the shift state cannot be loaded, the header says so with **"Повторити"**; queues that come from
  the section lists stay visible.

The selection narrows the shift figures, zones, events and setup counts, and is carried into the
sections the cards open: Incidents and Handover open filtered to the selected site, Live shift to the
selected site and unit.

## "Потребує дії зараз": priority cards

Cards are ordered by tier, then by the nearest deadline, then by the oldest waiting record. Each card
shows the count, what it counts, the age and deadline ("прострочено на 2 год · найстаріше — 3 год
тому"), the faces behind it and its tier as text with an icon, so colour is never the only signal.
Clicking a card opens the first record in its section with conflicting filters cleared.

| Tier      | Card                              | Counts                                                                                                                                 | Opens                           |
| --------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Критично  | "Інцидент без реакції після SLA"  | Open incidents past their SLA with no acknowledgement or resolution                                                                    | Incidents, first breach         |
| Критично  | "Інцидент безпеки відкритий"      | Open SAFETY incidents                                                                                                                  | Incidents                       |
| Критично  | "Термінал без зв’язку"            | Active paired kiosks silent for more than three QR renewals, when a shift boundary is within an hour or planned staff are not recorded | Administration → Terminals      |
| Критично  | "Зона в простої довше за 15 хв"   | Zones with an open downtime longer than the downtime escalation time                                                                   | Live shift, downtime group      |
| Увага     | "Відкриті інциденти"              | All open incidents                                                                                                                     | Incidents                       |
| Увага     | "Чек-листи без рішення майстра"   | Submitted or disputed handover reports, including before the deadline                                                                  | Handover, first report          |
| Увага     | "Не прийшли за графіком"          | Planned people of the current shift whose late grace has passed with no presence or shift                                              | Live shift of the business date |
| Увага     | "Термінал без зв’язку"            | A silent kiosk when nobody depends on it within the next hour                                                                          | Administration → Terminals      |
| Увага     | "Прострочені звернення"           | Requests at the reader's step past their step deadline                                                                                 | Requests                        |
| Увага     | "Закриті без чек-листа за 24 год" | Shifts closed by the end-of-day job without a checklist                                                                                | Live shift                      |
| До відома | "Звернення на моєму кроці"        | Open requests waiting for the reader's role                                                                                            | Requests                        |
| До відома | "Переробка чекає рішення"         | Overtime waiting for approval                                                                                                          | Requests                        |

There are no zero cards. Under the cards:

- **"Перевірено: …"** lists the sources that loaded and have nothing to do.
- **"Не вдалося перевірити: … · Повторити"** names every source that failed. A failed source is never
  counted as clear.
- **"Усе в нормі"** appears only when every source loaded and nothing needs action.

"Не прийшли за графіком" is a factual gap, not an absence verdict: approved absences have already left
the published schedule, and the page does not decide whether someone skipped work. The master can call
the person or start the shift for them from Live shift.

## "Стан зміни": shift health

Four figures for the current shift in the selected scope. A figure the reader's role cannot read is
not shown; while loading it shows a spinner, after a failure "Повторити" — never a zero.

- **"Явка за графіком"** — "41 з 44": present people among planned assignments of published schedule
  versions that overlap the shift. Details: not arrived, expected (their start plus grace has not come
  yet) and "+N поза графіком" (people on shift without a plan). Without a plan the tile reads "На цю
  зміну графіка немає" and opens Schedule.
- **"Час до реакції"** — the median time from a problem report to the master's reaction (acknowledgement,
  or resolution without one) for incidents reported during this shift; "SLA дотримано: 5 з 6" and
  "чекають реакції: 1" for incidents still waiting.
- **"Простій зон"** — how long zones stood during this shift. If two people stood at one stopped zone,
  the zone's stop counts once; "людино-хвилин" shows the personal total separately, with the number of
  incidents and the top reason.
- **"Приймання передачі"** — "49 з 50 без зауважень": handover reports of the shift that ended at this
  shift's start, accepted without a dispute, among those already decided; "зі спором" and "чекають"
  are shown separately.

## "Зони зараз"

One card per active zone: status with text and duration, zone name, unit (when several units are
shown) and "2 з 3 за графіком". Problem zones come first:

1. "Простій" — someone in the zone is in downtime (with the duration of the earliest open downtime).
2. "Нікого немає" — people are planned now, nobody is on shift in the zone.
3. "Не вистачає людей" — fewer people on shift than planned.
4. "Прибирання і передача" — everyone in the zone is cleaning, handing over or ready to close.
5. "Працює".
6. "Не заплановано" — no plan and nobody there; these fold under "Ще зон без плану і людей: N ·
   Показати".

Planned people follow the assignment zone or, for split assignments, the segment that is current at
the site's local time. A zone card opens Live shift for that unit, searched by the zone name.

## "Люди і графік сьогодні"

People facts from the Schedule section for the selected sites, in three separate groups with their
counts. A holiday of the day appears as a green chip next to "Відкрити графік".

- **"На лікарняному"**: each person with a link to the profile, the end of the sick leave ("до 16.09"),
  whether it is approved or still pending, and the latest answer in the bot to "How are you?" as a
  coloured label with text ("Гірше", "Так само", "Краще") and its date. People who feel worse or have
  not answered yet come first.
- **"Зміни без людини · 7 днів"**: planned shifts of the coming week whose person is on an approved
  absence, grouped by date ("пн 14.09 · змін: 2"); each row says whom the shift replaces and where
  (zone and unit). "Знайти заміну" opens Schedule.
- **"Дні народження"**: today's birthdays with links to profiles.

An empty group says so in one line ("Сьогодні ніхто не на лікарняному"); long lists scroll inside the
group. The section refreshes with the page and every five minutes.

## "Останні події"

The latest 30 important events of the last 24 hours, newest first: problem reported, master reacted,
incident escalated, SLA breached, incident resolved, downtime started or ended, handover report
submitted, disputed or decided, and a shift closed by a master. Each row shows the time, the event,
the zone, the reason and the person, and opens the incident, handover or shift. Each kind follows the
access of its section, so a reader sees only events of their sites and units. Comments, request and
medical content never appear here; this is not the audit log (see "Аудит").

## "Налаштування та онбординг"

Counts that keep the site on paper but do not stop the running shift: shifts without a schedule by unit
(opens Schedule with those people ready to plan), "Не активували Telegram" (opens Employees filtered to
active, not linked) and "Термінали не підключені" (opens Terminals). Counts are computed on the server in
the reader's scope.

## Who sees what

Every block reads its own source with the reader's role and scope:

| Block                                                  | Roles                                                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Incident cards, "Час до реакції", "Простій зон"        | ADMIN, PRODUCTION_HEAD, SHIFT_MASTER; the time and downtime figures also for HR, PLANNER, CLEANLINESS_CONTROLLER, ACCOUNTANT, AUDITOR |
| Handover cards and "Приймання передачі"                | ADMIN, PRODUCTION_HEAD, SHIFT_MASTER, CLEANLINESS_CONTROLLER; the figure also for HR and AUDITOR                                      |
| Request cards                                          | ADMIN, PRODUCTION_HEAD, SHIFT_MASTER, HR, PLANNER, AUDITOR (by the role's step)                                                       |
| Overtime, closed without checklist, unscheduled shifts | ADMIN, PRODUCTION_HEAD, SHIFT_MASTER                                                                                                  |
| "Явка за графіком", "Не прийшли за графіком"           | ADMIN, PRODUCTION_HEAD, SHIFT_MASTER, PLANNER, HR                                                                                     |
| Terminals                                              | ADMIN, PRODUCTION_HEAD, SHIFT_MASTER                                                                                                  |
| "Зони зараз"                                           | ADMIN, PRODUCTION_HEAD, SHIFT_MASTER, HR, PLANNER, CLEANLINESS_CONTROLLER, AUDITOR                                                    |
| Setup counts                                           | ADMIN, PRODUCTION_HEAD, SHIFT_MASTER, HR, PLANNER                                                                                     |

Scope applies everywhere: a unit master sees only their unit, a site grant only its site. The same
limits apply to the section lists, record pages, photo and medical document links, and live updates.

## Freshness

The page listens to the live streams of shifts, incidents, handover and requests; any change in the
reader's scope refreshes the cards, the figures and the events within seconds. Without a live
connection the page refreshes every minute and the dot is red. A refresh failure keeps the last
numbers visible with the failure named.

## Typical questions

- **Does the site and unit choice change every card?** The shift line, "Стан зміни", "Зони зараз",
  "Останні події", "Не прийшли за графіком", terminals, zones in long downtime and the setup counts follow
  the choice. Incident, handover, request, overtime and closed-without-checklist cards count your whole
  access scope (they are your role's queues); the section they open is filtered to the chosen site/unit.
- **Why is "Не прийшли" not zero although everyone is here?** Someone came without scanning the QR or
  started work without the bot. Check Live shift; a master can record the arrival there.
- **Why is the terminal critical only sometimes?** A silent kiosk matters most before a shift change or
  while planned people are not recorded; otherwise it is an attention card.
- **Why don't I see terminals or staffing?** Your role does not read those sections; the page hides them
  instead of showing zeros.
