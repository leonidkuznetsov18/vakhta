import { expect, it } from 'vitest';
import { DictionarySnapshot, EnglishObjectName } from './photo-object-dictionary.js';
import { PhotoRule, InspectionRules } from './checklist-photo-rules.js';
const dictionary = {
  conceptId: 'Q18545',
  englishName: 'ball',
  labels: { uk: 'М’яч' },
  description: {},
  source: 'CURATED',
  aliases: ['sports ball'],
  variants: [{ englishName: 'tennis ball', labels: {} }],
  coverage: 'CURATED',
  retrievedAt: '2026-09-14T00:00:00Z',
};
it('preserves English enrichment and legacy rule shape', () => {
  const rule = { objectId: '40000000-0000-4000-8000-000000000001', note: 'Allowed in storage' };
  expect(PhotoRule.parse(rule)).toEqual(rule);
  expect(InspectionRules.parse([{ ...rule, name: 'М’яч', dictionary }])[0]?.dictionary).toEqual(
    dictionary,
  );
});
it('refuses invented English, duplicate variants and oversized enrichment', () => {
  expect(EnglishObjectName.safeParse('мяч').success).toBe(false);
  expect(EnglishObjectName.safeParse('door').success).toBe(true);
  expect(
    DictionarySnapshot.safeParse({
      ...dictionary,
      variants: [dictionary.variants[0], dictionary.variants[0]],
    }).success,
  ).toBe(false);
  expect(
    DictionarySnapshot.safeParse({ ...dictionary, aliases: Array(13).fill('ball') }).success,
  ).toBe(false);
  expect(
    DictionarySnapshot.safeParse({ ...dictionary, conceptId: 'Q1 OR something' }).success,
  ).toBe(false);
});

it('keeps included and excluded variants disjoint', () => {
  expect(
    DictionarySnapshot.safeParse({ ...dictionary, excludedVariants: dictionary.variants }).success,
  ).toBe(false);
  expect(
    DictionarySnapshot.safeParse({
      ...dictionary,
      excludedVariants: [{ englishName: 'ball', labels: {} }],
    }).success,
  ).toBe(false);
  expect(
    DictionarySnapshot.parse({
      ...dictionary,
      excludedVariants: [{ englishName: 'beach ball', labels: {} }],
    }).excludedVariants?.[0]?.englishName,
  ).toBe('beach ball');
});
