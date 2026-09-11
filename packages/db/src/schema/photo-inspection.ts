import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { checklistDefinitions, handoverRecords, mediaObjects } from './handover.js';

export const photoInspections = pgTable(
  'photo_inspections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    handoverId: uuid('handover_id')
      .notNull()
      .references(() => handoverRecords.id),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => mediaObjects.id),
    itemKey: text('item_key').notNull(),
    context: jsonb('context').$type<unknown>().notNull(),
    version: integer('version').notNull().default(0),
    review: jsonb('review').$type<unknown>().notNull(),
    updatedBy: text('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('photo_inspections_identity_uq').on(t.handoverId, t.mediaId, t.itemKey),
    check('photo_inspections_version_valid', sql`${t.version} >= 0`),
  ],
);

export const photoInspectionRevisions = pgTable(
  'photo_inspection_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inspectionId: uuid('inspection_id')
      .notNull()
      .references(() => photoInspections.id),
    version: integer('version').notNull(),
    review: jsonb('review').$type<unknown>().notNull(),
    actorId: text('actor_id').notNull(),
    /** Editor-open-to-save time reported by the client; review-time evidence for the pilot. */
    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('photo_inspection_revisions_version_uq').on(t.inspectionId, t.version),
    check('photo_inspection_revisions_version_valid', sql`${t.version} > 0`),
    check(
      'photo_inspection_revisions_duration_valid',
      sql`${t.durationMs} IS NULL OR ${t.durationMs} >= 0`,
    ),
  ],
);

export const photoInspectionRuns = pgTable(
  'photo_inspection_runs',
  {
    id: uuid('id').primaryKey(),
    inspectionId: uuid('inspection_id')
      .notNull()
      .references(() => photoInspections.id),
    reviewVersion: integer('review_version').notNull(),
    context: jsonb('context').$type<unknown>().notNull(),
    /** Prompt v3: the JSON rule snapshot (InspectionRules); earlier versions stored free text. */
    guidance: text('guidance').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    requestedBy: text('requested_by').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    status: text('status', { enum: ['PENDING', 'SUCCEEDED', 'FAILED'] })
      .notNull()
      .default('PENDING'),
    prediction: jsonb('prediction').$type<unknown>(),
    usage: jsonb('usage').$type<unknown>(),
    errorCode: text('error_code'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('photo_inspection_runs_pending_uq')
      .on(t.inspectionId)
      .where(sql`${t.status} = 'PENDING'`),
    index('photo_inspection_runs_requested_idx').on(t.requestedAt),
    check(
      'photo_inspection_runs_state_valid',
      sql`(${t.status} = 'PENDING' AND ${t.completedAt} IS NULL AND ${t.prediction} IS NULL AND ${t.errorCode} IS NULL) OR (${t.status} = 'SUCCEEDED' AND ${t.completedAt} IS NOT NULL AND ${t.prediction} IS NOT NULL AND ${t.errorCode} IS NULL) OR (${t.status} = 'FAILED' AND ${t.completedAt} IS NOT NULL AND ${t.prediction} IS NULL AND ${t.errorCode} IS NOT NULL)`,
    ),
  ],
);

/** Shared catalog of object types masters mark on photos: one stable identity per spelling family. */
export const photoObjects = pgTable(
  'photo_objects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text('updated_by').notNull(),
  },
  (t) => [
    // Mirrors photoObjectKey in @vakhta/contracts: one entry per spelling family.
    uniqueIndex('photo_objects_key_uq')
      .on(sql`regexp_replace(lower(trim(${t.name})), '[аяиіыуюеє]$', '')`)
      .where(sql`${t.active}`),
    check('photo_objects_name_valid', sql`length(trim(${t.name})) BETWEEN 1 AND 100`),
  ],
);

/** The object list of one checklist family, shared by all its versions and zones; each AI run snapshots it. */
export const checklistPhotoRules = pgTable(
  'checklist_photo_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id').notNull(),
    definitionId: uuid('definition_id')
      .notNull()
      .references(() => checklistDefinitions.id, { onDelete: 'cascade' }),
    /** PhotoRule[]: catalog object ids with optional notes. */
    rules: jsonb('rules').$type<unknown>().notNull().default([]),
    version: integer('version').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text('updated_by').notNull(),
  },
  (t) => [
    uniqueIndex('checklist_photo_rules_family_uq').on(t.familyId),
    check('checklist_photo_rules_version_valid', sql`${t.version} > 0`),
    check(
      'checklist_photo_rules_rules_valid',
      sql`jsonb_typeof(${t.rules}) = 'array' and jsonb_array_length(${t.rules}) <= 30`,
    ),
  ],
);

/** One reviewer's verdict on whether an analysis run helped: the usefulness signal per run and zone. */
export const photoInspectionFeedback = pgTable(
  'photo_inspection_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => photoInspectionRuns.id),
    actorId: text('actor_id').notNull(),
    rating: text('rating', { enum: ['HELPFUL', 'PARTIAL', 'NOT_HELPFUL'] }).notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('photo_inspection_feedback_run_actor_uq').on(t.runId, t.actorId),
    check(
      'photo_inspection_feedback_rating_valid',
      sql`${t.rating} IN ('HELPFUL', 'PARTIAL', 'NOT_HELPFUL')`,
    ),
    check(
      'photo_inspection_feedback_comment_valid',
      sql`${t.comment} IS NULL OR length(${t.comment}) <= 500`,
    ),
  ],
);
