import { z } from 'zod';
import { BusinessDate, IsoDateTime, Uuid } from './common.js';
import { ShiftPeriodSchema } from './scheduling.js';

/** Overview command center (spec 004): selection inside the reader's granted scope. */
export const OverviewQuery = z.object({
  siteId: Uuid.optional(),
  orgUnitId: Uuid.optional(),
});
export type OverviewQuery = z.infer<typeof OverviewQuery>;

export const ShiftWindowView = z.object({
  templateId: Uuid,
  code: z.string(),
  name: z.string(),
  period: ShiftPeriodSchema,
  businessDate: BusinessDate,
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  /** End of the closing grace for the checklist and exit QR. */
  closesAt: IsoDateTime,
  /**
   * The shift really happens in the selected scope: someone is planned in a published schedule or a
   * shift was recorded in its window. A day off with nobody planned and nobody present is false.
   */
  staffed: z.boolean(),
});
export type ShiftWindowView = z.infer<typeof ShiftWindowView>;

export const OverviewSiteContext = z.object({
  siteId: Uuid,
  siteName: z.string(),
  timezone: z.string(),
  current: ShiftWindowView.nullable(),
  closingPrevious: ShiftWindowView.nullable(),
  next: ShiftWindowView.nullable(),
});
export type OverviewSiteContext = z.infer<typeof OverviewSiteContext>;

export const OverviewScopeOptions = z.object({
  sites: z.array(z.object({ id: Uuid, name: z.string() })),
  orgUnits: z.array(z.object({ id: Uuid, siteId: Uuid, name: z.string() })),
});
export type OverviewScopeOptions = z.infer<typeof OverviewScopeOptions>;

export const OverviewPerson = z.object({
  employeeId: Uuid,
  fullName: z.string(),
  /** Planned start for a planned person; null for one known only by an open shift. */
  planStartAt: IsoDateTime.nullable(),
  zoneName: z.string().nullable(),
});
export type OverviewPerson = z.infer<typeof OverviewPerson>;

export const OverviewStaffing = z.object({
  planned: z.number().int().nonnegative(),
  present: z.number().int().nonnegative(),
  notArrived: z.number().int().nonnegative(),
  expected: z.number().int().nonnegative(),
  unscheduled: z.number().int().nonnegative(),
  presentPeople: z.array(OverviewPerson),
  expectedPeople: z.array(OverviewPerson),
  notArrivedPeople: z.array(OverviewPerson),
  unscheduledPeople: z.array(OverviewPerson),
  oldestNotArrivedSince: IsoDateTime.nullable(),
  /** Business date of the first counted window, for the destination day filter. */
  businessDate: BusinessDate.nullable(),
});
export type OverviewStaffing = z.infer<typeof OverviewStaffing>;

export const OverviewDowntime = z.object({
  zoneMinutes: z.number().int().nonnegative(),
  personMinutes: z.number().int().nonnegative(),
  incidents: z.number().int().nonnegative(),
  topReason: z
    .object({ code: z.string(), label: z.string(), minutes: z.number().int().nonnegative() })
    .nullable(),
  byZone: z.array(
    z.object({
      zoneId: Uuid.nullable(),
      zoneName: z.string().nullable(),
      minutes: z.number().int().nonnegative(),
    }),
  ),
});
export type OverviewDowntime = z.infer<typeof OverviewDowntime>;

export const OverviewTimeToAction = z.object({
  reported: z.number().int().nonnegative(),
  acknowledged: z.number().int().nonnegative(),
  medianMinutes: z.number().int().nonnegative().nullable(),
  slaMet: z.number().int().nonnegative(),
  slaMissed: z.number().int().nonnegative(),
  awaiting: z.number().int().nonnegative(),
  awaitingBreached: z.number().int().nonnegative(),
});
export type OverviewTimeToAction = z.infer<typeof OverviewTimeToAction>;

export const OverviewHandover = z.object({
  clean: z.number().int().nonnegative(),
  decided: z.number().int().nonnegative(),
  disputed: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
});
export type OverviewHandover = z.infer<typeof OverviewHandover>;

