import { z } from 'zod';
import {
  CHECKLIST_ITEM_KINDS,
  CHECKLIST_LIMITS,
  checklistItemKey,
  validateChecklistItems,
} from '@vakhta/domain';
import { Comment, IsoDateTime, Uuid } from './common.js';
import { ZoneTypeSchema } from './org.js';

export const ChecklistItemKindSchema = z.enum(CHECKLIST_ITEM_KINDS);
export type ChecklistItemKind = z.infer<typeof ChecklistItemKindSchema>;

export const ChecklistItemDefinitionView = z.object({
  key: z.string(),
  label: z.string(),
  kind: ChecklistItemKindSchema,
});
export type ChecklistItemDefinitionView = z.infer<typeof ChecklistItemDefinitionView>;

/** Current version of one checklist as the panel lists it (spec 5.6, FR-CLN-03). */
export const ChecklistDefinitionView = z.object({
  id: Uuid,
  familyId: Uuid,
  name: z.string(),
  version: z.number().int().positive(),
  /** null only on rows saved before the position became mandatory; such a checklist is never picked. */
  positionId: Uuid.nullable(),
  positionName: z.string().nullable(),
  /** null: applies to every zone type. */
  zoneType: ZoneTypeSchema.nullable(),
  items: z.array(ChecklistItemDefinitionView),
  isActive: z.boolean(),
  validFrom: IsoDateTime,
  createdAt: IsoDateTime,
  /** Handover reports answered against any version of this checklist. */
  handovers: z.number().int().nonnegative(),
});
export type ChecklistDefinitionView = z.infer<typeof ChecklistDefinitionView>;

export const ChecklistItemInput = z.object({
  label: z.string().trim().min(1).max(CHECKLIST_LIMITS.maxLabelLength),
  kind: ChecklistItemKindSchema,
});
export type ChecklistItemInput = z.infer<typeof ChecklistItemInput>;

/** Items in the order the employee sees them; keys are assigned by position on save. */
export const ChecklistItemsInput = z
  .array(ChecklistItemInput)
  .min(1)
  .max(CHECKLIST_LIMITS.maxItems)
  .superRefine((items, ctx) => {
    const issues = validateChecklistItems(
      items.map((item, index) => ({ ...item, key: checklistItemKey(index) })),
    );
    for (const issue of issues) {
      ctx.addIssue({ code: 'custom', message: issue, params: { issue } });
    }
  });

export const SaveChecklistCommand = z.object({
  name: z.string().trim().min(1).max(CHECKLIST_LIMITS.maxNameLength),
  /** The position is the key: employees get the checklist of their position. */
  positionId: Uuid,
  zoneType: ZoneTypeSchema.nullable().optional(),
  items: ChecklistItemsInput,
});
export type SaveChecklistCommand = z.infer<typeof SaveChecklistCommand>;

export const CreateChecklistCommand = SaveChecklistCommand;
export type CreateChecklistCommand = SaveChecklistCommand;

/** Editing never rewrites history: the API stores a new version in the same family. */
export const UpdateChecklistCommand = SaveChecklistCommand;
export type UpdateChecklistCommand = SaveChecklistCommand;

export const SetChecklistStatusCommand = z.object({
  isActive: z.boolean(),
  reason: Comment.optional(),
});
export type SetChecklistStatusCommand = z.infer<typeof SetChecklistStatusCommand>;
