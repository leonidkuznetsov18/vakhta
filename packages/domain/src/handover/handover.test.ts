import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  acceptDeadline,
  canReview,
  canTransitionHandover,
  handoverBonusEffect,
} from './lifecycle.js';
import {
  DEFAULT_CHECKLIST_KEYS,
  HANDOVER_ANGLES,
  checklistItemKey,
  defaultChecklistItems,
  photoItems,
  validateChecklistItems,
  validateHandoverDraft,
  type ChecklistAnswer,
  type ChecklistItemDefinition,
} from './checklist.js';

const ITEMS = DEFAULT_CHECKLIST_KEYS.map((key) => ({ key, label: key }));
const PHOTOS: ChecklistItemDefinition[] = HANDOVER_ANGLES.map((angle) => ({
  key: `PHOTO_${angle}`,
  label: angle,
  kind: 'PHOTO',
}));
const ALL = [...ITEMS, ...PHOTOS];
const allOk = (): ChecklistAnswer[] => ITEMS.map((i) => ({ itemKey: i.key, ok: true }));
const allPhotos = () => PHOTOS.map((p) => ({ itemKey: p.key, mediaObjectId: `m-${p.key}` }));

describe('чек-лист і фото перед поданням (AC-10, FR-CLN-04, FR-PHO-01)', () => {
  it('повна чернетка без issues; пропущений пункт і фото блокують', () => {
    expect(validateHandoverDraft(ALL, allOk(), allPhotos())).toEqual([]);
    const issues = validateHandoverDraft(ALL, allOk().slice(1), allPhotos().slice(0, 2));
    expect(issues).toEqual([
      { code: 'ITEM_MISSING', itemKey: 'SURFACES' },
      { code: 'PHOTO_MISSING', itemKey: 'PHOTO_FLOOR' },
    ]);
  });

  it('фото-пункти не потребують відповіді, а лише фото; порядок issues повторює порядок пунктів', () => {
    const items: ChecklistItemDefinition[] = [
      { key: 'ITEM_01', label: 'Фото до', kind: 'PHOTO' },
      { key: 'ITEM_02', label: 'Стіл чистий', kind: 'CHECK' },
      { key: 'ITEM_03', label: 'Фото після', kind: 'PHOTO' },
    ];
    expect(validateHandoverDraft(items, [], [{ itemKey: 'ITEM_03', mediaObjectId: 'm' }])).toEqual([
      { code: 'PHOTO_MISSING', itemKey: 'ITEM_01' },
      { code: 'ITEM_MISSING', itemKey: 'ITEM_02' },
    ]);
  });

  it('зауваження без категорії, тексту чи оцінки безпеки неповне', () => {
    const answers = allOk().map((a) =>
      a.itemKey === 'FLOOR' ? { itemKey: 'FLOOR', ok: false } : a,
    );
    const issues = validateHandoverDraft(ALL, answers, allPhotos());
    expect(issues.map((i) => i.code)).toEqual([
      'REMARK_CATEGORY_REQUIRED',
      'REMARK_TEXT_REQUIRED',
      'REMARK_SAFETY_REQUIRED',
    ]);
    const fixed = answers.map((a) =>
      a.itemKey === 'FLOOR'
        ? {
            ...a,
            remarkCategory: 'DIRT',
            remarkText: 'Лужа у станка',
            safeToWork: true,
            needs: ['CLEANING' as const],
          }
        : a,
    );
    expect(validateHandoverDraft(ALL, fixed, allPhotos())).toEqual([]);
  });

  it('FR-CLN-05: «не можу завершити» пропускає пункти й фото, але не неповні зауваження', () => {
    const partial = [{ itemKey: 'SURFACES', ok: false, remarkCategory: 'DAMAGE' }];
    const issues = validateHandoverDraft(ALL, partial, [], { cannotComplete: true });
    expect(issues.map((i) => i.code)).toEqual(['REMARK_TEXT_REQUIRED', 'REMARK_SAFETY_REQUIRED']);
  });
});

