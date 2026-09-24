# ADR-0018: Equipment maintenance as a tenant module with work orders beside incidents

- Status: accepted (2026-09-24, the owner asked to implement spec 014)
- Date: 2026-09-24
- Spec sources: owner request 2026-09-24; customer document «ТЗ обслуживание и ремонт оборудования»
  v1.3 (TZ-M) §1, §5, §14, §18–19, §23; `specs/014-equipment-maintenance/`

## Context

The MVP excluded equipment (`docs/product-vision.md`); a zone is the smallest object of
responsibility. The owner now requests a machine register with manuals, planned maintenance with a
calendar and Telegram reminders to a responsible mechanic, and an emergency repair scenario. The
existing incident model already records what operators report and the master's first response, but
it has no machine, no mechanic assignment and no notion of a machine being out of service.

## Decision

Equipment maintenance is a tenant module `MAINTENANCE`, off by default. `equipment` is a new
aggregate that belongs to a unit and optionally stands in a zone; zones keep their meaning.
Maintenance and repair work are `work_orders` with their own pure transition table. An incident
stays the record of what happened and of the master's response; an emergency repair is a work order
linked to the incident and assigned to the machine's mechanic. A machine's unavailability is an
`equipment_stop_episodes` row, at most one open per machine, ended only by an explicit release; it is
independent of an operator's personal `DOWNTIME` interval. Plans are versioned; a work order keeps
the version it was created from. Reminders and acknowledgement deadlines use the existing durable
timer tasks and notification outbox.

## Consequences

Existing incident, shift and bonus behavior is unchanged. The machine becomes the anchor for later
stages of TZ-M (meter hours, nodes and parts, stock, purchasing) without reworking incidents.
Panel users cannot receive Telegram messages, so escalations to the chief mechanic and production
head are panel signals; Telegram escalations go to employees (backup mechanic, unit master).
The product-vision scope row changes when the first delivery ships.

## Rejected alternatives

Treating each zone as a machine: zones model workplaces and handover; a machine needs passport data,
documents, plans and a state that zones do not carry. Extending incident statuses to cover repair
work: mixes the master's response SLA with the mechanic's execution and cannot represent planned
maintenance. A separate CMMS product: duplicates identities, bot and notifications for a pilot of a
few machines.
