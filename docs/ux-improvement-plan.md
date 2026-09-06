# UI/UX improvement plan (panel, kiosk, bot)

Review date: 2026-09-06, version 0.4.0. Status on 2026-09-06 evening: phases 1 and 2 are
shipped in full; phase 3 is shipped except the three items listed under "Deferred". Sources: page code in `apps/admin-web`, the kiosk, the bot
screens, and pilot screenshots. Findings are grouped by phase; each item names the screen, the
problem and the change. Every change follows `CLAUDE.md`: shadcn primitives only, texts in
`@vakhta/i18n` in three languages, tooltips on non-obvious controls, hover/active/focus states.

## Phase 1: quick wins (1–2 days)

| Screen         | Problem                                                                                      | Change                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| All pages      | Success messages are inline alerts at the top; they stay until the next action and go unseen | Sonner toasts for successes (`components/ui/sonner.tsx` is installed); keep inline `Alert` only for errors next to the form           |
| All pages      | Nothing is shown while data loads; tables appear at once                                     | `Skeleton` rows in `DataTable` while `rows` is undefined; spinner only for the first load of the shell                                |
| All lists      | Empty states are one sentence without a way forward                                          | `EmptyState` with a primary action ("Add employee", "Register terminal", "Create draft") and a short explanation                      |
| Admin tabs     | Create forms sit above the table and stretch across the full width (terminal name is 1500px) | "Add" button in the section header opens a `Dialog`; forms get `max-w-2xl`; the table becomes the first thing on the tab              |
| All forms      | Comments and reasons are single-line `Input`s                                                | `Textarea` with 2 rows for comment/reason fields; character counter when a limit applies                                              |
| Row menus      | Entries are text only                                                                        | lucide icons per entry (Pencil, Trash2, KeyRound, Power, Eye) so the menu scans faster; destructive entries at the bottom             |
| Requests       | Step shows the raw role code (`1/1 · ADMIN`)                                                 | Localized role name from `roles` catalog; step as "1 of 1 · Administrator"                                                            |
| Incidents      | SLA column shows an absolute time only                                                       | Remaining time ("in 25 min", "overdue by 12 min") with a warning tone under 15 min; absolute time in a tooltip                        |
| Live shift     | The master has to scan the whole table to see who is where                                   | KPI chips above the table: Working N · Break N · Meal N · Downtime N · Not started N; chips filter the table; exceptions sorted first |
| Live shift     | "Open shift for employee" is a form at the bottom                                            | Toolbar button that opens a `Dialog`                                                                                                  |
| Schedule       | Version tabs look like one line of text; month name is missing above the grid                | Tabs with a status `Badge` and version date; grid title "September 2026"; per-day footer with day/night headcount                     |
| Audit          | Actions are raw codes, filters are free text, before/after is a JSON dump                    | Localized action labels, `Select` filters built from the distinct values, side-by-side before/after                                   |
| Sidebar        | The footer shows only the e-mail                                                             | Primary role badge under the name; tooltip with all roles and scopes                                                                  |
| Secondary text | `text-xs` for secondary lines is small for a shop floor tablet                               | `text-sm` for secondary lines in tables; keep `text-xs` for timestamps only                                                           |

## Phase 2: structure (3–5 days)

| Screen             | Problem                                                                                  | Change                                                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All tables         | Details and forms expand inside the table and get cramped (position form)                | Row click opens a `Sheet` on the right with details, history and actions; expanded rows remain for the schedule grid and bonus breakdown only                          |
| All lists          | No search or sorting                                                                     | Quick search box (name, personnel number, reason) and sortable columns for lists over 20 rows; server-side paging when lists exceed 200                                |
| Overview           | The panel opens on the live shift with an empty table; nothing says what needs attention | "Overview" section: tiles for open incidents, SLA breaches, disputes, requests waiting for me, unacknowledged schedule, unpaired terminals; sidebar badges with counts |
| Employees          | 80 employees are entered by hand; the activation link is copied manually                 | CSV import with a preview and a validation report; a QR of the activation deep link that the employee scans; printable code sheet per team                             |
| Handover           | Photos are links that open in a new tab                                                  | Thumbnails loaded through the signed link on expand, lightbox with before/after side by side, quality flag on the thumbnail                                            |
| Directories        | No edit or delete for sites, units, teams, positions, zones; five stacked forms          | Same CRUD pattern as terminals (row menu with edit dialog and delete with reason; delete refused when referenced); tabs inside the section                             |
| Users              | Password typed in a plain field; no way to hand it over safely                           | "Generate" button, show once with copy, forced 2FA on first sign-in; later: invitation links                                                                           |
| Mobile             | Tables with 8+ columns on a phone are a horizontal scroll                                | Card layout under `md`: employee, state and time on one card, the rest in the sheet; column priority classes on `DataTable`                                            |
| Incidents/Handover | Status change is a select plus "Apply"                                                   | Allowed transitions as direct entries in the row menu and as buttons in the sheet; comment asked in the confirm dialog when required                                   |
| Forms              | Native browser validation popups                                                         | react-hook-form with the zod contracts from `@vakhta/contracts`; inline errors through `FormField.error`                                                               |

## Phase 3: later

- Reports: charts with the shadcn chart primitives (downtime by reason, plan vs. actual hours per unit, score distribution), a period comparison and a printable page.
- Command palette (⌘K) for employees, incidents and sections; deep links to an entity (`#/requests/<id>`).
- Keyboard navigation in the schedule grid (arrows, D/N/space), fill patterns (2/2 rotation), copy a row to the next month, per-employee month totals with limit warnings inline.
- Bulk actions: remind acknowledgement, issue activation codes for a team, close several incidents.
- Dark mode toggle in the profile (tokens already exist); density switch for tables.
- Kiosk: clock and date on screen, terminal name in the header, "last sync" indicator; optional fullscreen and wake-lock request on load.
- Bot: `setMyCommands` with /plan, /scores, /requests, /language, /help; a "Help" button linking to the guide sections; a persistent reply keyboard for the three most used actions during a shift.

## Deferred from phase 3

- Reports: period-over-period comparison (the chart and the print view are in).
- Schedule: copying a row to the next month (rotation patterns cover the common case).
- Bot: a persistent reply keyboard; the command menu and the Help button were added instead, so
  the stateless screen model stays intact.

## Out of scope for the pilot

Notifications inside the panel (web push), multi-site switcher in the header, custom dashboards, themeable branding.
