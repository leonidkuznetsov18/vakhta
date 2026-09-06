# ADR-0012: Checklists are built by admins per position; photos are checklist items

- Status: accepted
- Date: 2026-09-06
- Spec sources: 5.6, 5.7, FR-CLN-03, FR-CLN-04, FR-PHO-01, FR-PHO-05, FR-HND-01

## Context

The first implementation created one hardcoded checklist (the eight items of spec 5.6) on the first
handover and always demanded three fixed photo angles. The customer runs several positions with
different cleaning duties and wants to compose the checklists in the panel, one per position, with a
photo that cannot be skipped. The position of the employee was ignored when a checklist was picked,
and without a zone on the schedule row the whole handover was silently skipped.

## Decision

A checklist is an ordered list of items of three kinds: `CHECK` (yes / remark, FR-CLN-04), `NOTE` (a
text to the next shift) and `PHOTO` (the employee must send a photo). The three angles of FR-PHO-01
become `PHOTO` items of the default checklist; `handover_media` stores the photo per `item_key`
instead of an enum angle. A checklist must contain at least one `PHOTO` item, enforced in the
domain (`validateChecklistItems`) and in the contracts, so the photo is mandatory by construction.

`checklist_definitions` gets `family_id` and `name`; the panel tab "Checklists" creates, edits,
enables, disables and deletes them. Editing never rewrites a row: it inserts the next version of the
family and retires the previous one, so a submitted handover keeps pointing at the exact items it was
answered against. Deleting is allowed only while no handover refers to any version of the family;
otherwise the checklist is disabled.

At `CLEANING_DONE` the repository picks the active checklist by the employee position (the schedule
assignment, otherwise the current position) and the zone type, in this order: position and zone
type, position only, zone type only, general. When nothing is defined, the default checklist of the
spec is created so the handover never opens without one. The zone is optional on the report:
a shift without a zone (started without a schedule or by a master without picking one) still gets
its checklist, the report has no receiver and is escalated to the master at submission, and
`SUBMIT_HANDOVER` requires a submitted report for every shift unless a master overrides it. The
schedule editor warns when rows have no zone, because a zone is what makes the next shift accept it.

## Consequences

The bot renders the checklist from the definition: a button per item, photo buttons where the admin
put them, issues in checklist order. Item keys are generated on save (`ITEM_01` …) and travel in
callback data, so labels can be anything. Admin-written labels are shown as typed; only the default
checklist is localized from the catalog. Reports of older versions stay readable in the panel.

## Rejected alternatives

Photo required per `CHECK` item as a flag: mixes two answers on one button and does not let the
admin ask for a photo without a question. Keeping the three fixed angles next to the checklist: the
customer wants different photos per position. Editing a definition in place: breaks the audit of
already submitted reports.
