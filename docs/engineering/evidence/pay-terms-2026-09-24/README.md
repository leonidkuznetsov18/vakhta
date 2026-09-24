# Employee pay terms prototype captures, 2026-09-24

Fixture-rendered states of the card section «Должности и оплата» (spec 015), captured by
`apps/admin-web/e2e/pay-terms.spec.ts` from `apps/admin-web/e2e/pay-terms.html?state=<key>` on
the preinstalled Chromium. Desktop is 1440 px; mobile is iPhone 13 (390 px). Prototype copy is
Russian, the base UI language. The node block «Условия оплаты» is captured with the org structure
set (`../org-structure-2026-09-24/section-desktop.jpg`).

## Reading

The section: employment line, assignments, components with «Из группы · Персонально ·
Применено», month preview, one-time corrections, history.

![Read state, desktop](read-desktop.jpg)

Resolution path of one component (CFG-07).

![Resolution path, desktop](path-desktop.jpg)

History expanded: draft supplement, one-time bonus, personal replace, transfer, migration.

![History, desktop](history-desktop.jpg)

## Access variants

Accountant: read without editing.

![Accountant, desktop](accountant-desktop.jpg)

Names only: a role that sees groups and levels without amounts.

![Names only, desktop](names-only-desktop.jpg)

## Editors

Personal replace of a component (Sheet with value, unit, dates, after-end rule, reason,
was → becomes).

![Replace editor, desktop](replace-desktop.jpg)

Add a supplement.

![Add supplement, desktop](add-desktop.jpg)

Level change from the position's scale with a per-month preview (PROC-05).

![Level change, desktop](level-desktop.jpg)

One-time correction (GRP-09).

![One-time correction, desktop](adjustment-desktop.jpg)

Transfer with old and new sources and a decision per personal exception (PROC-06, CFG-06).

![Transfer, desktop](transfer-desktop.jpg)

## Mobile

![Read state, mobile](read-mobile.jpg)
