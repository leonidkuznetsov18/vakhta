import { SaveChecklistPhotoRules, type ChecklistPhotoRulesView } from '@vakhta/contracts';

export interface RuleField {
  id: string;
  value: string;
  clarification: string;
  exceptions: string;
}
export function ruleFields(view: Pick<ChecklistPhotoRulesView, 'items' | 'details'>): RuleField[] {
  return view.items.map((value) => {
    const detail = view.details?.find((detail) => detail.item === value);
    return {
      id: crypto.randomUUID(),
      value,
      clarification: detail?.clarification ?? '',
      exceptions: detail?.exceptions ?? '',
    };
  });
}
export function rulePayload(draft: readonly RuleField[]) {
  return {
    items: draft.map((field) => field.value.trim()),
    details: draft
      .filter((field) => field.clarification.trim() || field.exceptions.trim())
      .map((field) => ({
        item: field.value.trim(),
        clarification: field.clarification.trim(),
        exceptions: field.exceptions.trim(),
      })),
  };
}
export function rulesDraftState(draft: readonly RuleField[], saved: ChecklistPhotoRulesView) {
  const payload = rulePayload(draft);
  const parsed = SaveChecklistPhotoRules.safeParse({ ...payload, version: saved.version });
  return {
    payload,
    valid: parsed.success,
    dirty:
      JSON.stringify(payload) !==
      JSON.stringify({
        items: saved.items,
        details: saved.items.flatMap((item) => {
          const detail = saved.details?.find((detail) => detail.item === item);
          return detail && (detail.clarification || detail.exceptions) ? [detail] : [];
        }),
      }),
    invalidNames: draft.map(
      (field) =>
        !field.value.trim() ||
        field.value.length > 100 ||
        draft.some(
          (other) =>
            other.id !== field.id &&
            other.value.trim().toLocaleLowerCase() === field.value.trim().toLocaleLowerCase(),
        ),
    ),
  };
}
export function availableSuggestions(draft: readonly RuleField[], suggestions: readonly string[]) {
  return suggestions.filter(
    (value) =>
      !draft.some((field) => field.value.trim().toLocaleLowerCase() === value.toLocaleLowerCase()),
  );
}
