# Schedule (spec 3, panel section "График")

Filters: site, unit, month. The schedule lives in versions: DRAFT → IN_REVIEW → PUBLISHED, and
SUPERSEDED when a newer version is published. Versions are picked from the "Версия" select
("Версия 7 · Черновик · создана 06.09.26", newest first), with the status, the date and the count
of versions next to it, so a month with dozens of versions stays readable.

- "Новая версия" creates a draft; when a published version exists the draft copies its shifts.
- The grid "employees × days": a shift template per cell (day / night), a zone per row, rotation
  patterns ("Шаблон ротации") to fill a month, keyboard navigation, per-day totals and monthly hour
  limits with warnings. Rows without a zone show a warning: without a zone there is no handover.
  Zones belong to units: when the chosen unit has no active zones, a notice above the grid says
  so and offers "Открыть справочники" (add zones to the unit, or move the employees to a unit
  that has them).
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
- To change a published month, the production head or an administrator edits it in place: the
  grid of the published version is live for them, and "Опубликовать изменения" (optional reason)
  sends the edited month as a new version that is published in the same step
  (`POST /admin/schedules/:id/revise`); the previous version becomes "Заменён", employees whose
  shifts changed are notified and asked to acknowledge. Validation errors reject the whole
  revision and leave nothing behind. A planner, who cannot publish, still uses "Изменить
  график": a draft copy that goes through review.
- Drafts and superseded versions can be deleted ("Удалить версию"; for a superseded version the
  button sits in the read-only notice above the grid). A version that shifts were opened against
  is history: `ScheduleVersionView.deletable` is false and the button is not shown. Published
  versions are never deleted.
- "Проверка" lists validation issues with their details labelled in the interface language (for
  example "отдых, мин: 300").

Employees see their plan in the bot under "Мой план". Shift reminders are scheduled 30 minutes before
the published assignment starts, in the site's timezone (06:30 start → 06:00 reminder). Delivery
rechecks the current plan and approved absences: vacation, sick leave and day off covering the shift's
business date suppress the reminder. Pending/rejected absence requests do not suppress it. Cancelled
or replaced assignments, superseded schedules, inactive employees and already started shifts do not
receive a start reminder. This does not change schedule-publication or acknowledgement messages.

See [shift reminder delivery](../engineering/features/shift-reminders.md) for queued-message handling
and verification evidence.
