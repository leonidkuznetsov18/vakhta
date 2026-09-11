import { z } from 'zod';
import { Uuid } from './common.js';
import { PhotoObjectColor } from './photo-objects.js';

export const MAX_PHOTO_RULES = 30;
export const MAX_PHOTO_RULE_NOTE = 300;
/** A prohibited object type for one checklist family and zone, referencing the shared catalog. */
export const PhotoRule = z.object({
  objectId: Uuid,
  /** Optional wording for the master and the model: appearance, placement, allowed cases. */
  note: z.string().trim().max(MAX_PHOTO_RULE_NOTE).default(''),
});
export type PhotoRule = z.infer<typeof PhotoRule>;
const uniqueObjects = (rules: readonly { objectId: string }[]) =>
  new Set(rules.map((rule) => rule.objectId)).size === rules.length;
export const SaveChecklistPhotoRules = z.object({
  version: z.number().int().nonnegative(),
  rules: z.array(PhotoRule).max(MAX_PHOTO_RULES).refine(uniqueObjects, 'Duplicate objects'),
});
export type SaveChecklistPhotoRules = z.infer<typeof SaveChecklistPhotoRules>;
/** Color is the catalog object's own; snapshots stored before colors existed carry none. */
export const ChecklistPhotoRuleView = PhotoRule.extend({
  name: z.string(),
  color: PhotoObjectColor.optional(),
});
export type ChecklistPhotoRuleView = z.infer<typeof ChecklistPhotoRuleView>;
export const ChecklistPhotoRulesView = z.object({
  version: z.number().int().nonnegative(),
  rules: z.array(ChecklistPhotoRuleView).max(MAX_PHOTO_RULES),
  canEdit: z.boolean(),
});
export type ChecklistPhotoRulesView = z.infer<typeof ChecklistPhotoRulesView>;
/** The exact rule snapshot an analysis run works from; stored verbatim on the run. */
export const InspectionRules = z.array(ChecklistPhotoRuleView).min(1).max(MAX_PHOTO_RULES);
export type InspectionRules = z.infer<typeof InspectionRules>;
