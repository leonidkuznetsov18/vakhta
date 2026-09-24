import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  ANCHOR_MODES,
  EQUIPMENT_CRITICALITIES,
  EQUIPMENT_DOCUMENT_KINDS,
  EQUIPMENT_STATES,
  INTERVAL_UNITS,
  MATERIALS_READINESS,
  MATERIAL_KINDS,
  MATERIAL_MODES,
  OPERATION_RESULTS,
  PLAN_SOURCE_KINDS,
  PLAN_STATES,
  RELEASE_MODES,
  REVIEW_DECISIONS,
  STOP_START_QUALITIES,
  WAIT_REASONS,
  WORK_PRIORITIES,
  WORK_STATUSES,
  WORK_TYPES,
} from '@vakhta/domain';
import { employees } from './identity.js';
import { downtimeIncidents } from './incidents.js';
import { mediaObjects } from './media.js';
import { orgUnits, responsibilityZones, sites } from './org.js';

/** Equipment maintenance module (spec 014): register, manuals, plans, work orders, stops. */

export const equipmentCriticality = pgEnum('equipment_criticality', EQUIPMENT_CRITICALITIES);
export const equipmentState = pgEnum('equipment_state', EQUIPMENT_STATES);
export const equipmentDocumentKind = pgEnum('equipment_document_kind', EQUIPMENT_DOCUMENT_KINDS);
export const maintenancePlanState = pgEnum('maintenance_plan_state', PLAN_STATES);
export const maintenanceIntervalUnit = pgEnum('maintenance_interval_unit', INTERVAL_UNITS);
export const maintenanceAnchorMode = pgEnum('maintenance_anchor_mode', ANCHOR_MODES);
export const maintenancePlanSource = pgEnum('maintenance_plan_source', PLAN_SOURCE_KINDS);
export const maintenanceMaterialKind = pgEnum('maintenance_material_kind', MATERIAL_KINDS);
export const maintenanceMaterialMode = pgEnum('maintenance_material_mode', MATERIAL_MODES);
export const workOrderType = pgEnum('work_order_type', WORK_TYPES);
export const workOrderPriority = pgEnum('work_order_priority', WORK_PRIORITIES);
export const workOrderStatus = pgEnum('work_order_status', WORK_STATUSES);
export const workOperationResult = pgEnum('work_operation_result', OPERATION_RESULTS);
export const workWaitReason = pgEnum('work_wait_reason', WAIT_REASONS);
export const materialsReadiness = pgEnum('materials_readiness', MATERIALS_READINESS);
export const workReviewDecision = pgEnum('work_review_decision', REVIEW_DECISIONS);
export const equipmentReleaseMode = pgEnum('equipment_release_mode', RELEASE_MODES);
export const stopStartQuality = pgEnum('stop_start_quality', STOP_START_QUALITIES);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const equipment = pgTable(
  'equipment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    /** lower(trim(code)): the unique key, so "M01" and " m01" are one machine. */
    codeKey: text('code_key').notNull(),
    name: text('name').notNull(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id),
    orgUnitId: uuid('org_unit_id').notNull(),
    zoneId: uuid('zone_id').references(() => responsibilityZones.id),
    equipmentType: text('equipment_type'),
    manufacturer: text('manufacturer'),
    model: text('model'),
    serialNumber: text('serial_number'),
    manufacturedYear: smallint('manufactured_year'),
    commissionedOn: date('commissioned_on'),
    criticality: equipmentCriticality('criticality').notNull(),
    responsibleEmployeeId: uuid('responsible_employee_id')
      .notNull()
      .references(() => employees.id),
    backupEmployeeId: uuid('backup_employee_id').references(() => employees.id),
    state: equipmentState('state').notNull().default('AVAILABLE'),
    stateChangedAt: timestamp('state_changed_at', { withTimezone: true }).notNull().defaultNow(),
    restriction: text('restriction'),
    notes: text('notes'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('equipment_code_key_uq').on(t.codeKey),
    foreignKey({
      name: 'equipment_unit_site_fk',
      columns: [t.orgUnitId, t.siteId],
      foreignColumns: [orgUnits.id, orgUnits.siteId],
    }),
    index('equipment_unit_idx').on(t.orgUnitId),
    index('equipment_zone_idx').on(t.zoneId),
    index('equipment_responsible_idx').on(t.responsibleEmployeeId),
    check(
      'equipment_code_key_valid',
      sql`${t.codeKey} = lower(btrim(${t.code})) AND ${t.codeKey} <> ''`,
    ),
    check(
      'equipment_backup_distinct',
      sql`${t.backupEmployeeId} IS DISTINCT FROM ${t.responsibleEmployeeId}`,
    ),
    check(
      'equipment_year_valid',
      sql`${t.manufacturedYear} IS NULL OR ${t.manufacturedYear} BETWEEN 1900 AND 2100`,
    ),
    check(
      'equipment_restriction_valid',
      sql`${t.state} <> 'RESTRICTED' OR ${t.restriction} IS NOT NULL`,
    ),
    check('equipment_version_valid', sql`${t.version} > 0`),
  ],
);

