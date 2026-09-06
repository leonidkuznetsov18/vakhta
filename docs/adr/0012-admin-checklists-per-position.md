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

`checklist_definitions` gets `family_id` and `name`; positions are bound through
`checklist_definition_positions`, so one checklist may serve several positions and an existing
checklist is attached to a position from the employee card without a copy. The panel tab
"Checklists" creates, edits, enables, disables and deletes them. Editing never rewrites a row: it inserts the next version of the
family and retires the previous one, so a submitted handover keeps pointing at the exact items it was
answered against. Deleting is allowed only while no handover refers to any version of the family;
otherwise the checklist is disabled.

At `CLEANING_DONE` the repository picks the active checklist of the employee position (the schedule
assignment, otherwise the current position): the one for the zone type of the shift when it exists,
otherwise the one for any zone type. The position is the key: no position, or a position without a
checklist, means no draft, no checklist button in the bot and no report required for `SUBMIT_HANDOVER`;
there is no built-in default any more (the panel can prefill the spec 5.6 items). When a checklist
applies, the report is mandatory for that shift unless a master overrides the transition. The zone is
optional on the report: a shift without a zone still gets its checklist, the report has no receiver
and is escalated to the master at submission. The employees table shows the checklist of each
employee's position so the admin sees who will be asked for one. The schedule editor warns when rows
have no zone, because a zone is what makes the next shift accept the report.

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

## Amendment (2026-09-06): one checklist per position, position required

The customer asked for a single checklist per position: "the checklist can be deleted or replaced
by another one; we cannot add more than one". Migration 0017 replaces the composite index of
`checklist_definition_positions` with a unique index on `position_id` (duplicates are resolved by
keeping the newest active binding). Binding a definition to a position moves the binding away from
the previous definition; a definition left without positions is disabled (`retireOrphans`) and can
be enabled again only with a position (`CHECKLIST_NO_POSITIONS`). `SaveChecklistCommand.positionIds`
requires at least one position. The zone-type preference of the lookup stays for the case of a
position whose only checklist has a zone type. The employee card shows the one checklist with
"Заменить" and "Убрать".
