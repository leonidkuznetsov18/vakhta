import { z } from 'zod';
import { BusinessDate, IsoDateTime, Uuid } from './common.js';

/** Спільні параметри звітів (ТЗ 9.3): період і область даних. */
export const ReportQuery = z.object({
  siteId: Uuid.optional(),
  orgUnitId: Uuid.optional(),
  from: BusinessDate,
  to: BusinessDate,
});
export type ReportQuery = z.infer<typeof ReportQuery>;

export const REPORT_KINDS = [
  'hours',
  'time-structure',
  'downtime',
  'handover',
  'bot-usage',
  'bonus',
] as const;
export const ReportKindSchema = z.enum(REPORT_KINDS);
export type ReportKind = z.infer<typeof ReportKindSchema>;

/** Універсальна таблиця: колонки з підписами і рядки; так само віддається в CSV/XLSX. */
export const ReportColumn = z.object({
  key: z.string(),
  label: z.string(),
  kind: z.enum(['text', 'number', 'minutes', 'percent', 'date']),
});
export const ReportTableView = z.object({
  kind: ReportKindSchema,
  title: z.string(),
  from: BusinessDate,
  to: BusinessDate,
  columns: z.array(ReportColumn),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))),
  totals: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).nullable(),
  /** Версія даних і час формування; потрапляють у вивантаження (FR-WEB-05). */
  generatedAt: IsoDateTime,
  dataVersion: z.string(),
});
export type ReportTableView = z.infer<typeof ReportTableView>;

export const AuditQuery = z.object({
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
  actorId: z.string().optional(),
  action: z.string().optional(),
  objectType: z.string().optional(),
  objectId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type AuditQuery = z.infer<typeof AuditQuery>;

export const AuditEntryView = z.object({
  id: Uuid,
  at: IsoDateTime,
  actorType: z.string(),
  actorId: z.string().nullable(),
  /** Email of the panel user or the full name of the employee behind actorId, when known. */
  actorName: z.string().nullable(),
  action: z.string(),
  objectType: z.string(),
  objectId: z.string().nullable(),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
  reason: z.string().nullable(),
});
export type AuditEntryView = z.infer<typeof AuditEntryView>;

export const EventsQuery = z.object({
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
  employeeId: Uuid.optional(),
  shiftSessionId: Uuid.optional(),
  type: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type EventsQuery = z.infer<typeof EventsQuery>;

export const DomainEventView = z.object({
  id: Uuid,
  type: z.string(),
  occurredAt: IsoDateTime,
  receivedAt: IsoDateTime,
  source: z.string(),
  actorId: z.string().nullable(),
  actingRole: z.string().nullable(),
  employeeId: Uuid.nullable(),
  employeeName: z.string().nullable(),
  shiftSessionId: Uuid.nullable(),
  reasonCode: z.string().nullable(),
  comment: z.string().nullable(),
  correctsEventId: Uuid.nullable(),
  payload: z.record(z.string(), z.unknown()),
});
export type DomainEventView = z.infer<typeof DomainEventView>;