export const equipmentDocuments = pgTable(
  'equipment_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    kind: equipmentDocumentKind('kind').notNull(),
    language: text('language'),
    edition: text('edition'),
    /** Where the file was downloaded from; stored as text and never fetched by the server. */
    sourceUrl: text('source_url'),
    storageKey: text('storage_key').notNull().unique(),
    contentType: text('content_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    /** Cached after the first bot send so Telegram does not receive the file twice. */
    telegramFileId: text('telegram_file_id'),
    uploadedBy: text('uploaded_by').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check('equipment_documents_pdf', sql`${t.contentType} = 'application/pdf'`),
    check('equipment_documents_size', sql`${t.sizeBytes} > 0 AND ${t.sizeBytes} <= 52428800`),
    check('equipment_documents_url', sql`${t.sourceUrl} IS NULL OR ${t.sourceUrl} ~ '^https?://'`),
    check('equipment_documents_title', sql`btrim(${t.title}) <> ''`),
  ],
);

export const equipmentDocumentLinks = pgTable(
  'equipment_document_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    equipmentId: uuid('equipment_id')
      .notNull()
      .references(() => equipment.id),
    documentId: uuid('document_id')
      .notNull()
      .references(() => equipmentDocuments.id),
    linkedBy: text('linked_by').notNull(),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
    unlinkedBy: text('unlinked_by'),
    unlinkedAt: timestamp('unlinked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('equipment_document_links_active_uq')
      .on(t.equipmentId, t.documentId)
      .where(sql`${t.unlinkedAt} IS NULL`),
    index('equipment_document_links_document_idx').on(t.documentId),
    check(
      'equipment_document_links_unlink_valid',
      sql`(${t.unlinkedAt} IS NULL) = (${t.unlinkedBy} IS NULL)`,
    ),
  ],
);

export const maintenancePlans = pgTable(
  'maintenance_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    equipmentId: uuid('equipment_id')
      .notNull()
      .references(() => equipment.id),
    title: text('title').notNull(),
    state: maintenancePlanState('state').notNull().default('DRAFT'),
    /** Version that generates work; null only before the first publication. */
    activeVersionId: uuid('active_version_id'),
    firstDueOn: date('first_due_on'),
    stateReason: text('state_reason'),
    version: integer('version').notNull().default(1),
    createdBy: text('created_by').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('maintenance_plans_equipment_idx').on(t.equipmentId),
    check(
      'maintenance_plans_active_version',
      sql`${t.state} = 'DRAFT' OR ${t.activeVersionId} IS NOT NULL`,
    ),
    check(
      'maintenance_plans_reason',
      sql`${t.state} NOT IN ('PAUSED', 'ARCHIVED') OR ${t.stateReason} IS NOT NULL`,
    ),
    check('maintenance_plans_title', sql`btrim(${t.title}) <> ''`),
  ],
);

