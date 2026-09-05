import { describe, expect, it } from 'vitest';
import { BONUS_CRITERIA, DEFAULT_BONUS_RULES, punctualityPoints, totalMaxPoints } from './rules.js';
import { scoreMonth, scoreShift, type CriterionResult } from './score.js';

function fullMarks(
  overrides: Partial<Record<(typeof BONUS_CRITERIA)[number], Partial<CriterionResult>>> = {},
) {
  return BONUS_CRITERIA.map<CriterionResult>((criterion) => ({
    criterion,
    status: 'earned',
    earnedPoints: DEFAULT_BONUS_RULES.criteria[criterion].maxPoints,
    basis: [],
    ...overrides[criterion],
  }));
}

describe('правила бонусу (ТЗ 7.2, 7.3)', () => {
  it('структура дає рівно 100 балів', () => {
    expect(totalMaxPoints(DEFAULT_BONUS_RULES)).toBe(100);
  });

  it('шкала пунктуальності відповідає таблиці 7.3', () => {
    expect(punctualityPoints(DEFAULT_BONUS_RULES, 0, 'start')).toBe(15);
    expect(punctualityPoints(DEFAULT_BONUS_RULES, 1, 'start')).toBe(10);
    expect(punctualityPoints(DEFAULT_BONUS_RULES, 15, 'start')).toBe(10);
    expect(punctualityPoints(DEFAULT_BONUS_RULES, 16, 'start')).toBe(5);
    expect(punctualityPoints(DEFAULT_BONUS_RULES, 30, 'start')).toBe(5);
    expect(punctualityPoints(DEFAULT_BONUS_RULES, 31, 'start')).toBe(0);
    expect(punctualityPoints(DEFAULT_BONUS_RULES, 20, 'earlyLeave')).toBe(3);
  });
});

describe('scoreShift (ТЗ 7.6)', () => {
  it('усі критерії виконані дають 100', () => {
    const s = scoreShift(DEFAULT_BONUS_RULES, fullMarks());
    expect(s).toMatchObject({
      score: 100,
      earnedPoints: 100,
      applicableMaxPoints: 100,
      status: 'final',
    });
  });

  it('T-16: запізнення знижує лише критерій початку', () => {
    const s = scoreShift(
      DEFAULT_BONUS_RULES,
      fullMarks({ SCHEDULE_START: { status: 'missed', earnedPoints: 5 } }),
    );
    expect(s.score).toBe(90);
  });

  it('N/A виключає критерій зі знаменника і нормалізує результат', () => {
    const s = scoreShift(
      DEFAULT_BONUS_RULES,
      fullMarks({ HANDOVER_ACCEPTANCE: { status: 'not_applicable', earnedPoints: 0 } }),
    );
    expect(s.applicableMaxPoints).toBe(90);
    expect(s.score).toBe(100);
  });

  it('pending або appealed роблять результат попереднім (FR-HND-02, AC-13)', () => {
    const s = scoreShift(
      DEFAULT_BONUS_RULES,
      fullMarks({ HANDOVER_ACCEPTANCE: { status: 'pending' } }),
    );
    expect(s.status).toBe('preliminary');
    expect(s.score).toBe(100);
  });

  it('якщо застосовних балів менше 60, автоматичний підсумок заборонено', () => {
    const results = fullMarks({
      DOWNTIME_PROCESS: { status: 'not_applicable' },
      HANDOVER_CHECKLIST: { status: 'not_applicable' },
      HANDOVER_PHOTOS: { status: 'not_applicable' },
      HANDOVER_REMARKS: { status: 'not_applicable' },
      HANDOVER_ACCEPTANCE: { status: 'not_applicable' },
    });
    const s = scoreShift(DEFAULT_BONUS_RULES, results);
    expect(s.applicableMaxPoints).toBe(50);
    expect(s).toMatchObject({ score: null, status: 'manual_review' });
  });

  it("бали ніколи не від'ємні і не перевищують максимум критерію (T-22)", () => {
    const s = scoreShift(
      DEFAULT_BONUS_RULES,
      fullMarks({ SCHEDULE_START: { earnedPoints: 40 }, DISCIPLINE_BREAKS: { earnedPoints: -3 } }),
    );
    expect(s.earnedPoints).toBe(95);
  });

  it('відсутній критерій є помилкою даних, а не нулем', () => {
    expect(() => scoreShift(DEFAULT_BONUS_RULES, fullMarks().slice(1))).toThrow(RangeError);
  });
});

describe('scoreMonth (ТЗ 7.6)', () => {
  it('зважує зміни за плановою тривалістю відносно 12 годин', () => {
    expect(
      scoreMonth([
        { score: 100, plannedMinutes: 720 },
        { score: 80, plannedMinutes: 360 },
      ]),
    ).toBeCloseTo(93.33, 2);
  });

  it('порожній місяць не має коефіцієнта', () => {
    expect(scoreMonth([])).toBeNull();
  });
});
