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

it('preserves notes and identities while enriching, excluding a variant and reverting', async () => {
  const { DictionarySnapshot } = await import('@vakhta/contracts');
  const { enrichRule, excludeRuleVariant, clearRuleDictionary } = await import('./rules-draft');
  const dictionary = DictionarySnapshot.parse({
    conceptId: 'Q18545',
    englishName: 'ball',
    labels: { uk: 'М’яч' },
    description: {},
    source: 'CURATED',
    aliases: [],
    variants: [{ englishName: 'tennis ball', labels: {} }],
    coverage: 'CURATED',
    retrievedAt: '2026-09-14T00:00:00Z',
  });
  const saved = {
    version: 1,
    canEdit: true,
    rules: [{ objectId: A, name: 'М’яч', note: 'Allowed in storage' }],
  };
  const enriched = enrichRule(saved.rules, A, dictionary);
  expect(enriched).toHaveLength(1);
  expect(enriched[0]?.note).toBe('Allowed in storage');
  expect(rulesDraftState(enriched, saved).changes).toBe(1);
  const first = enriched[0];
  if (!first) throw new Error('Missing fixture rule');
  const excluded = excludeRuleVariant(first, 'tennis ball');
  expect(rulesDraftState([excluded], saved).payload.rules[0]?.dictionary?.variants).toEqual([]);
  expect(excluded.dictionary?.excludedVariants?.map((item) => item.englishName)).toEqual([
    'tennis ball',
  ]);
  expect(rulesDraftState([clearRuleDictionary(excluded)], saved).dirty).toBe(false);
});
