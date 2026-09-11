import { expect, it } from 'vitest';
import { countRuleChanges, rulesDraftState, toggleRule } from './rules-draft';

const A = '40000000-0000-4000-8000-000000000001';
const B = '40000000-0000-4000-8000-000000000002';
it('counts each added, removed or re-noted object once', () => {
  const saved = { version: 1, canEdit: true, rules: [{ objectId: A, name: 'A', note: 'x' }] };
  expect(rulesDraftState([{ objectId: A, note: ' x ' }], saved)).toMatchObject({
    dirty: false,
    changes: 0,
  });
  expect(countRuleChanges([{ objectId: A, note: 'y' }], [{ objectId: A, note: 'x' }])).toBe(1);
  expect(countRuleChanges([{ objectId: B, note: '' }], [{ objectId: A, note: 'x' }])).toBe(2);
  const draft = toggleRule(toggleRule([{ objectId: A, note: 'x' }], B), A);
  expect(rulesDraftState(draft, saved)).toMatchObject({ dirty: true, changes: 2 });
});
