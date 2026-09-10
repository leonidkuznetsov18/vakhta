# Reports and audit (spec 9.3, 13)

## Time losses

The panel reports where recorded shift time went: a Pareto of non-working categories, their
reasons, and the underlying intervals. It shows total recorded time, time outside main work and
the share with a recorded reason. This describes employee activity records, not equipment output,
production cost, employee fault or OEE. Filters select a business-date range, site and department.
Choosing a category opens its reasons and interval detail.

Each interval belongs to the employee's department at the start of that shift. A later transfer
cannot move those minutes to a new department. Missing historical assignment stays unassigned.
Several reports during one interval appear as one combined comment; they never duplicate time.
Minutes are rounded once per interval and those same values are summed in the chart and export.

The page states the calculation cutoff. Open intervals, and intervals that ended after the cutoff,
count only through that instant. Every execution uses a consistent database snapshot. Export uses
the displayed cutoff, but historical corrections made later can change a later execution: this is
not a saved, immutable version of the report.

Detail displays at most 500 intervals, with the actual matching count and an explicit truncation
notice. CSV and XLSX include all matching intervals up to 20,000; larger exports are rejected, and
the page asks the reader to narrow the dates or department. An export never silently omits rows.
Every exported data row includes the cutoff and generation time. Every successful export is audited
with its filters, actual row count and times.

Technical decisions and verification: [loss report integrity](../engineering/features/loss-reports.md).

## Audit

The audit page lists panel and bot actions. It identifies the actor by email or employee name and
shows action, object, reason, before/after values and raw JSON. The event journal shows shift domain
events and corrections. Both logs are append-only.
