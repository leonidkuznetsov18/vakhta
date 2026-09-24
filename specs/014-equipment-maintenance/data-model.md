# Data Model: Equipment maintenance

**Change**: 014-equipment-maintenance | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Proposed model for migration `0054` onward. All tables follow C5: `snake_case`, `uuid` ids,
`timestamptz` instants, `date` for site-local business dates, invariants in SQL. Mutable rows carry
`created_at`, `updated_at` and an integer `version` for optimistic concurrency. One database per
tenant (ADR-0015), so there is no `tenant_id`. Names are proposals for the plan; the codes are final
once the spec is accepted.

## Codes (`packages/domain/src/maintenance/codes.ts`)

Each is an `as const` object with a derived type, `z.enum` in contracts and `pgEnum` in the schema (C9).

| Constant                | Values                                                                        | Meaning                                                |
| ----------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| `EquipmentCriticality`  | `HIGH`, `MEDIUM`, `LOW`                                                       | Impact of a stop on production                         |
| `EquipmentState`        | `AVAILABLE`, `RESTRICTED`, `STOPPED`, `UNKNOWN`                               | Confirmed operating state (TZ-M §7)                    |
| `EquipmentDocumentKind` | `OPERATING_MANUAL`, `SERVICE_MANUAL`, `PARTS_LIST`, `WIRING_DIAGRAM`, `OTHER` | Kind of attached document                              |
| `PlanState`             | `DRAFT`, `ACTIVE`, `PAUSED`, `ARCHIVED`                                       | Plan lifecycle                                         |
| `IntervalUnit`          | `DAY`, `WEEK`, `MONTH`                                                        | Calendar interval unit (meter units per D-1)           |
| `AnchorMode`            | `FROM_COMPLETION`, `FIXED_CALENDAR`                                           | How the next due date is counted (TZ-M §19)            |
| `PlanSourceKind`        | `DOCUMENT`, `PLANT_DECISION`                                                  | Where the interval and operations come from            |
| `MaterialKind`          | `PART`, `MATERIAL`, `TOOL`                                                    | What must be on hand                                   |
| `MaterialMode`          | `EVERY_CYCLE`, `IF_NEEDED`                                                    | Always needed, or only if inspection requires          |
| `WorkType`              | `PLANNED_MAINTENANCE`, `EMERGENCY_REPAIR`                                     | Work kind; later: planned repair, diagnostics          |
| `WorkPriority`          | `P0`, `P1`, `P2`, `P3`                                                        | Safety, stopped, degraded, planned (TZ-M §12)          |
| `WorkStatus`            | `ASSIGNED`, `IN_PROGRESS`, `WAITING`, `IN_REVIEW`, `COMPLETED`, `CANCELLED`   | Work lifecycle (TZ-M §14, reduced)                     |
| `OperationResult`       | `DONE`, `NOT_DONE`, `NOT_APPLICABLE`                                          | Answer per operation                                   |
| `WaitReason`            | `NO_PART`, `NEED_SPECIALIST`, `WAITING_WINDOW`, `OTHER`                       | Why work is paused                                     |
| `MaterialsReadiness`    | `UNKNOWN`, `READY`, `MISSING`                                                 | Mechanic's answer to the reminder                      |
| `ReviewDecision`        | `ACCEPTED`, `RETURNED`                                                        | Chief mechanic's decision on submitted work            |
| `ReleaseMode`           | `AVAILABLE`, `RESTRICTED`                                                     | Return to service after a stop                         |
| `StopStartQuality`      | `FROM_REPORT`, `CONFIRMED`                                                    | Whether the stop start is the report time or confirmed |

Existing codes extended: `WebRole.CHIEF_MECHANIC` (D-2, appended to the `web_role` enum),
`TenantModule.MAINTENANCE`, new `TIMER_JOBS`, background task kinds and notification templates.

## Tables

### `positions` (changed)

