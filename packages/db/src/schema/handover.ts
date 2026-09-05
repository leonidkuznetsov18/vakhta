import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  ChecklistItemDefinition,
  HandoverAngle,
  HandoverResolution,
  HandoverStatus,
  MediaQualityStatus,
  RemarkNeed,
} from '@vakhta/domain';
import { employees } from './identity.js';
import { positions, responsibilityZones, zoneType } from './org.js';
import { shiftSessions } from './shift.js';

const HANDOVER_STATUS_VALUES = [
  'DRAFT',
  'SUBMITTED',
  'ACCEPTED',
  'DISPUTED',
  'RESOLVED_ACCEPTED',
  'RESOLVED_ISSUE_CONFIRMED',
  'RESOLVED_NO_FAULT',
  'SUPERSEDED',
] as const satisfies readonly HandoverStatus[];
const RESOLUTION_VALUES = [
  'RESOLVED_ACCEPTED',
  'RESOLVED_ISSUE_CONFIRMED',
  'RESOLVED_NO_FAULT',
] as const satisfies readonly HandoverResolution[];
const ANGLE_VALUES = ['OVERVIEW', 'SURFACES', 'FLOOR'] as const satisfies readonly HandoverAngle[];
const QUALITY_VALUES = [
  'PENDING',
  'OK',
  'LOW_RES',
  'DARK',
  'CORRUPT',
  'DUPLICATE_SUSPECT',
  'MANUAL_REVIEW',
] as const satisfies readonly MediaQualityStatus[];

export const handoverStatus = pgEnum('handover_status', HANDOVER_STATUS_VALUES);
export const handoverResolution = pgEnum('handover_resolution', RESOLUTION_VALUES);
export const handoverAngle = pgEnum('handover_angle', ANGLE_VALUES);
export const mediaQuality = pgEnum('media_quality', QUALITY_VALUES);
export const reviewDecision = pgEnum('review_decision', ['ACCEPTED', 'ISSUE']);

/** Версійовані шаблони чек-листа за типом зони і посадою (FR-CLN-03, FR-HND-01). */
export const checklistDefinitions = pgTable(
  'checklist_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    version: integer('version').notNull(),
    zoneType: zoneType('zone_type'),
    positionId: uuid('position_id').references(() => positions.id),
    items: jsonb('items').$type<ChecklistItemDefinition[]>().notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('checklist_definitions_active_idx').on(t.isActive, t.zoneType, t.positionId)],
);

/**
 * Фото у приватному сховищі (FR-PHO-02, ADR-0006): Telegram-ідентифікатори, метрики після
 * перенесення, статус технічної перевірки. Видача лише через підписані посилання.
 */
export const mediaObjects = pgTable(
  'media_objects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    telegramFileId: text('telegram_file_id').notNull(),
    telegramFileUniqueId: text('telegram_file_unique_id').notNull(),
    uploadedBy: uuid('uploaded_by').references(() => employees.id),
    purpose: text('purpose').notNull(),
    storageKey: text('storage_key'),
    contentType: text('content_type'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    width: integer('width'),
    height: integer('height'),
    sha256: text('sha256'),
    phash: text('phash'),
    brightness: smallint('brightness'),
    quality: mediaQuality('quality').notNull().default('PENDING'),
    qualityNotes: text('quality_notes'),
    duplicateOfId: uuid('duplicate_of_id'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    retentionUntil: timestamp('retention_until', { withTimezone: true }),
  },
  (t) => [
    index('media_objects_sha_idx').on(t.sha256),
    index('media_objects_received_idx').on(t.receivedAt),
    index('media_objects_unique_file_idx').on(t.telegramFileUniqueId),
  ],
);

/** Звіт передачі зони (FR-HND-01, ТЗ 5.9). Один незавершений на сесію. */
export const handoverRecords = pgTable(
  'handover_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shiftSessionId: uuid('shift_session_id')
      .notNull()
      .references(() => shiftSessions.id),
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => responsibilityZones.id),
    submittedBy: uuid('submitted_by')
      .notNull()
      .references(() => employees.id),
    checklistDefinitionId: uuid('checklist_definition_id')
      .notNull()
      .references(() => checklistDefinitions.id),
    status: handoverStatus('status').notNull().default('DRAFT'),
    version: integer('version').notNull().default(1),
    cannotCompleteReason: text('cannot_complete_reason'),
    cannotCompleteComment: text('cannot_complete_comment'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    acceptDeadlineAt: timestamp('accept_deadline_at', { withTimezone: true }),
    escalatedToMasterAt: timestamp('escalated_to_master_at', { withTimezone: true }),
    supersededById: uuid('superseded_by_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('handover_records_open_uq')
      .on(t.shiftSessionId)
      .where(sql`${t.status} IN ('DRAFT', 'SUBMITTED', 'DISPUTED')`),
    index('handover_records_zone_status_idx').on(t.zoneId, t.status),
    index('handover_records_status_deadline_idx').on(t.status, t.acceptDeadlineAt),
  ],
);

/** Відповіді чек-листа; зауваження вимагає категорії, тексту, безпеки й потреб (FR-CLN-04). */
export const checklistAnswers = pgTable(
  'checklist_answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    handoverId: uuid('handover_id')
      .notNull()
      .references(() => handoverRecords.id, { onDelete: 'cascade' }),
    itemKey: text('item_key').notNull(),
    ok: boolean('ok').notNull(),
    remarkCategory: text('remark_category'),
    remarkText: text('remark_text'),
    safeToWork: boolean('safe_to_work'),
    needs: jsonb('needs').$type<RemarkNeed[]>().notNull().default([]),
    note: text('note'),
    answeredAt: timestamp('answered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('checklist_answers_item_uq').on(t.handoverId, t.itemKey)],
);

/** Три ракурси; повторне фото ракурсу замінює попереднє без дублів (FR-PHO-05). */
export const handoverMedia = pgTable(
  'handover_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    handoverId: uuid('handover_id')
      .notNull()
      .references(() => handoverRecords.id, { onDelete: 'cascade' }),
    angle: handoverAngle('angle').notNull(),
    mediaObjectId: uuid('media_object_id')
      .notNull()
      .references(() => mediaObjects.id),
    attachedAt: timestamp('attached_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('handover_media_angle_uq').on(t.handoverId, t.angle)],
);

/** Приймання наступною зміною; сервіс забороняє приймати власну передачу (T-32). */
export const handoverReviews = pgTable(
  'handover_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    handoverId: uuid('handover_id')
      .notNull()
      .references(() => handoverRecords.id, { onDelete: 'cascade' }),
    reviewerEmployeeId: uuid('reviewer_employee_id')
      .notNull()
      .references(() => employees.id),
    reviewerShiftSessionId: uuid('reviewer_shift_session_id').references(() => shiftSessions.id),
    decision: reviewDecision('decision').notNull(),
    category: text('category'),
    comment: text('comment'),
    mediaObjectId: uuid('media_object_id').references(() => mediaObjects.id),
    incidentId: uuid('incident_id'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('handover_reviews_handover_idx').on(t.handoverId)],
);

/** Формалізоване рішення майстра (FR-HND-05/06). */
export const handoverResolutions = pgTable(
  'handover_resolutions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    handoverId: uuid('handover_id')
      .notNull()
      .references(() => handoverRecords.id, { onDelete: 'cascade' }),
    resolvedBy: text('resolved_by'),
    decision: handoverResolution('decision').notNull(),
    reasonCode: text('reason_code'),
    comment: text('comment').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('handover_resolutions_handover_idx').on(t.handoverId)],
);
