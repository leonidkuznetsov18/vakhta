# Administration and roles (spec 2, 9.1, 11)

Sign-in with e-mail and password; two-factor (TOTP) can be enabled in the profile. Roles: ADMIN,
PRODUCTION_HEAD, HR, PLANNER, SHIFT_MASTER, CLEANLINESS_CONTROLLER, ACCOUNTANT, AUDITOR, each with
a scope (enterprise, site, unit, team, zone). The sidebar shows only the sections the role allows;
"Обзор" is the landing page with what needs attention.

Administration tabs:

- "Сотрудники": cards, CSV import, activation codes and QR, position assignment (unit, position,
  team; a transfer keeps the history), checklists of the position, block / unblock / terminate,
  relink Telegram.
- "Пользователи и роли": create panel users (a generated password is shown once), grant and
  revoke roles with a scope.
- "Справочники": sites (time zone), units, teams, positions, zones (type, shared, active), reason
  codes; every table has add, edit and delete with a reason.
- "Терминалы": register, pairing code, enable / disable, edit, delete (a terminal with history
  is hidden and disabled, its records stay).
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

"Быстрый переход" (⌘K / Ctrl+K, or the button in the header) works like the search of
documentation sites: type a few letters and pick a section, a quick action ("Добавить сотрудника",
"Создать чек-лист", "Зарегистрировать терминал", "Добавить пользователя"), an employee by name or
personnel number, a checklist or a terminal; Enter opens the target. The sidebar footer has the
language switch (🇺🇦 🇬🇧 РУ) and the theme switch: light, dark or "Как в системе".
