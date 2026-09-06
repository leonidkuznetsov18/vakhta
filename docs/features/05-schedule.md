# Schedule (spec 3, panel section "График")

Filters: site, unit, month. The schedule lives in versions: DRAFT → IN_REVIEW → PUBLISHED, and
SUPERSEDED when a newer version is published.

- "Новая версия" creates a draft; when a published version exists the draft copies its shifts.
- The grid "employees × days": a shift template per cell (day / night), a zone per row, rotation
  patterns ("Шаблон ротации") to fill a month, keyboard navigation, per-day totals and monthly hour
  limits with warnings. Rows without a zone show a warning: without a zone there is no handover.
- "Отправить на согласование" (no validation errors, no unsaved changes) → the production head
  publishes ("Опубликовать", optional reason shown to employees) or returns to draft.
- Publishing supersedes the previous version, computes plan times from the site time zone and
  notifies affected employees; they acknowledge in the bot ("Ознакомлен"). The panel shows who
  acknowledged and can remind ("Напомнить об ознакомлении").
- To change a published month: the alert on the published version offers "Изменить график": a
  draft copy is created, edited, reviewed and published again.
- Drafts can be deleted ("Удалить версию").

Employees see their plan in the bot under "Мой план" and get reminders before a shift.
