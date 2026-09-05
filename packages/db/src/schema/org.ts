import {
  boolean,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/** Майданчик із власним часовим поясом IANA (ТЗ 6.1, 18 п. 1). */
export const sites = pgTable('sites', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull(),
  createdAt: createdAt(),
});

export const orgUnits = pgTable(
  'org_units',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id),
    parentId: uuid('parent_id').references((): AnyPgColumn => orgUnits.id),
    name: text('name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('org_units_site_idx').on(t.siteId)],
);

export const teams = pgTable(
  'teams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgUnitId: uuid('org_unit_id')
      .notNull()
      .references(() => orgUnits.id),
    name: text('name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('teams_org_unit_idx').on(t.orgUnitId)],
);

export const positions = pgTable('positions', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
});

export const zoneType = pgEnum('zone_type', [
  'AREA',
  'POST',
  'PACKAGING',
  'FILLING',
  'CLEANING',
  'OTHER',
]);

/** Контрольна зона: мінімальний об'єкт відповідальності без довідника обладнання (ТЗ 1.4). */
export const responsibilityZones = pgTable(
  'responsibility_zones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id),
    orgUnitId: uuid('org_unit_id')
      .notNull()
      .references(() => orgUnits.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    type: zoneType('type').notNull().default('AREA'),
    /** Спільна зона: відповідальний здавач або командна оцінка (ТЗ 1.4, 7.5). */
    isShared: boolean('is_shared').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index('zones_site_idx').on(t.siteId), index('zones_org_unit_idx').on(t.orgUnitId)],
);

export const reasonKind = pgEnum('reason_kind', [
  'DOWNTIME',
  'CORRECTION',
  'ABSENCE',
  'HANDOVER',
  'ADJUSTMENT',
  'EMERGENCY',
]);
export const reasonSeverity = pgEnum('reason_severity', ['NORMAL', 'CRITICAL', 'SAFETY']);

/** Довідник причин (FR-DWN-01, FR-COR-04). Ключ (kind, code). */
export const reasonCodes = pgTable(
  'reason_codes',
  {
    kind: reasonKind('kind').notNull(),
    code: text('code').notNull(),
    label: text('label').notNull(),
    requiresComment: boolean('requires_comment').notNull().default(false),
    requiresPhoto: boolean('requires_photo').notNull().default(false),
    notifyMaster: boolean('notify_master').notNull().default(false),
    severity: reasonSeverity('severity').notNull().default('NORMAL'),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: text('sort_order'),
  },
  (t) => [primaryKey({ columns: [t.kind, t.code] })],
);
