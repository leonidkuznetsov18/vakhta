import { z } from 'zod';
import { BusinessDate, IsoDateTime, Uuid } from './common.js';
import { Month } from './scheduling.js';

/**
 * Open slots (SC-15, SC-16, D-06): an internal unassigned slot of a unit month, a deliberate offer
 * to an explicit audience, employee responses that never assign, and one authorized selection.
 */

export const OpenSlotStatus = z.enum(['OPEN', 'OFFERED', 'FILLED', 'CANCELLED']);
export type OpenSlotStatus = z.infer<typeof OpenSlotStatus>;
export const SlotOfferStatus = z.enum(['OPEN', 'CLOSED', 'CANCELLED']);
export type SlotOfferStatus = z.infer<typeof SlotOfferStatus>;
export const SlotInterestResponse = z.enum(['INTERESTED', 'DECLINED']);
export type SlotInterestResponse = z.infer<typeof SlotInterestResponse>;
export const SlotAudience = z.enum(['UNIT', 'ALL']);
export type SlotAudience = z.infer<typeof SlotAudience>;

export const SlotInterestView = z.object({
  employeeId: Uuid,
  response: SlotInterestResponse,
  respondedAt: IsoDateTime,
});
export type SlotInterestView = z.infer<typeof SlotInterestView>;

export const SlotOfferView = z.object({
  id: Uuid,
  status: SlotOfferStatus,
  audience: SlotAudience,
  notifiedCount: z.number().int().nonnegative(),
  offeredAt: IsoDateTime,
  closedAt: IsoDateTime.nullable(),
  interests: z.array(SlotInterestView),
});
export type SlotOfferView = z.infer<typeof SlotOfferView>;

export const OpenSlotView = z.object({
  id: Uuid,
  siteId: Uuid,
  orgUnitId: Uuid,
  periodMonth: Month,
  businessDate: BusinessDate,
  templateId: Uuid,
  zoneId: Uuid,
  status: OpenSlotStatus,
  filledEmployeeId: Uuid.nullable(),
  filledVersionId: Uuid.nullable(),
  /** The latest offer with its responses; earlier offers stay in history and audit. */
  offer: SlotOfferView.nullable(),
  offerCount: z.number().int().nonnegative(),
  createdAt: IsoDateTime,
});
export type OpenSlotView = z.infer<typeof OpenSlotView>;

export const OpenSlotsQuery = z.object({ siteId: Uuid, orgUnitId: Uuid, periodMonth: Month });
export type OpenSlotsQuery = z.infer<typeof OpenSlotsQuery>;

export const CreateOpenSlotCommand = z.object({
  siteId: Uuid,
  orgUnitId: Uuid,
  periodMonth: Month,
  businessDate: BusinessDate,
  templateId: Uuid,
  zoneId: Uuid,
});
export type CreateOpenSlotCommand = z.infer<typeof CreateOpenSlotCommand>;

export const OfferSlotCommand = z.object({ audience: SlotAudience.default('UNIT') });
export type OfferSlotCommand = z.infer<typeof OfferSlotCommand>;

/** Selection writes the assignment into the named draft under its revision (SC-16). */
export const SelectSlotCommand = z.object({
  employeeId: Uuid,
  versionId: Uuid,
  expectedRevision: z.number().int().positive(),
});
export type SelectSlotCommand = z.infer<typeof SelectSlotCommand>;
