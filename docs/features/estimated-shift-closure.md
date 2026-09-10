# Estimated shift closure

The worker finishes cleaning and sends the checklist, then confirms departure using the kiosk QR.
The Finish Shift button continues to open that workflow; it never closes the shift itself.

Day shifts are planned for 08:00–20:00 and night shifts for 20:00–08:00 in the site's timezone.
The worker has two hours after the planned end to complete the report and confirm QR departure.
A valid departure at 20:00 or 21:33 records that actual confirmation time, including overtime.

Without a confirmed departure, the system closes the shift at the two-hour deadline (22:00 or
10:00), accounting time only through the planned end (20:00 or 08:00). Actual physical departure
is unknown. A delayed scanner never adds its own delay to employee time. The panel, report export
and bot distinguish this estimated closure and ask for master clarification. Missing required
checklists retain the NO_CHECKLIST marker.

Original events remain immutable. Recorded activity during the grace window remains in the
compensating history even when its accounting interval becomes zero length. A master can review
and correct the accounting projection through the existing audited correction workflow.

A departure confirmation belongs to the presence that displayed it. An old confirmation cannot
close a later presence or shift; the worker must scan a fresh QR. Existing open presences linked
only to already closed shifts are reconciled to unknown departure without inventing an exit time.
Unlinked presences and presences still linked to an active shift are not treated as historical orphans.

See [engineering decisions and evidence](../engineering/features/estimated-shift-closure.md).