| Column                 | Type                             | Notes                              |
| ---------------------- | -------------------------------- | ---------------------------------- |
| `performs_maintenance` | `boolean not null default false` | Seeded `true` for `MECHANIC` (A-1) |

### `equipment`

| Column                                   | Type                                           | Constraint / note                                                   |
| ---------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| `id`                                     | uuid PK                                        |                                                                     |
| `code`                                   | text not null                                  | Display code as entered                                             |
| `code_key`                               | text not null                                  | `lower(trim(code))`, unique (FR-003)                                |
| `name`                                   | text not null                                  |                                                                     |
| `site_id`, `org_unit_id`                 | uuid not null                                  | Composite FK `(org_unit_id, site_id)` → `org_units(id, site_id)`    |
| `zone_id`                                | uuid null                                      | FK `responsibility_zones`; the zone's unit must equal `org_unit_id` |
| `equipment_type`                         | text null                                      | Free text in this change (lathe, press, conveyor)                   |
| `manufacturer`, `model`, `serial_number` | text null                                      | Unknown values stay null, never invented (TZ-M §8)                  |
| `manufactured_year`                      | smallint null                                  | Check 1900..current year + 1                                        |
| `commissioned_on`                        | date null                                      |                                                                     |
| `criticality`                            | `equipment_criticality` not null               |                                                                     |
| `responsible_employee_id`                | uuid not null                                  | FK `employees`                                                      |
| `backup_employee_id`                     | uuid null                                      | FK `employees`; check `<> responsible_employee_id`                  |
| `state`                                  | `equipment_state` not null default `AVAILABLE` |                                                                     |
| `state_changed_at`                       | timestamptz not null                           |                                                                     |
| `notes`                                  | text null                                      |                                                                     |
| `archived_at`                            | timestamptz null                               | Archived rows keep history                                          |

Mechanic eligibility (active employee, maintenance position) is checked by the service in the same
transaction; SQL cannot express "current position" cheaply without a trigger.

### `equipment_documents`

| Column             | Type                               | Constraint / note                                                  |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------ |
| `id`               | uuid PK                            |                                                                    |
| `title`            | text not null                      |                                                                    |
| `kind`             | `equipment_document_kind` not null |                                                                    |
| `language`         | text null                          | ISO 639-1 code of the document                                     |
| `edition`          | text null                          | Edition, revision or year printed on the document                  |
| `source_url`       | text null                          | Check `~ '^https?://'`; never fetched (research R3)                |
| `storage_key`      | text not null unique               | Private object key under the tenant prefix                         |
| `content_type`     | text not null                      | Check `= 'application/pdf'`                                        |
| `size_bytes`       | bigint not null                    | Check `> 0 and <= 52428800`                                        |
| `sha256`           | text not null                      |                                                                    |
| `telegram_file_id` | text null                          | Cached after the first bot send to avoid re-upload                 |
| `status`           | text not null                      | `UPLOADING`, `READY`, `DELETING` as in `communication_attachments` |
| `uploaded_by`      | text not null                      | Web user id                                                        |

### `equipment_document_links`

`equipment_id`, `document_id`, `linked_at`, `linked_by`, `unlinked_at`, `unlinked_by`, `id` PK.
Partial unique `(equipment_id, document_id) where unlinked_at is null` (FR-010, FR-011).

### `maintenance_plans`

| Column                           | Type                  | Constraint / note                            |
| -------------------------------- | --------------------- | -------------------------------------------- |
| `id`                             | uuid PK               |                                              |
| `equipment_id`                   | uuid not null         | FK                                           |
| `title`                          | text not null         |                                              |
| `state`                          | `plan_state` not null |                                              |
| `active_version_id`              | uuid null             | Set on publish; null only in `DRAFT` (check) |
| `draft_version_id`               | uuid null             | The editable next version, if any            |
| `first_due_on`                   | date null             | Required to publish (FR-022)                 |
| `pause_reason`, `archive_reason` | text null             | Required in their states (check)             |

