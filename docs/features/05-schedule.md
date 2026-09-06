# Schedule (spec 3, panel section "График")

Filters: site, unit, month. The schedule lives in versions: DRAFT → IN_REVIEW → PUBLISHED, and
SUPERSEDED when a newer version is published. Versions are picked from the "Версия" select
("Версия 7 · Черновик · создана 06.09.26", newest first), with the status, the date and the count
of versions next to it, so a month with dozens of versions stays readable.

- "Новая версия" creates a draft; when a published version exists the draft copies its shifts.
- The grid "employees × days": a shift template per cell (day / night), a zone per row, rotation
  patterns ("Шаблон ротации") to fill a month, keyboard navigation, per-day totals and monthly hour
  limits with warnings. Rows without a zone show a warning: without a zone there is no handover.
- Employees of a version: the bar above the grid counts them and, in a draft, holds the
  "Добавить сотрудника" select next to the count (with a hint); picking an employee adds a row, ✕
  at the end of a row ("Убрать из версии") removes the employee with all their shifts. Read-only
  versions say that the composition changes only in a draft; "Изменить график" in the notice
  creates that draft.
- "Отправить на согласование" (no validation errors, no unsaved changes) → the production head
  publishes ("Опубликовать", optional reason shown to employees) or returns to draft.
- Publishing supersedes the previous version, computes plan times from the site time zone and
  notifies affected employees; they acknowledge in the bot ("Ознакомлен"). The panel shows who
  acknowledged and can remind ("Напомнить об ознакомлении").
- To change a published month: the alert on the published version offers "Изменить график": a
  draft copy is created, edited, reviewed and published again.
- Drafts and superseded versions can be deleted ("Удалить версию"; for a superseded version the
  button sits in the read-only notice above the grid). A version that shifts were opened against
  cannot be deleted ("версия используется"). Published versions are never deleted.
- "Проверка" lists validation issues with their details labelled in the interface language (for
  example "отдых, мин: 300").

Employees see their plan in the bot under "Мой план" and get reminders before a shift.