/** The content of a plan; immutable once published, so completed work keeps its version (R10). */
export const maintenancePlanVersions = pgTable(
  'maintenance_plan_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => maintenancePlans.id),
    revision: integer('revision').notNull(),
    intervalUnit: maintenanceIntervalUnit('interval_unit').notNull(),
    intervalCount: integer('interval_count').notNull(),
    anchorMode: maintenanceAnchorMode('anchor_mode').notNull(),
    sourceKind: maintenancePlanSource('source_kind').notNull(),
    sourceDocumentId: uuid('source_document_id').references(() => equipmentDocuments.id),
    sourceReference: text('source_reference'),
    sourceNote: text('source_note'),
    estimatedMinutes: integer('estimated_minutes').notNull(),
    requiresStop: boolean('requires_stop').notNull(),
    /** Required once published; a draft may not have chosen the mechanic yet. */
    assigneeEmployeeId: uuid('assignee_employee_id').references(() => employees.id),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: text('published_by'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('maintenance_plan_versions_revision_uq').on(t.planId, t.revision),
    check('maintenance_plan_versions_interval', sql`${t.intervalCount} > 0`),
    check('maintenance_plan_versions_minutes', sql`${t.estimatedMinutes} > 0`),
    // A draft may be incomplete; a published version names its source and mechanic (FR-022).
    check(
      'maintenance_plan_versions_source',
      sql`${t.publishedAt} IS NULL OR (${t.sourceKind} = 'DOCUMENT' AND ${t.sourceDocumentId} IS NOT NULL) OR (${t.sourceKind} = 'PLANT_DECISION' AND ${t.sourceNote} IS NOT NULL AND btrim(${t.sourceNote}) <> '')`,
    ),
    check(
      'maintenance_plan_versions_assignee',
      sql`${t.publishedAt} IS NULL OR ${t.assigneeEmployeeId} IS NOT NULL`,
    ),
    check(
      'maintenance_plan_versions_published',
      sql`(${t.publishedAt} IS NULL) = (${t.publishedBy} IS NULL)`,
    ),
  ],
);

export const maintenancePlanOperations = pgTable(
  'maintenance_plan_operations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => maintenancePlanVersions.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    text: text('text').notNull(),
    place: text('place'),
    photoRequired: boolean('photo_required').notNull().default(false),
  },
  (t) => [
    unique('maintenance_plan_operations_ordinal_uq').on(t.versionId, t.ordinal),
    check('maintenance_plan_operations_text', sql`btrim(${t.text}) <> ''`),
  ],
);

export const maintenancePlanMaterials = pgTable(
  'maintenance_plan_materials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => maintenancePlanVersions.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    kind: maintenanceMaterialKind('kind').notNull(),
    name: text('name').notNull(),
    article: text('article'),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    unit: text('unit').notNull(),
    mode: maintenanceMaterialMode('mode').notNull(),
  },
  (t) => [
    unique('maintenance_plan_materials_ordinal_uq').on(t.versionId, t.ordinal),
    check('maintenance_plan_materials_quantity', sql`${t.quantity} > 0`),
    check('maintenance_plan_materials_name', sql`btrim(${t.name}) <> ''`),
  ],
);

