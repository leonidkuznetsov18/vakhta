import { z } from 'zod';
import { INCIDENT_SEVERITIES, INCIDENT_STATUSES } from '@vakhta/domain';
import { Comment, IdempotencyKey, IsoDateTime, ReasonCode, Uuid } from './common.js';

export const IncidentStatusSchema = z.enum(INCIDENT_STATUSES);
export const IncidentSeveritySchema = z.enum(INCIDENT_SEVERITIES);

/** «Сообщить о проблеме» з бота (ТЗ 5.5): причина, коментар, чи зупинена робота. */
export const ReportProblemCommand = z.object({
  reasonCode: ReasonCode,
  comment: Comment.optional(),
  stoppedWork: z.boolean(),
  idempotencyKey: IdempotencyKey,
  /** Telegram file_id фото; у S3 переносить воркер фази 4. */
  photoFileId: z.string().min(1).max(200).optional(),
});
export type ReportProblemCommand = z.infer<typeof ReportProblemCommand>;

export const ReportView = z.object({
  id: Uuid,
  incidentId: Uuid,
  shiftSessionId: Uuid.nullable(),
  employeeId: Uuid,
  fullName: z.string(),
  zoneId: Uuid.nullable(),
  reasonCode: ReasonCode,
  comment: z.string().nullable(),
  stoppedWork: z.boolean(),
  reportedAt: IsoDateTime,
  hasPhoto: z.boolean(),
});
export type ReportView = z.infer<typeof ReportView>;

export const IncidentView = z.object({
  id: Uuid,
  siteId: Uuid.nullable(),
  orgUnitId: Uuid.nullable(),
  zoneId: Uuid.nullable(),
  zoneName: z.string().nullable(),
  reasonCode: ReasonCode,
  reasonLabel: z.string(),
  severity: IncidentSeveritySchema,
  status: IncidentStatusSchema,
  duplicateOfId: Uuid.nullable(),
  assigneeId: z.string().nullable(),
  openedAt: IsoDateTime,
  slaDueAt: IsoDateTime,
  acknowledgedAt: IsoDateTime.nullable(),
  resolvedAt: IsoDateTime.nullable(),
  closedAt: IsoDateTime.nullable(),
  escalatedAt: IsoDateTime.nullable(),
  slaBreached: z.boolean(),
  reportsCount: z.number().int().nonnegative(),
  /** Скільки працівників зараз у DOWNTIME за цим інцидентом. */
  stoppedNow: z.number().int().nonnegative(),
  lastComment: z.string().nullable(),
});
export type IncidentView = z.infer<typeof IncidentView>;

export const IncidentHistoryView = z.object({
  id: Uuid,
  fromStatus: IncidentStatusSchema.nullable(),
  toStatus: IncidentStatusSchema,
  actorType: z.string(),
  actorId: z.string().nullable(),
  at: IsoDateTime,
  comment: z.string().nullable(),
});
export type IncidentHistoryView = z.infer<typeof IncidentHistoryView>;

export const IncidentDetailView = z.object({
  incident: IncidentView,
  reports: z.array(ReportView),
  history: z.array(IncidentHistoryView),
  duplicates: z.array(IncidentView),
  serverTime: IsoDateTime,
});
export type IncidentDetailView = z.infer<typeof IncidentDetailView>;

/** Результат повідомлення для бота: інцидент і чи відкрився особистий простій. */
export const ReportProblemResult = z.object({
  incidentId: Uuid,
  linkedToExisting: z.boolean(),
  severity: IncidentSeveritySchema,
  downtimeStarted: z.boolean(),
  downtimeError: z.string().nullable(),
  serverTime: IsoDateTime,
});
export type ReportProblemResult = z.infer<typeof ReportProblemResult>;

export const IncidentsQuery = z.object({
  siteId: Uuid.optional(),
  zoneId: Uuid.optional(),
  /** open (типово) або all. */
  scope: z.enum(['open', 'all']).optional(),
});
export type IncidentsQuery = z.infer<typeof IncidentsQuery>;

/** Дії майстра (FR-DWN-05). Коментар обовʼязковий для відхилення й рішення. */
export const IncidentTransitionCommand = z.object({
  to: IncidentStatusSchema,
  comment: Comment.optional(),
  /** Для DUPLICATE: до якого інциденту приєднати. */
  duplicateOfId: Uuid.optional(),
});
export type IncidentTransitionCommand = z.infer<typeof IncidentTransitionCommand>;

export const IncidentUpdateCommand = z.object({
  reasonCode: ReasonCode.optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  comment: z.string().trim().min(3).max(2000),
});
export type IncidentUpdateCommand = z.infer<typeof IncidentUpdateCommand>;

export const IncidentStatsQuery = z.object({
  siteId: Uuid.optional(),
  from: IsoDateTime,
  to: IsoDateTime,
});
export type IncidentStatsQuery = z.infer<typeof IncidentStatsQuery>;

const StatsRow = z.object({
  key: z.string(),
  label: z.string(),
  incidents: z.number().int().nonnegative(),
  reports: z.number().int().nonnegative(),
  downtimeMinutes: z.number().int().nonnegative(),
  avgResolutionMinutes: z.number().nonnegative().nullable(),
  slaBreached: z.number().int().nonnegative(),
});
export type IncidentStatsRow = z.infer<typeof StatsRow>;

/** Звіт по причинах і зонах (ТЗ 9.1 «Простои и инциденты»). */
export const IncidentStatsView = z.object({
  from: IsoDateTime,
  to: IsoDateTime,
  byReason: z.array(StatsRow),
  byZone: z.array(StatsRow),
  totals: StatsRow,
});
export type IncidentStatsView = z.infer<typeof IncidentStatsView>;

export const IncidentChangedEvent = z.object({
  incidentId: Uuid,
  status: IncidentStatusSchema,
  severity: IncidentSeveritySchema,
  at: IsoDateTime,
});
export type IncidentChangedEvent = z.infer<typeof IncidentChangedEvent>;
