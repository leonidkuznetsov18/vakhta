import { expect, it } from 'vitest';
import {
  MAX_PHOTO_RULE_GUIDANCE,
  SaveChecklistPhotoRules,
  prohibitedPhotoInstruction,
} from './checklist-photo-rules.js';

it('accepts names alone and validates optional details against their listed objects', () => {
  expect(SaveChecklistPhotoRules.parse({ version: 0, items: ['Rag'] }).items).toEqual(['Rag']);
  const detail = {
    item: 'Tools',
    clarification: 'Loose hand tools',
    exceptions: 'Fixed machine components',
  };
  const valid = { version: 1, items: ['Tools'], details: [detail] };
  expect(SaveChecklistPhotoRules.safeParse(valid).success).toBe(true);
  for (const details of [
    [{ ...detail, item: 'Cup' }],
    [detail, detail],
    [{ ...detail, clarification: 'a'.repeat(301) }],
  ])
    expect(SaveChecklistPhotoRules.safeParse({ ...valid, details }).success).toBe(false);
});

it('keeps clarifications and exceptions as escaped rule data within the analysis limit', () => {
  const items = Array.from({ length: 30 }, (_, index) => `${index}`.padEnd(100, 'x'));
  const details = items.map((item) => ({
    item,
    clarification: '"'.repeat(300),
    exceptions: '\\'.repeat(300),
  }));
  expect(prohibitedPhotoInstruction(items, details).length).toBeLessThanOrEqual(
    MAX_PHOTO_RULE_GUIDANCE,
  );
  expect(
    prohibitedPhotoInstruction(
      ['Tools'],
      [{ item: 'Tools', clarification: 'Loose tools', exceptions: 'Fixed blade' }],
    ),
  ).toContain('"exceptions":"Fixed blade"');
  expect(prohibitedPhotoInstruction(['Rag'])).toContain('"item":"Rag"');
});
