# Administration and roles (spec 2, 9.1, 11)

Sign-in with e-mail and password; two-factor (TOTP) can be enabled in the profile. Roles: ADMIN,
PRODUCTION_HEAD, HR, PLANNER, SHIFT_MASTER, CLEANLINESS_CONTROLLER, ACCOUNTANT, AUDITOR, each with
a scope (enterprise, site, unit, team, zone). The sidebar shows only the sections the role allows;
"Обзор" is the landing page with what needs attention.

Administration tabs:

- "Сотрудники": cards, CSV import, activation codes and QR, position assignment (unit, position,
  team; a transfer keeps the history), checklists of the position, block / unblock / terminate,
  relink Telegram. The creation form takes the personnel number and the full name plus optional
  contacts: e-mail, phone and Telegram username; every field has a placeholder, an ⓘ hint and
  inline validation (the phone is normalized to +380…, the username is stored without "@"). The
  card shows the contacts as mail / call / t.me links; "Изменить данные" turns them into a form
  (personnel number, full name, e-mail, phone, Telegram, same hints and validation, save only
  when something changed; every edit lands in the audit with before / after). The collapsible
  "Активация в боте" block holds the steps for the administrator, "Выдать код активации", the
  send buttons (e-mail, Telegram) and the last issued code with copy, the bot link and the QR;
  the row action "Код активации" opens the card with a fresh code.
- "Пользователи и роли": create panel users (a generated password is shown once); the user card
  edits the name, lists the roles with "Заменить" (grant the new one, revoke the old) and
  "Отозвать", grants a new role with a scope, and deletes the user ("Удалить пользователя":
  sessions, second factor and roles go with it, the audit keeps the history). Nobody deletes
  themselves and the last administrator stays.
- "Справочники": sites (time zone), units, teams, positions, zones (type, shared, active), reason
  codes; every table has add, edit and delete with a reason.
- "Терминалы": register, then everything else in the terminal card (row click): the
  "Подключение планшета" block with the three pairing steps, "Код подключения" and the issued
  code with the tablet link and copy buttons; edit, enable / disable and delete in the card
  footer (a terminal with history is hidden and disabled, its records stay).
- "Чек-листы": see the checklists doc.

Every section (and every administration tab) opens with a collapsible "Как это работает" block:
one sentence on what the section is for and the numbered steps of normal use; "Вопросы и ответы"
in the block and the "?" button in the page header open a side panel with the same steps, the
frequently asked questions of that section and a link to the printable guide. The texts live in
`packages/i18n` under `ui.guide` in the three languages, so the support bot, the guide and the
panel say the same thing.

Panel conventions: every table is paginated (10/20/50/100), searchable and sortable; a row click
opens the details on the right, the ⋯ menu holds the row actions; forms validate inline and the
save button stays disabled until something changed; ⓘ icons carry hints (tap on a phone); every
clickable element shows a pointer cursor and a hover state; filters, tabs and drafts survive a page
reload; the URL keeps the section.

Keyboard: a dialog or side panel opens with the caret in its first field (an ⓘ tip never grabs
the focus, so no tooltip pops up on open); Enter submits a form when its button is enabled,
Ctrl+Enter (⌘+Enter) submits from inside a comment box, including the confirmation dialogs;
Escape closes; table rows are focusable and open on Enter; every control has a visible focus ring.

"Быстрый переход" (⌘K / Ctrl+K, or the button in the header) works like the search of
documentation sites: type a few letters and pick a section, a quick action ("Добавить сотрудника",
"Создать чек-лист", "Зарегистрировать терминал", "Добавить пользователя"), an employee by name or
personnel number, a checklist or a terminal; Enter opens the target. The sidebar footer has the
language switch (🇺🇦 🇬🇧 РУ) and the theme switch: light, dark or "Как в системе".
