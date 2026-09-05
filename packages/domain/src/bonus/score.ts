import { BONUS_CRITERIA, type BonusCriterion, type BonusRules } from './rules.js';

/** Статус критерію, ТЗ 7.6. */
export type CriterionStatus =
  'earned' | 'missed' | 'not_applicable' | 'pending' | 'appealed' | 'confirmed';

export interface CriterionResult {
  readonly criterion: BonusCriterion;
  readonly status: CriterionStatus;
  /** Нараховано; для not_applicable ігнорується. */
  readonly earnedPoints: number;
  /** Підстава: коди подій, рішень, версій. Показується працівнику (ТЗ 7.1). */
  readonly basis: readonly string[];
}

export type ShiftScoreStatus = 'preliminary' | 'final' | 'manual_review';

export interface ShiftScore {
  /** 0–100 або null, якщо потрібна ручна перевірка. */
  readonly score: number | null;
  readonly earnedPoints: number;
  readonly applicableMaxPoints: number;
  readonly status: ShiftScoreStatus;
  readonly results: readonly CriterionResult[];
}

/**
 * Формула ТЗ 7.6: Sᵢ = 100 × (нараховані застосовні бали / максимум застосовних балів).
 * Критерій not_applicable виключається зі знаменника. Якщо застосовних балів менше за
 * minApplicablePoints, автоматичний підсумок заборонений. Наявність pending або appealed
 * робить результат попереднім.
 */
export function scoreShift(rules: BonusRules, results: readonly CriterionResult[]): ShiftScore {
  const byCriterion = new Map(results.map((r) => [r.criterion, r]));
  let earned = 0;
  let applicableMax = 0;
  let preliminary = false;

  for (const criterion of BONUS_CRITERIA) {
    const def = rules.criteria[criterion];
    const r = byCriterion.get(criterion);
    if (!r) throw new RangeError(`Немає результату для критерію ${criterion}`);
    if (r.status === 'not_applicable') continue;
    if (r.status === 'pending' || r.status === 'appealed') preliminary = true;

    const points = Math.min(Math.max(0, r.earnedPoints), def.maxPoints);
    earned += points;
    applicableMax += def.maxPoints;
  }

  if (applicableMax < rules.minApplicablePoints) {
    return {
      score: null,
      earnedPoints: earned,
      applicableMaxPoints: applicableMax,
      status: 'manual_review',
      results,
    };
  }

  const score = Math.round((100 * earned) / applicableMax);
  return {
    score,
    earnedPoints: earned,
    applicableMaxPoints: applicableMax,
    status: preliminary ? 'preliminary' : 'final',
    results,
  };
}

export interface MonthlyShiftScore {
  readonly score: number;
  /** Вага = планова тривалість відносно 12 годин (ТЗ 7.6). */
  readonly plannedMinutes: number;
}

/** S_month = Σ(Sᵢ × Wᵢ) / ΣWᵢ. Порожній місяць дає null. */
export function scoreMonth(shifts: readonly MonthlyShiftScore[]): number | null {
  const weighted = shifts.reduce((s, sh) => s + sh.score * (sh.plannedMinutes / 720), 0);
  const weights = shifts.reduce((s, sh) => s + sh.plannedMinutes / 720, 0);
  if (weights === 0) return null;
  return Math.round((weighted / weights) * 100) / 100;
}
