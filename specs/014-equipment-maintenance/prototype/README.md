# Prototype: equipment maintenance screens

**Change**: 014-equipment-maintenance | **Created**: 2026-09-24 | **Spec**: [../spec.md](../spec.md)

Source: `apps/admin-web/src/preview/maintenance-prototype.tsx`. Run `pnpm --filter admin-web dev`
and open `http://localhost:5173/preview.html?prototype=maintenance&screen=<screen>`. Everything is
clickable inside the page (tabs, rows, the "Відкрити ремонт" button); nothing is saved. Data: the
three pilot NEWTOP machines of [../pilot-equipment.md](../pilot-equipment.md) with fictional people.
Screenshots: 1440×900 desktop and 390×844 phone, taken on 2026-09-24.

| #   | Screen      | What it shows                                                                                                                                                                    | Desktop / phone                                                        |
| --- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | `equipment` | Register: state, next maintenance with overdue mark, materials readiness, responsible and backup mechanic, active repair. Phones get cards instead of a table.                   | [desktop](01-equipment-desktop.jpg) · [phone](01-equipment-mobile.jpg) |
| 2   | `card`      | Machine Sheet: stopped state, repair and downtime, mechanics, criticality, tabs Passport / Documents / Plans / History; plan list with source and readiness.                     | [desktop](02-card-desktop.jpg) · [phone](02-card-mobile.jpg)           |
| 3   | `plan`      | Plan editor: 1 source and justification, 2 interval, anchor, first date, duration, stop; 3 operations with photo flags; 4 materials; 5 mechanic and reminders; summary of dates. | [desktop](03-plan-desktop.jpg) · [phone](03-plan-mobile.jpg)           |
| 4   | `calendar`  | Month calendar with planned work, "materials missing" and forecasts; overdue pinned above; phone shows an agenda by day.                                                         | [desktop](04-calendar-desktop.jpg) · [phone](04-calendar-mobile.jpg)   |
| 5   | `work`      | Work queue with the emergency banner, quick filters, status and readiness.                                                                                                       | [desktop](05-work-desktop.jpg) · [phone](05-work-mobile.jpg)           |
| 6   | `review`    | Submitted maintenance: answers per operation with photos and reasons, materials used, return comment, accept; the next date after acceptance.                                    | [desktop](06-review-desktop.jpg) · [phone](06-review-mobile.jpg)       |
| 7   | `emergency` | Emergency repair: acknowledgement countdown, report, delivery and escalation timeline, reassign; release disabled until the repair is done.                                      | [desktop](07-emergency-desktop.jpg) · [phone](07-emergency-mobile.jpg) |
| 8   | `bot`       | Telegram: 7-day reminder with materials and readiness answer, step-by-step execution, emergency to the mechanic, the operator choosing the machine.                              | [desktop](08-bot-desktop.jpg) · [phone](08-bot-mobile.jpg)             |

Questions for the owner while reviewing:

1. Is one section with three tabs right, or should the calendar live inside the existing Schedule?
2. Is the readiness answer ("Все є" / "Чогось бракує") enough for now instead of stock accounting?
3. Should the operator see the machine list in the bot for every problem reason or only for
   breakdowns (the prototype asks only for "Поломка обладнання")?
