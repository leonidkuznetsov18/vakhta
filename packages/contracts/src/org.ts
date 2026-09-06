import { z } from 'zod';
import { IsoDateTime, Uuid } from './common.js';

const Name = z.string().trim().min(1).max(200);
const SlugCode = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9][a-z0-9-]*$/);
const UpperCode = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Z][A-Z0-9_]*$/);

export const CreateSiteCommand = z.object({
  code: SlugCode,
  name: Name,
  /** IANA, наприклад Europe/Kyiv (ТЗ 18 п. 1). */
  timezone: z.string().min(1),
});
export type CreateSiteCommand = z.infer<typeof CreateSiteCommand>;

export const CreateOrgUnitCommand = z.object({
  siteId: Uuid,
  parentId: Uuid.nullable().optional(),
  name: Name,
});
export type CreateOrgUnitCommand = z.infer<typeof CreateOrgUnitCommand>;

export const CreateTeamCommand = z.object({ orgUnitId: Uuid, name: Name });
export type CreateTeamCommand = z.infer<typeof CreateTeamCommand>;

export const CreatePositionCommand = z.object({ code: UpperCode, name: Name });
export type CreatePositionCommand = z.infer<typeof CreatePositionCommand>;

export const ZoneTypeSchema = z.enum(['AREA', 'POST', 'PACKAGING', 'FILLING', 'CLEANING', 'OTHER']);

export const CreateZoneCommand = z.object({
  siteId: Uuid,
  orgUnitId: Uuid,
  code: UpperCode,
  name: Name,
  type: ZoneTypeSchema.default('AREA'),
  /** Спільна зона: відповідальний здавач або командна оцінка (ТЗ 1.4, 7.5). */
  isShared: z.boolean().default(false),
});
export type CreateZoneCommand = z.infer<typeof CreateZoneCommand>;

export const CheckpointSchema = z.enum(['ENTRY', 'EXIT', 'BOTH']);

export const RegisterTerminalCommand = z.object({
  siteId: Uuid,
  name: Name,
  checkpoint: CheckpointSchema.default('BOTH'),
});
export type RegisterTerminalCommand = z.infer<typeof RegisterTerminalCommand>;

/** Registration no longer returns a secret: the kiosk pairs with a short one-time code. */
export const TerminalRegistered = z.object({
  id: Uuid,
  siteId: Uuid,
  name: Name,
  checkpoint: CheckpointSchema,
});
export type TerminalRegistered = z.infer<typeof TerminalRegistered>;

/** Pairing code shown once to the administrator; valid for a few minutes, single use. */
export const TerminalPairingIssued = z.object({
  terminalId: Uuid,
  code: z.string().min(8),
  expiresAt: IsoDateTime,
});
export type TerminalPairingIssued = z.infer<typeof TerminalPairingIssued>;

export const UpdateTerminalCommand = z.object({
  siteId: Uuid.optional(),
  name: Name.optional(),
  checkpoint: CheckpointSchema.optional(),
});
export type UpdateTerminalCommand = z.infer<typeof UpdateTerminalCommand>;

/** Deleting needs a reason for the audit trail; terminals with check-in history are refused. */
export const DeleteWithReasonCommand = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type DeleteWithReasonCommand = z.infer<typeof DeleteWithReasonCommand>;

export const SetTerminalStatusCommand = z.object({
  status: z.enum(['ACTIVE', 'DISABLED']),
  reason: z.string().trim().min(3).max(500),
});
export type SetTerminalStatusCommand = z.infer<typeof SetTerminalStatusCommand>;

export const SiteView = z.object({
  id: Uuid,
  code: z.string(),
  name: z.string(),
  timezone: z.string(),
});
export const OrgUnitView = z.object({
  id: Uuid,
  siteId: Uuid,
  parentId: Uuid.nullable(),
  name: z.string(),
});
export const TeamView = z.object({ id: Uuid, orgUnitId: Uuid, name: z.string() });
export const PositionView = z.object({ id: Uuid, code: z.string(), name: z.string() });
export const ZoneView = z.object({
  id: Uuid,
  siteId: Uuid,
  orgUnitId: Uuid,
  code: z.string(),
  name: z.string(),
  type: ZoneTypeSchema,
  isShared: z.boolean(),
  isActive: z.boolean(),
});
export const TerminalView = z.object({
  id: Uuid,
  siteId: Uuid,
  name: z.string(),
  checkpoint: CheckpointSchema,
  status: z.enum(['ACTIVE', 'DISABLED']),
  /** true once a kiosk has exchanged a pairing code for its device token. */
  paired: z.boolean(),
  lastSeenAt: IsoDateTime.nullable(),
});
export const ReasonCodeView = z.object({
  kind: z.enum(['DOWNTIME', 'CORRECTION', 'ABSENCE', 'HANDOVER', 'ADJUSTMENT', 'EMERGENCY']),
  code: z.string(),
  label: z.string(),
  requiresComment: z.boolean(),
  requiresPhoto: z.boolean(),
  notifyMaster: z.boolean(),
  severity: z.enum(['NORMAL', 'CRITICAL', 'SAFETY']),
  isActive: z.boolean(),
});

/** Усі довідники одним запитом для панелі «Администрирование» (ТЗ 9.1). */
export const OrgSnapshot = z.object({
  sites: z.array(SiteView),
  orgUnits: z.array(OrgUnitView),
  teams: z.array(TeamView),
  positions: z.array(PositionView),
  zones: z.array(ZoneView),
  terminals: z.array(TerminalView),
  reasonCodes: z.array(ReasonCodeView),
});
export type OrgSnapshot = z.infer<typeof OrgSnapshot>;
export type SiteView = z.infer<typeof SiteView>;
export type OrgUnitView = z.infer<typeof OrgUnitView>;
export type TeamView = z.infer<typeof TeamView>;
export type PositionView = z.infer<typeof PositionView>;
export type ZoneView = z.infer<typeof ZoneView>;
export type TerminalView = z.infer<typeof TerminalView>;
export type ReasonCodeView = z.infer<typeof ReasonCodeView>;
