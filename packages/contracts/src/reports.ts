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

/**
 * One report (2026-09-09): where the shift's time went and why. Six equal tabs gave no guidance on
 * which to open; this one answers the question the product exists for — where the weak spot is —
 * and the rest were removed rather than left to rot beside it.
 */
export const REPORT_KINDS = ['losses'] as const;
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

/** Which slice of the loss report to read: the whole period, one category, or one reason in it. */
export const LossesQuery = ReportQuery.extend({
  /** An interval state — 'HANDOVER', 'DOWNTIME', 'PREPARATION'… Absent means every category. */
  category: z.string().min(1).max(40).optional(),
  /** A reason code inside the category. */
  reason: z.string().min(1).max(64).optional(),
  /** Ask for the intervals that carry no reason at all — the ones a code cannot name. */
  noReason: z
    .union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')])
    .optional(),
  /** Duration cutoff; later historical corrections can still change a subsequent execution. */
  asOf: IsoDateTime.optional(),
});
export type LossesQuery = z.infer<typeof LossesQuery>;

/** A bar of the Pareto: how much time this category or reason took, and how much it is of the whole. */
export const LossBar = z.object({
  key: z.string(),
  label: z.string(),
  minutes: z.number().int().nonnegative(),
  share: z.number(),
  /** Running share once the bars above it are counted; the 80% line is read off this. */
  cumulative: z.number(),
  intervals: z.number().int().nonnegative(),
  employees: z.number().int().nonnegative(),
});
export type LossBar = z.infer<typeof LossBar>;

/** One interval behind a bar: who stood in it, when, for how long and what they said about it. */
export const LossInterval = z.object({
  id: Uuid,
  businessDate: BusinessDate,
  employeeId: Uuid,
  employeeName: z.string(),
  orgUnitName: z.string().nullable(),
  zoneName: z.string().nullable(),
  category: z.string(),
  categoryLabel: z.string(),
  reasonLabel: z.string().nullable(),
  comment: z.string().nullable(),
  startedAt: IsoDateTime,
  endedAt: IsoDateTime.nullable(),
  minutes: z.number().int().nonnegative(),
});
export type LossInterval = z.infer<typeof LossInterval>;

export const LossesView = z.object({
  from: BusinessDate,
  to: BusinessDate,
  /** Minutes the shifts of this period held in total, working time included. */
  totalMinutes: z.number().int().nonnegative(),
  /** Minutes outside main work: what the report ranks. */
  lostMinutes: z.number().int().nonnegative(),
  /** Share of the lost minutes that carry a reason — how far the ranking can be trusted. */
  explainedShare: z.number(),
  /** Level one, or level two when the query names a category. */
  bars: z.array(LossBar),
  /** The category the bars belong to, absent at level one. */
  category: z.string().nullable(),
  categoryLabel: z.string().nullable(),
  /** Level three: the intervals themselves, present once a category is chosen. */
  intervals: z.array(LossInterval),
  intervalsTotal: z.number().int().nonnegative(),
  intervalsLimit: z.number().int().positive(),
  intervalsTruncated: z.boolean(),
  exportLimit: z.number().int().positive(),
  asOf: IsoDateTime,
  generatedAt: IsoDateTime,
});
export type LossesView = z.infer<typeof LossesView>;

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
