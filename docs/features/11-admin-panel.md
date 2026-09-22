# Administration and roles (spec 2, 9.1, 11)

Sign-in with e-mail and password; two-factor (TOTP) can be enabled in the profile. The profile
also holds the display name and a photo (shrunk to 256×256 in the browser and stored with the
user; without one the panel draws a circle with the initials on a colour derived from the
e-mail), shown in the sidebar and in the user list. Roles: ADMIN,
PRODUCTION_HEAD, HR, PLANNER, SHIFT_MASTER, CLEANLINESS_CONTROLLER, ACCOUNTANT, AUDITOR, each with
a scope (enterprise, site, unit, team, zone). The sidebar shows only the sections the role allows;
"Огляд" ("Обзор") is the landing page: the command center of the current shift with site and unit
selectors, prioritised action cards, shift health, zones, schedule attention, recent events and setup
debt, all limited to the reader's grants. See [Overview: the shift command center](overview-command-center.md).

Administration tabs:

- "Сотрудники": scoped employee directory, CSV import, activation codes, position assignment and
  reasoned block / unblock and delete actions in the row menu and on the profile. A row opens a read-only Sheet; the name and the
  Sheet's profile button open `administration/employees/:employeeId`. There is no expanded editor
  or disclosure chevron. Returning keeps the list filters, selected page and scroll position.
  The profile shows identity, contacts with call/mail/Telegram/copy actions, work assignment and
  its history, designated unit master with missing/inactive/access warnings, derived current or
  next published zone, and a published schedule summary with a focused Schedule link.
  One Edit button opens identity, contacts, birth date and marital status, plus avatar and work
  assignment controls. Save is disabled for unchanged data; validation is inline; a concurrent
  change keeps the draft and requires acknowledging current values before retrying. Terminated
  profiles are read-only apart from existing reasoned status actions.
  ADMIN/HR can edit personal data and dated compensation reference entries; ACCOUNTANT can read
  compensation. Other profile readers receive no compensation or marital status and only birthday
  day/month. Compensation is append-only: corrections need a reason and preserve the original.
  Avatars are private, normalized to 512 px WebP and accessed through scoped endpoints.
  Activation codes and Telegram relinking remain in the row menu. Position checklists are managed
  on the Checklists tab. Delete requires a reason: a card without recorded history (including
  compensation or designated-master references) is removed entirely, a card with history is
  terminated instead so its records stay (owner decision 2026-09-22; there is no separate
  "Terminate" button). A terminated card can be reinstated.
- "Пользователи и роли": create panel users (a generated password is shown once); the user card
  edits the name, lists the roles with "Заменить" (grant the new one, revoke the old) and
  "Отозвать", grants a new role with a scope, and deletes the user ("Удалить пользователя":
  sessions, second factor and roles go with it, the audit keeps the history). Nobody deletes
  themselves and the last administrator stays.
- "Справочники": sites (time zone), units, teams, positions, zones (type, shared, active), reason
  codes; every table has add, edit and delete with a reason. Units have an explicit employee master
  picker and a "needs a master" filter. Designation does not grant panel access. A "Таблица / Дерево"
  switch shows the same units as a collapsible site → unit → sub-unit → people tree: each unit lists
  its shift master, the headcount below it and the employees whose current position is in it
  (terminated ones are hidden); the tree has its own search and a count line, and the choice is
  remembered per browser.
- "Терминалы": register, then everything else in the terminal card (row click): the
  "Подключение планшета" block with the three pairing steps, "Код подключения" and the issued
  code with the tablet link and copy buttons; edit, enable / disable and delete in the card
  footer (a terminal with history is hidden and disabled, its records stay).
- "Чек-листы": see the checklists doc.

### Employee CSV import

Choose a UTF-8 CSV file up to 2 MiB and 1,000 employee rows. Commas and semicolons are supported,
including quoted separators, escaped quotes and multiline names. The first two columns contain
personnel number and full name; a recognized header is optional and extra columns are ignored.
Personnel numbers retain leading zeros. The downloaded template matches the current UI language.

The preview shows valid and invalid rows with pagination and the full count. Import submits only
valid rows. Broken CSV syntax, read failures and exceeded limits block import with a clear message;
empty files are identified explicitly. Choosing a new file replaces the previous preview immediately.
After a request failure, the preview remains available for an explicit retry. The result reports
created and skipped employees. File selection and closing are disabled during submission; closing
afterward returns keyboard focus to the import button. The preview scrolls inside the mobile dialog.

Every section (and every administration tab) has a "Как это работает" block, collapsed by default
with explicit expand/collapse choices remembered per section:
one sentence on what the section is for and the numbered steps of normal use; "Вопросы и ответы"
in the block and the "?" button in the page header open a side panel with the same steps, the
frequently asked questions of that section and a link to the printable guide. The texts live in
`packages/i18n` under `ui.guide` in the three languages, so the support bot, the guide and the
panel say the same thing.

Panel conventions: every table is paginated (10/20/50/100), searchable and sortable. Below the rows,
the visible range and total filtered count remain visible even for small or empty successful lists;
changing pages does not change that total; a row click
opens the details on the right, the ⋯ menu holds the row actions; forms validate inline and the
save button stays disabled until something changed; ⓘ icons carry hints (tap on a phone); every
clickable element shows a pointer cursor and a hover state; filters, tabs and drafts survive a page
reload; the URL keeps the section.

The browser tab is named after the section ("График · Вахта", "Вход · Вахта"), and the panel and
the kiosk share one icon: a 24-hour dial with the day shift in amber and the night shift dotted
(`public/favicon.svg` plus PNG sizes and a web manifest for home-screen installs).

Keyboard: a dialog or side panel opens with the caret in its first field (an ⓘ tip never grabs
the focus, so no tooltip pops up on open); Enter submits a form when its button is enabled,
Ctrl+Enter (⌘+Enter) submits from inside a comment box, including the confirmation dialogs;
Escape closes; table rows are focusable and open on Enter; every control has a visible focus ring.

"Быстрый переход" (⌘K / Ctrl+K, or the button in the header) works like the search of
documentation sites: type a few letters and pick a section, a quick action ("Добавить сотрудника",
"Создать чек-лист", "Зарегистрировать терминал", "Добавить пользователя"), an employee by name or
personnel number, a checklist or a terminal; Enter opens the target. The sidebar footer has the
language switch (🇺🇦 🇬🇧 РУ) and the theme switch: light, dark or "Как в системе".

### Loading feedback

All pending panel surfaces use one shared animated Spinner. Skeleton rows/cards are not used.
Loading, refreshing and saving retain their specific labels; failures, offline states and empty
results remain distinct.

## Shared table interaction

Tables and filters follow the [site-wide standard](../engineering/table-filter-standard.md).
Opening or closing row details, including photos and nested evidence tables, preserves the parent
column widths and mobile card width. Details grow vertically without shifting the surrounding columns.
Record inspection follows the workflow: employees use a read-only Sheet and a dedicated profile;
other records may open inline. Explicit actions initiate editing. Mobile cards preserve sorting,
selection, totals and existing actions. Keyboard users can reach controls with Tab, open records
with Enter/Space and close inline details with Escape. Counts describe the filtered dataset; capped
archives disclose loaded-subset limits rather than claiming a complete archive count.