### `maintenance_plan_versions`

| Column                         | Type                        | Constraint / note                                                  |
| ------------------------------ | --------------------------- | ------------------------------------------------------------------ |
| `id`                           | uuid PK                     |                                                                    |
| `plan_id`, `revision`          | uuid, int                   | Unique `(plan_id, revision)`                                       |
| `interval_unit`                | `interval_unit` not null    |                                                                    |
| `interval_count`               | int not null                | Check `> 0`                                                        |
| `anchor_mode`                  | `anchor_mode` not null      |                                                                    |
| `source_kind`                  | `plan_source_kind` not null |                                                                    |
| `source_document_id`           | uuid null                   | Required when `DOCUMENT` (check)                                   |
| `source_reference`             | text null                   | Page, section or table in the document                             |
| `source_note`                  | text null                   | Required when `PLANT_DECISION` (check)                             |
| `estimated_minutes`            | int not null                | Check `> 0`                                                        |
| `requires_stop`                | boolean not null            |                                                                    |
| `assignee_employee_id`         | uuid not null               |                                                                    |
| `published_at`, `published_by` | timestamptz, text null      | A trigger rejects content updates once `published_at` is set (R10) |

`maintenance_plan_operations(id, version_id, ordinal, text, place, photo_required)` with unique
`(version_id, ordinal)`, and `maintenance_plan_materials(id, version_id, ordinal, kind, name,
article, quantity numeric check > 0, unit, mode)`. Both are immutable with their version.

### `work_orders`

| Column                                                                       | Type                                             | Constraint / note                                                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `id`                                                                         | uuid PK                                          |                                                                                    |
| `number`                                                                     | bigint identity                                  | Human number shown in bot and panel                                                |
| `type`                                                                       | `work_type` not null                             |                                                                                    |
| `priority`                                                                   | `work_priority` not null                         | `P3` for planned maintenance                                                       |
| `equipment_id`                                                               | uuid not null                                    |                                                                                    |
| `plan_id`, `plan_version_id`, `cycle_key`                                    | uuid, uuid, text null                            | Required for `PLANNED_MAINTENANCE` (check); unique `(plan_id, cycle_key)` (FR-024) |
| `incident_id`                                                                | uuid null                                        | FK `downtime_incidents`                                                            |
| `status`                                                                     | `work_status` not null                           |                                                                                    |
| `due_on`, `planned_on`                                                       | date null                                        | Required for planned maintenance (check)                                           |
| `assignee_employee_id`                                                       | uuid not null                                    | Personal responsibility (TZ-M R01)                                                 |
| `lead_employee_id`                                                           | uuid null                                        | Who accepted an emergency repair                                                   |
| `ack_due_at`, `accepted_at`                                                  | timestamptz null                                 | Emergency acknowledgement; not reset by reassignment (TZ-M R07)                    |
| `escalated_at`                                                               | timestamptz null                                 |                                                                                    |
| `started_at`, `submitted_at`, `performed_at`, `completed_at`, `cancelled_at` | timestamptz null                                 | Check order where both set                                                         |
| `performed_by_employee_id`, `entered_by`                                     | uuid, text null                                  | Panel entry on behalf (FR-054)                                                     |
| `readiness`                                                                  | `materials_readiness` not null default `UNKNOWN` |                                                                                    |
| `readiness_note`                                                             | text null                                        | Missing items as text/ids                                                          |
| `cancel_reason`                                                              | text null                                        | Required when `CANCELLED` (check)                                                  |
| `report_summary`, `cause`                                                    | text null                                        | Emergency: what was done, cause                                                    |

Partial unique index: one non-final `EMERGENCY_REPAIR` per `equipment_id` (AC-047).

Children:

- `work_order_operation_results(work_order_id, operation_id, result, reason, media_object_id,
answered_by, answered_at)`, unique `(work_order_id, operation_id)`; check reason required for
  `NOT_DONE` and `NOT_APPLICABLE`.
