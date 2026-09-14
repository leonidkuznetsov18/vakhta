import {
  MAX_PHOTO_RULE_NOTE,
  type DictionarySnapshot,
  photoObjectKey,
  dictionaryLabel,
  MAX_PHOTO_RULES,
  SaveChecklistPhotoRules,
  type ChecklistPhotoRulesView,
  type PhotoObjectView,
} from '@vakhta/contracts';

export interface RuleDraft {
  objectId: string;
  note: string;
  dictionary?: DictionarySnapshot;
}
export function rulesDraft(view: Pick<ChecklistPhotoRulesView, 'rules'>): RuleDraft[] {
  return view.rules.map(({ objectId, note, dictionary }) => ({
    objectId,
    note,
    ...(dictionary ? { dictionary } : {}),
  }));
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
  const before = new Map(
    saved.map((rule) => [
      rule.objectId,
      JSON.stringify({ note: rule.note.trim(), dictionary: rule.dictionary }),
    ]),
  );
  const after = new Map(
    draft.map((rule) => [
      rule.objectId,
      JSON.stringify({ note: rule.note.trim(), dictionary: rule.dictionary }),
    ]),
  );
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
    rules: draft.map((rule) => ({ ...rule, note: rule.note.trim() })),
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

/** Apply a deliberate meaning selection without erasing a local exception or other rules. */
export function enrichRule(
  draft: readonly RuleDraft[],
  objectId: string,
  dictionary: DictionarySnapshot,
): RuleDraft[] {
  if (draft.some((rule) => rule.objectId === objectId))
    return draft.map((rule) => (rule.objectId === objectId ? { ...rule, dictionary } : rule));
  return draft.length >= MAX_PHOTO_RULES
    ? [...draft]
    : [...draft, { objectId, note: '', dictionary }];
}
export function dictionaryCatalogMatch(
  objects: readonly PhotoObjectView[],
  dictionary: DictionarySnapshot,
) {
  const keys = [dictionary.englishName, ...Object.values(dictionary.labels)].map(photoObjectKey);
  return objects.find((object) => object.active && keys.includes(photoObjectKey(object.name)));
}
export function ruleDisplayName(rule: RuleDraft, fallback: string, locale: 'uk' | 'ru' | 'en') {
  return rule.dictionary ? dictionaryLabel(rule.dictionary, locale) : fallback;
}
export function excludeRuleVariant(rule: RuleDraft, englishName: string): RuleDraft {
  const dictionary = rule.dictionary;
  const variant = dictionary?.variants.find((item) => item.englishName === englishName);
  if (!dictionary || !variant) return rule;
  return {
    ...rule,
    dictionary: {
      ...dictionary,
      variants: dictionary.variants.filter((item) => item !== variant),
      excludedVariants: [...(dictionary.excludedVariants ?? []), variant],
    },
  };
}
export function clearRuleDictionary(rule: RuleDraft): RuleDraft {
  const { dictionary: _dictionary, ...plain } = rule;
  return plain;
}
