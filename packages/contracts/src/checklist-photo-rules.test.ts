import { expect, it } from 'vitest';
import { InspectionRules, SaveChecklistPhotoRules } from './checklist-photo-rules.js';

const RAG = '40000000-0000-4000-8000-000000000001';
it('references catalog objects once each with an optional bounded note', () => {
  expect(SaveChecklistPhotoRules.parse({ version: 0, rules: [{ objectId: RAG }] }).rules).toEqual([
    { objectId: RAG, note: '' },
  ]);
  expect(
    SaveChecklistPhotoRules.safeParse({
      version: 0,
      rules: [
        { objectId: RAG, note: 'x' },
        { objectId: RAG, note: 'y' },
      ],
    }).success,
  ).toBe(false);
  expect(
    SaveChecklistPhotoRules.safeParse({
      version: 0,
      rules: [{ objectId: RAG, note: 'a'.repeat(301) }],
    }).success,
  ).toBe(false);
  expect(
    SaveChecklistPhotoRules.safeParse({ version: 0, rules: [{ objectId: 'rag' }] }).success,
  ).toBe(false);
});
it('requires at least one named rule in an analysis snapshot', () => {
  expect(InspectionRules.safeParse([]).success).toBe(false);
  expect(InspectionRules.parse([{ objectId: RAG, name: 'Ганчірки', note: '' }])).toHaveLength(1);
});