describe('шаблон чек-листа, який зберігає адміністратор', () => {
  const labels = {
    items: Object.fromEntries(DEFAULT_CHECKLIST_KEYS.map((k) => [k, k])) as Record<
      (typeof DEFAULT_CHECKLIST_KEYS)[number],
      string
    >,
    angles: { OVERVIEW: 'o', SURFACES: 's', FLOOR: 'f' },
  };

  it('дефолтний шаблон ТЗ 5.6: сім перевірок, повідомлення і три фото', () => {
    const items = defaultChecklistItems(labels);
    expect(items).toHaveLength(11);
    expect(photoItems(items).map((p) => p.key)).toEqual([
      'PHOTO_OVERVIEW',
      'PHOTO_SURFACES',
      'PHOTO_FLOOR',
    ]);
    expect(items.find((i) => i.key === 'MESSAGE_NEXT')?.kind).toBe('NOTE');
    expect(validateChecklistItems(items)).toEqual([]);
  });

  it('фото обовʼязкове: шаблон без фото-пункту не проходить', () => {
    expect(validateChecklistItems([{ key: 'ITEM_01', label: 'x', kind: 'CHECK' }])).toEqual([
      'NO_PHOTO_ITEM',
    ]);
    expect(validateChecklistItems([])).toEqual(['NO_ITEMS']);
  });

  it('порожні підписи, дублікати й небезпечні ключі відхиляються', () => {
    expect(
      validateChecklistItems([
        { key: 'ITEM_01', label: ' ', kind: 'PHOTO' },
        { key: 'ITEM_01', label: 'b', kind: 'CHECK' },
        { key: 'bad key', label: 'c', kind: 'CHECK' },
      ]),
    ).toEqual(['EMPTY_LABEL', 'DUPLICATE_KEY', 'INVALID_KEY']);
  });

  it('ключі пунктів стабільні й придатні для callback data', () => {
    expect(checklistItemKey(0)).toBe('ITEM_01');
    expect(checklistItemKey(39)).toBe('ITEM_40');
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 39 }), (i) => {
        expect(/^[A-Z][A-Z0-9_]{1,31}$/.test(checklistItemKey(i))).toBe(true);
      }),
    );
  });
});

describe('життєвий цикл передачі (ТЗ 5.9, FR-HND-*)', () => {
  it('переходи за таблицею; рішення термінальні', () => {
    expect(canTransitionHandover('DRAFT', 'SUBMITTED')).toBe(true);
    expect(canTransitionHandover('SUBMITTED', 'ACCEPTED')).toBe(true);
    expect(canTransitionHandover('SUBMITTED', 'DISPUTED')).toBe(true);
    expect(canTransitionHandover('SUBMITTED', 'SUPERSEDED')).toBe(true);
    expect(canTransitionHandover('DISPUTED', 'RESOLVED_ISSUE_CONFIRMED')).toBe(true);
    expect(canTransitionHandover('ACCEPTED', 'DISPUTED')).toBe(false);
    expect(canTransitionHandover('RESOLVED_NO_FAULT', 'SUBMITTED')).toBe(false);
  });

  it('вплив на бонус: попередній до рішення, підтверджений після приймання, без зниження без вини', () => {
    expect(handoverBonusEffect('SUBMITTED')).toBe('PRELIMINARY');
    expect(handoverBonusEffect('ACCEPTED')).toBe('CONFIRMED');
    expect(handoverBonusEffect('DISPUTED')).toBe('UNDER_REVIEW');
    expect(handoverBonusEffect('RESOLVED_NO_FAULT')).toBe('NO_PENALTY');
    expect(handoverBonusEffect('RESOLVED_ISSUE_CONFIRMED')).toBe('PENALTY');
  });

  it('T-32: власну передачу прийняти не можна; дедлайн від кінця зміни здавача', () => {
    expect(canReview('a', 'a')).toBe(false);
    expect(canReview('b', 'a')).toBe(true);
    const submitted = new Date('2026-09-07T16:30:00Z');
    const planEnd = new Date('2026-09-07T17:00:00Z');
    expect(acceptDeadline(submitted, planEnd, 30).toISOString()).toBe('2026-09-07T17:30:00.000Z');
    expect(acceptDeadline(new Date('2026-09-07T17:10:00Z'), planEnd, 30).toISOString()).toBe(
      '2026-09-07T17:40:00.000Z',
    );
    expect(acceptDeadline(submitted, null, 30).toISOString()).toBe('2026-09-07T17:00:00.000Z');
  });

  it('дедлайн ніколи не раніше моменту подання', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2026-01-01'), max: new Date('2027-01-01'), noInvalidDate: true }),
        fc.integer({ min: 0, max: 600 }),
        (submittedAt, minutes) => {
          expect(acceptDeadline(submittedAt, null, minutes).getTime()).toBeGreaterThanOrEqual(
            submittedAt.getTime(),
          );
        },
      ),
    );
  });
});
