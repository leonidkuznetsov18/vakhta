# Reports and audit (spec 9.3, 13)

Panel "Отчёты": six reports (hours plan/actual, time structure, downtime, handover, bot usage,
bonus). Filters: site, unit, period presets (this month, last month, last 7/30 days) or custom
dates. "Построить" shows period totals, a chart (bars, lines or stacked bars; series and Top N are
selectable; series use eight distinct colours in both themes) and a table with sortable columns, a
row search and column visibility. "CSV" and
"XLSX" export the full report with a data version and the generation time; "Печать" prints what
is on screen.

Panel "Аудит": every action of panel users and the bot. The table names the actor (the e-mail of
the panel user or the full name of the employee, with the actor type under it), the action with
its code, the object with a short id and the reason; the "Подробности" button (or a row click)
opens the details: actor, object type, the full object id with "Скопировать", the reason, a
"Что изменилось" table with one row per field (changed rows highlighted, the old value struck
through) and the full before / after JSON under "Данные целиком (JSON)" with copy buttons. The
event journal shows the domain events of a shift the same way: the payload as a field table plus
the raw JSON. Both logs are append-only.
