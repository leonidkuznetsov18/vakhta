import {
  MAX_PHOTO_RULE_NOTE,
  MAX_PHOTO_RULES,
  SaveChecklistPhotoRules,
  type ChecklistPhotoRulesView,
  type PhotoObjectView,
} from '@vakhta/contracts';

export interface RuleDraft {
  objectId: string;
  note: string;
}
export function rulesDraft(view: Pick<ChecklistPhotoRulesView, 'rules'>): RuleDraft[] {
  return view.rules.map(({ objectId, note }) => ({ objectId, note }));
}
export function toggleRule(draft: readonly RuleDraft[], objectId: string): RuleDraft[] {
  return draft.some((rule) => rule.objectId === objectId)
    ? draft.filter((rule) => rule.objectId !== objectId)
    : draft.length >= MAX_PHOTO_RULES
      ? [...draft]
      : [...draft, { objectId, note: '' }];
}
/** Each added, removed or re-noted object counts once: the number shown beside Save. */
export function countRuleChanges(draft: readonly RuleDraft[], saved: readonly RuleDraft[]): number {
  const before = new Map(saved.map((rule) => [rule.objectId, rule.note.trim()]));
  const after = new Map(draft.map((rule) => [rule.objectId, rule.note.trim()]));
  let changes = 0;
  for (const [objectId, note] of after) {
    const previous = before.get(objectId);
    if (previous === undefined || previous !== note) changes++;
  }
  for (const objectId of before.keys()) if (!after.has(objectId)) changes++;
  return changes;
}
export function rulesDraftState(draft: readonly RuleDraft[], saved: ChecklistPhotoRulesView) {
  const payload = {
    rules: draft.map((rule) => ({ objectId: rule.objectId, note: rule.note.trim() })),
  };
  const changes = countRuleChanges(draft, rulesDraft(saved));
  return {
    payload,
    valid:
      SaveChecklistPhotoRules.safeParse({ ...payload, version: saved.version }).success &&
      draft.every((rule) => rule.note.length <= MAX_PHOTO_RULE_NOTE),
    dirty: changes > 0,
    changes,
  };
}
/** Catalog entries ordered by name, with the ones already chosen for this zone flagged. */
export function catalogChoices(objects: readonly PhotoObjectView[], draft: readonly RuleDraft[]) {
  return objects
    .filter((object) => object.active || draft.some((rule) => rule.objectId === object.id))
    .map((object) => ({ ...object, selected: draft.some((rule) => rule.objectId === object.id) }));
}
