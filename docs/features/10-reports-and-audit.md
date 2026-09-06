# Reports and audit (spec 9.3, 13)

Panel "Отчёты": six reports (hours plan/actual, time structure, downtime, handover, bot usage,
bonus). Filters: site, unit, period presets (this month, last month, last 7/30 days) or custom
dates. "Построить" shows period totals, a chart (bars, lines or stacked bars; series and Top N are
selectable) and a table with sortable columns, a row search and column visibility. "CSV" and
"XLSX" export the full report with a data version and the generation time; "Печать" prints what
is on screen.

Panel "Аудит": every action of panel users and the bot with the actor, the object and before /
after values; the event journal shows the domain events of a shift. Both are append-only.