export const TerminalConnectivitySchema = z.enum(['ONLINE', 'OFFLINE', 'UNPAIRED', 'DISABLED']);

export const OverviewTerminal = z.object({
  id: Uuid,
  siteId: Uuid,
  name: z.string(),
  connectivity: TerminalConnectivitySchema,
  lastSeenAt: IsoDateTime.nullable(),
  /** Offline while people depend on it: a boundary within an hour or staff not recorded. */
  critical: z.boolean(),
});
export type OverviewTerminal = z.infer<typeof OverviewTerminal>;

export const ZoneStatusSchema = z.enum([
  'DOWNTIME',
  'UNSTAFFED',
  'UNDERSTAFFED',
  'CLOSING',
  'WORKING',
  'IDLE',
]);
export type ZoneStatusCode = z.infer<typeof ZoneStatusSchema>;

export const OverviewZone = z.object({
  zoneId: Uuid,
  zoneName: z.string(),
  orgUnitId: Uuid,
  orgUnitName: z.string(),
  siteId: Uuid,
  status: ZoneStatusSchema,
  planned: z.number().int().nonnegative(),
  present: z.number().int().nonnegative(),
  since: IsoDateTime.nullable(),
  /** Who has an open shift in the zone now. */
  presentPeople: z.array(OverviewPerson),
  /** Who is planned in the zone now and has no open shift there. */
  missingPeople: z.array(OverviewPerson),
});
export type OverviewZone = z.infer<typeof OverviewZone>;

export const OverviewSetup = z.object({
  unlinkedEmployees: z.number().int().nonnegative(),
  unpairedTerminals: z.number().int().nonnegative(),
});
export type OverviewSetup = z.infer<typeof OverviewSetup>;

/**
 * One consistent snapshot of the current shift in the selected scope. A section is null when the
 * reader's roles do not include its source: hidden, never shown as zero.
 */
export const OverviewSnapshot = z.object({
  generatedAt: IsoDateTime,
  lateGraceMinutes: z.number().int().nonnegative(),
  downtimeEscalationMinutes: z.number().int().nonnegative(),
  options: OverviewScopeOptions,
  selection: z.object({ siteId: Uuid.nullable(), orgUnitId: Uuid.nullable() }),
  contexts: z.array(OverviewSiteContext),
  staffing: OverviewStaffing.nullable(),
  downtime: OverviewDowntime.nullable(),
  timeToAction: OverviewTimeToAction.nullable(),
  handover: OverviewHandover.nullable(),
  terminals: z.array(OverviewTerminal).nullable(),
  zones: z.array(OverviewZone).nullable(),
  setup: OverviewSetup.nullable(),
});
export type OverviewSnapshot = z.infer<typeof OverviewSnapshot>;

export const OverviewEventKindSchema = z.enum([
  'INCIDENT_REPORTED',
  'INCIDENT_ACKNOWLEDGED',
  'INCIDENT_ESCALATED',
  'INCIDENT_RESOLVED',
  'INCIDENT_SLA_BREACHED',
  'DOWNTIME_STARTED',
  'DOWNTIME_ENDED',
  'HANDOVER_SUBMITTED',
  'HANDOVER_DISPUTED',
  'HANDOVER_DECIDED',
  'SHIFT_CLOSED_BY_MASTER',
]);
export type OverviewEventKind = z.infer<typeof OverviewEventKindSchema>;

export const OverviewEventsQuery = OverviewQuery.extend({
  limit: z.coerce.number().int().min(1).max(50).default(30),
});
export type OverviewEventsQuery = z.infer<typeof OverviewEventsQuery>;

/** A curated operational event: codes and names only, never request or medical content. */
export const OverviewEvent = z.object({
  id: Uuid,
  kind: OverviewEventKindSchema,
  at: IsoDateTime,
  zoneName: z.string().nullable(),
  employeeName: z.string().nullable(),
  reasonLabel: z.string().nullable(),
  /** Where the record opens in the panel. */
  target: z.object({
    section: z.enum(['incidents', 'operations', 'handover']),
    id: Uuid.nullable(),
    businessDate: BusinessDate.nullable(),
  }),
});
export type OverviewEvent = z.infer<typeof OverviewEvent>;