export const workOrders = pgTable(
  'work_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: integer('number').generatedAlwaysAsIdentity({ startWith: 1001 }),
    type: workOrderType('type').notNull(),
    priority: workOrderPriority('priority').notNull(),
    equipmentId: uuid('equipment_id')
      .notNull()
      .references(() => equipment.id),
    planId: uuid('plan_id').references(() => maintenancePlans.id),
    planVersionId: uuid('plan_version_id').references(() => maintenancePlanVersions.id),
    /** One work order per plan cycle: the cycle's due date. */
    cycleKey: text('cycle_key'),
    incidentId: uuid('incident_id').references(() => downtimeIncidents.id),
    title: text('title').notNull(),
    description: text('description'),
    status: workOrderStatus('status').notNull().default('ASSIGNED'),
    dueOn: date('due_on'),
    plannedOn: date('planned_on'),
    assigneeEmployeeId: uuid('assignee_employee_id')
      .notNull()
      .references(() => employees.id),
    leadEmployeeId: uuid('lead_employee_id').references(() => employees.id),
    reportedAt: timestamp('reported_at', { withTimezone: true }),
    reportedBy: text('reported_by'),
    ackDueAt: timestamp('ack_due_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    escalatedAt: timestamp('escalated_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    performedAt: timestamp('performed_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    performedByEmployeeId: uuid('performed_by_employee_id').references(() => employees.id),
    enteredBy: text('entered_by'),
    readiness: materialsReadiness('readiness').notNull().default('UNKNOWN'),
    readinessNote: text('readiness_note'),
    summary: text('summary'),
    cause: text('cause'),
    partsUsed: text('parts_used'),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('work_orders_number_uq').on(t.number),
    uniqueIndex('work_orders_plan_cycle_uq')
      .on(t.planId, t.cycleKey)
      .where(sql`${t.planId} IS NOT NULL`),
    uniqueIndex('work_orders_open_emergency_uq')
      .on(t.equipmentId)
      .where(sql`${t.type} = 'EMERGENCY_REPAIR' AND ${t.status} NOT IN ('COMPLETED', 'CANCELLED')`),
    index('work_orders_equipment_idx').on(t.equipmentId, t.status),
    index('work_orders_assignee_idx').on(t.assigneeEmployeeId, t.status),
    index('work_orders_planned_idx').on(t.plannedOn),
    check(
      'work_orders_planned_shape',
      sql`${t.type} <> 'PLANNED_MAINTENANCE' OR (${t.planId} IS NOT NULL AND ${t.planVersionId} IS NOT NULL AND ${t.cycleKey} IS NOT NULL AND ${t.dueOn} IS NOT NULL AND ${t.plannedOn} IS NOT NULL)`,
    ),
    check(
      'work_orders_emergency_shape',
      sql`${t.type} <> 'EMERGENCY_REPAIR' OR (${t.reportedAt} IS NOT NULL AND ${t.ackDueAt} IS NOT NULL)`,
    ),
    check(
      'work_orders_cancel_reason',
      sql`${t.status} <> 'CANCELLED' OR (${t.cancelReason} IS NOT NULL AND ${t.cancelledAt} IS NOT NULL)`,
    ),
    check('work_orders_completed', sql`${t.status} <> 'COMPLETED' OR ${t.completedAt} IS NOT NULL`),
    check('work_orders_version_valid', sql`${t.version} > 0`),
  ],
);

export const workOrderOperationResults = pgTable(
  'work_order_operation_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => workOrders.id),
    operationId: uuid('operation_id')
      .notNull()
      .references(() => maintenancePlanOperations.id),
    result: workOperationResult('result').notNull(),
    reason: text('reason'),
    mediaObjectId: uuid('media_object_id').references(() => mediaObjects.id),
    answeredBy: uuid('answered_by')
      .notNull()
      .references(() => employees.id),
    answeredAt: timestamp('answered_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    unique('work_order_operation_results_uq').on(t.workOrderId, t.operationId),
    check(
      'work_order_operation_results_reason',
      sql`${t.result} = 'DONE' OR (${t.reason} IS NOT NULL AND btrim(${t.reason}) <> '')`,
    ),
  ],
);

export const workOrderWaits = pgTable(
  'work_order_waits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => workOrders.id),
    reason: workWaitReason('reason').notNull(),
    note: text('note'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('work_order_waits_open_uq')
      .on(t.workOrderId)
      .where(sql`${t.endedAt} IS NULL`),
    check('work_order_waits_order', sql`${t.endedAt} IS NULL OR ${t.endedAt} >= ${t.startedAt}`),
  ],
);

export const workOrderReviews = pgTable(
  'work_order_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => workOrders.id),
    iteration: integer('iteration').notNull(),
    decision: workReviewDecision('decision').notNull(),
    comment: text('comment'),
    reviewer: text('reviewer').notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    unique('work_order_reviews_iteration_uq').on(t.workOrderId, t.iteration),
    check(
      'work_order_reviews_return_comment',
      sql`${t.decision} = 'ACCEPTED' OR (${t.comment} IS NOT NULL AND btrim(${t.comment}) <> '')`,
    ),
  ],
);

/** A machine's continuous unavailability; at most one open per machine (TZ-M R02). */
export const equipmentStopEpisodes = pgTable(
  'equipment_stop_episodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    equipmentId: uuid('equipment_id')
      .notNull()
      .references(() => equipment.id),
    incidentId: uuid('incident_id').references(() => downtimeIncidents.id),
    workOrderId: uuid('work_order_id').references(() => workOrders.id),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    startQuality: stopStartQuality('start_quality').notNull(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    releaseMode: equipmentReleaseMode('release_mode'),
    releaseCondition: text('release_condition'),
    releasedBy: text('released_by'),
  },
  (t) => [
    uniqueIndex('equipment_stop_episodes_open_uq')
      .on(t.equipmentId)
      .where(sql`${t.releasedAt} IS NULL`),
    check(
      'equipment_stop_episodes_release',
      sql`(${t.releasedAt} IS NULL AND ${t.releaseMode} IS NULL AND ${t.releasedBy} IS NULL) OR (${t.releasedAt} >= ${t.startedAt} AND ${t.releaseMode} IS NOT NULL AND ${t.releasedBy} IS NOT NULL)`,
    ),
    check(
      'equipment_stop_episodes_condition',
      sql`${t.releaseMode} IS DISTINCT FROM 'RESTRICTED' OR ${t.releaseCondition} IS NOT NULL`,
    ),
  ],
);