- `work_order_materials_used(id, work_order_id, material_id null, name, article, quantity, unit,
recorded_by, recorded_at)`.
- `work_order_waits(id, work_order_id, reason, note, started_at, ended_at)`; exclusion constraint
  on `tstzrange(started_at, ended_at, '[)')` per work order, as for activity intervals.
- `work_order_reviews(id, work_order_id, iteration, decision, comment, reviewer, reviewed_at)`,
  unique `(work_order_id, iteration)`.

### `equipment_stop_episodes`

| Column                                             | Type                          | Constraint / note                                                            |
| -------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------- |
| `id`                                               | uuid PK                       |                                                                              |
| `equipment_id`                                     | uuid not null                 | Partial unique where `released_at is null` (TZ-M R02)                        |
| `incident_id`                                      | uuid null                     | Incident that opened it                                                      |
| `started_at`                                       | timestamptz not null          |                                                                              |
| `start_quality`                                    | `stop_start_quality` not null |                                                                              |
| `released_at`                                      | timestamptz null              | Check `>= started_at`                                                        |
| `release_mode`, `release_condition`, `released_by` |                               | Required together when released (check); condition required for `RESTRICTED` |

### Incident tables (changed)

`downtime_incidents.equipment_id` and `downtime_reports.equipment_id`: uuid null, FK `equipment`.
Nothing else in the incident model changes (FR-067).

## Timers, notifications and settings

Durable `background_tasks` kinds (the kind CHECK is recreated in the migration, as in `0049`):

| Kind                     | Key                                               | Fires at                                   |
| ------------------------ | ------------------------------------------------- | ------------------------------------------ |
| `MAINTENANCE_REMINDER`   | `maintenance-reminder.<work>.<planned_on>.<days>` | `planned_on − days` at local reminder time |
| `EMERGENCY_ACK_DEADLINE` | `emergency-ack.<work>`                            | `ack_due_at`                               |
| `EMERGENCY_ESCALATION`   | `emergency-escalation.<work>`                     | `ack_due_at + escalation gap`              |

Outbox dedupe keys: `maintenance-reminder:<work>:<planned_on>:<days>:<employee>`,
`maintenance-assigned:<work>:<planned_on>:<employee>`, `emergency-assigned:<work>:<employee>`,
`emergency-escalation:<work>:<stage>:<employee>`, `maintenance-readiness:<work>:<version>`.

Tenant settings (`settings`, edited on the control panel's Parameters tab):

| Key                                  | Default                  |
| ------------------------------------ | ------------------------ |
| `maintenance.reminder_offsets_days`  | `[7, 3, 1]`              |
| `maintenance.reminder_local_time`    | `09:00`                  |
| `maintenance.document_max_bytes`     | `52428800`               |
| `maintenance.ack_minutes`            | `{P0: 2, P1: 5, P2: 30}` |
| `maintenance.escalation_gap_minutes` | `5`                      |

## Events and audit

`audit_log` actions: `equipment.create|update|archive|state_correct`, `equipment_document.upload|link|unlink`,
`maintenance_plan.create|update|publish|pause|resume|archive|copy`.

`domain_events` types (payload carries `equipment_id`, `work_order_id`, `plan_id` as applicable):
`WORK_ORDER_CREATED`, `WORK_ORDER_REPLANNED`, `WORK_ORDER_REASSIGNED`, `WORK_ORDER_ACCEPTED`,
`WORK_ORDER_DECLINED`, `WORK_ORDER_STARTED`, `WORK_ORDER_WAITING`, `WORK_ORDER_RESUMED`,
`WORK_ORDER_SUBMITTED`, `WORK_ORDER_REVIEWED`, `WORK_ORDER_CANCELLED`, `WORK_ORDER_ACK_ESCALATED`,
`MAINTENANCE_READINESS_REPORTED`, `EQUIPMENT_STOPPED`, `EQUIPMENT_RELEASED`.
