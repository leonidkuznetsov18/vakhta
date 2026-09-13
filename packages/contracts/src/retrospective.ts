import { z } from 'zod';
import { BusinessDate, IsoDateTime, Uuid } from './common.js';
import { Month } from './scheduling.js';

/**
 * Retrospective report (SC-41): the effective published plan against recorded shift evidence.
 * Planned time, recorded work and unknown departure stay separate; nothing infers fault or OEE.
 */
export const RetrospectiveQuery = z.object({ siteId: Uuid, orgUnitId: Uuid, periodMonth: Month });
export type RetrospectiveQuery = z.infer<typeof RetrospectiveQuery>;

export const DepartureEvidence = z.enum(['RECORDED', 'UNKNOWN', 'NONE']);
export type DepartureEvidence = z.infer<typeof DepartureEvidence>;

export const RetrospectiveRow = z.object({
  assignmentId: Uuid,
  employeeId: Uuid,
  businessDate: BusinessDate,
  zoneId: Uuid.nullable(),
  plannedStartAt: IsoDateTime,
  plannedEndAt: IsoDateTime,
  plannedMinutes: z.number().int().nonnegative(),
  sessionId: Uuid.nullable(),
  recordedStartAt: IsoDateTime.nullable(),
  recordedEndAt: IsoDateTime.nullable(),
  /** From the closed-shift summary; null while no summary exists. */
  workMinutes: z.number().int().nonnegative().nullable(),
  totalMinutes: z.number().int().nonnegative().nullable(),
  departure: DepartureEvidence,
  autoCloseReason: z.string().nullable(),
});
export type RetrospectiveRow = z.infer<typeof RetrospectiveRow>;

export const RetrospectiveTotals = z.object({
  employeeId: Uuid,
  shifts: z.number().int().nonnegative(),
  plannedMinutes: z.number().int().nonnegative(),
  workMinutes: z.number().int().nonnegative(),
  recordedShifts: z.number().int().nonnegative(),
  unknownDepartures: z.number().int().nonnegative(),
  missingActuals: z.number().int().nonnegative(),
});
export type RetrospectiveTotals = z.infer<typeof RetrospectiveTotals>;

export const RetrospectiveView = z.object({
  generatedAt: IsoDateTime,
  timezone: z.string(),
  periodMonth: Month,
  siteId: Uuid,
  orgUnitId: Uuid,
  version: z
    .object({ id: Uuid, versionNo: z.number().int(), publishedAt: IsoDateTime.nullable() })
    .nullable(),
  rows: z.array(RetrospectiveRow),
  totals: z.array(RetrospectiveTotals),
});
export type RetrospectiveView = z.infer<typeof RetrospectiveView>;
