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
  validateHandoverDraft,
  type ChecklistAnswer,
} from './checklist.js';

const ITEMS = DEFAULT_CHECKLIST_KEYS.map((key) => ({ key, label: key }));
const allOk = (): ChecklistAnswer[] => ITEMS.map((i) => ({ itemKey: i.key, ok: true }));
const allPhotos = () => HANDOVER_ANGLES.map((angle) => ({ angle, mediaObjectId: `m-${angle}` }));

describe('чек-лист і фото перед поданням (AC-10, FR-CLN-04, FR-PHO-01)', () => {
  it('повна чернетка без issues; пропущений пункт і ракурс блокують', () => {
    expect(validateHandoverDraft(ITEMS, allOk(), allPhotos())).toEqual([]);
    const issues = validateHandoverDraft(ITEMS, allOk().slice(1), allPhotos().slice(0, 2));
    expect(issues).toEqual([
      { code: 'ITEM_MISSING', itemKey: 'SURFACES' },
      { code: 'PHOTO_MISSING', angle: 'FLOOR' },
    ]);
  });

  it('зауваження без категорії, тексту чи оцінки безпеки неповне', () => {
    const answers = allOk().map((a) =>
      a.itemKey === 'FLOOR' ? { itemKey: 'FLOOR', ok: false } : a,
    );
    const issues = validateHandoverDraft(ITEMS, answers, allPhotos());
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
    expect(validateHandoverDraft(ITEMS, fixed, allPhotos())).toEqual([]);
  });

  it('FR-CLN-05: «не можу завершити» пропускає пункти й фото, але не неповні зауваження', () => {
    const partial = [{ itemKey: 'SURFACES', ok: false, remarkCategory: 'DAMAGE' }];
    const issues = validateHandoverDraft(ITEMS, partial, [], { cannotComplete: true });
    expect(issues.map((i) => i.code)).toEqual(['REMARK_TEXT_REQUIRED', 'REMARK_SAFETY_REQUIRED']);
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
