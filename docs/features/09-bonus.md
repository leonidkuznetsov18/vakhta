# Bonus points and monthly nominations

The panel shows the checklist point ledger and its history. An approved checklist earns one point.
Monthly nominations recognize Employee of the Month, Department of the Month, and Master of the
Month. The current read-only panel does not offer manual scoring or period reopening.

Before finalization the panel labels nominations as preliminary. The scheduled close runs from the
second day of the following month in the site's timezone. Each site and month receives one final
result, including months without eligible winners. The panel shows when that decision was recorded.

- Department of the Month has the most checklist points recorded against that department.
- Its currently active assigned employees each receive the existing one-point department award.
- All current shift masters scoped to that department share Master of the Month. Each active
  employee record matched by the existing email rule receives the existing one-point master award.
- Employee of the Month has the highest total ledger points, including the monthly awards.
  A person's points across departments of the selected site are combined before selection.
- Equal scores use name order and then stable identifier order. Only positive totals qualify.

Finalization records the winners' identities, names and points, the full list of winning masters,
monthly awards and Telegram cards together. Repeated execution returns that result without awarding
or notifying again. The worker receives the existing localized card; no new action is required.

Later checklist approvals remain visible in the point ledger and history. They do not replace a
final winner or award another department. Renaming people or departments, transferring employees,
and changing master roles also leave the final nominations unchanged. The live totals below the
nomination cards may therefore differ from the totals frozen on the cards.

An aggregate request without a selected site is a live comparison, not a global final decision.
Final monthly nominations are separate from the older shift-score and manual-review APIs still
present for compatibility; this change does not revise their scoring rules.

The remaining reliability work preserves accepted inputs for those compatibility APIs and freezes a
consistent calculation when a period closes. It adds no worker steps or manual scoring controls to
the current panel. Implementation status, recovery and concurrency requirements are recorded in
[durable bonus recalculation](../engineering/features/bonus-recalculation.md).
