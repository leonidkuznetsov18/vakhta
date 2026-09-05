/**
 * Версійовані правила цифрового бонусу, ТЗ 7. Це дані, а не код: нова версія правил
 * створює новий запис bonus_rule_versions і не застосовується заднім числом (ТЗ 7.1).
 */

export type BonusSection = 'SCHEDULE' | 'DISCIPLINE' | 'DOWNTIME' | 'HANDOVER';

export const BONUS_CRITERIA = [
  'SCHEDULE_START',
  'SCHEDULE_NO_EARLY_LEAVE',
  'DISCIPLINE_PRESENCE',
  'DISCIPLINE_SEQUENCE',
  'DISCIPLINE_BREAKS',
  'DISCIPLINE_NO_UNRESOLVED',
  'DOWNTIME_PROCESS',
  'HANDOVER_CHECKLIST',
  'HANDOVER_PHOTOS',
  'HANDOVER_REMARKS',
  'HANDOVER_ACCEPTANCE',
] as const;

export type BonusCriterion = (typeof BONUS_CRITERIA)[number];

export interface CriterionDefinition {
  readonly section: BonusSection;
  readonly maxPoints: number;
}

/** Крок шкали пунктуальності: відхилення понад пільгове вікно до maxMinutes включно. */
export interface PunctualityStep {
  /** null означає «понад останній поріг». */
  readonly upToMinutes: number | null;
  readonly startPoints: number;
  readonly earlyLeavePoints: number;
}

/** Рішення майстра щодо приймання зони, ТЗ 7.5. null означає N/A (критерій виключається). */
export type HandoverDecision =
  'ACCEPTED' | 'MINOR_ISSUE' | 'MAJOR_ISSUE' | 'AROSE_AFTER_HANDOVER' | 'NO_FAULT' | 'UNDETERMINED';

export interface BonusRules {
  readonly version: string;
  readonly criteria: Readonly<Record<BonusCriterion, CriterionDefinition>>;
  readonly graceMinutes: { readonly start: number; readonly end: number };
  readonly punctualityScale: readonly PunctualityStep[];
  readonly handoverAcceptancePoints: Readonly<Record<HandoverDecision, number | null>>;
  /** Якщо застосовних балів менше, автоматичний підсумок заборонено (ТЗ 7.6). */
  readonly minApplicablePoints: number;
  /** Ручне зниження понад цей поріг вимагає другого підтвердження (ТЗ 7.7). */
  readonly secondApprovalThreshold: number;
}

/** Рекомендовані значення ТЗ 7.2, 7.3, 7.5, 7.6, 7.7. Замовник затверджує їх до пілоту. */
export const DEFAULT_BONUS_RULES: BonusRules = Object.freeze<BonusRules>({
  version: '2026-09-05-draft',
  criteria: {
    SCHEDULE_START: { section: 'SCHEDULE', maxPoints: 15 },
    SCHEDULE_NO_EARLY_LEAVE: { section: 'SCHEDULE', maxPoints: 10 },
    DISCIPLINE_PRESENCE: { section: 'DISCIPLINE', maxPoints: 5 },
    DISCIPLINE_SEQUENCE: { section: 'DISCIPLINE', maxPoints: 10 },
    DISCIPLINE_BREAKS: { section: 'DISCIPLINE', maxPoints: 5 },
    DISCIPLINE_NO_UNRESOLVED: { section: 'DISCIPLINE', maxPoints: 5 },
    DOWNTIME_PROCESS: { section: 'DOWNTIME', maxPoints: 20 },
    HANDOVER_CHECKLIST: { section: 'HANDOVER', maxPoints: 8 },
    HANDOVER_PHOTOS: { section: 'HANDOVER', maxPoints: 8 },
    HANDOVER_REMARKS: { section: 'HANDOVER', maxPoints: 4 },
    HANDOVER_ACCEPTANCE: { section: 'HANDOVER', maxPoints: 10 },
  },
  graceMinutes: { start: 5, end: 5 },
  punctualityScale: [
    { upToMinutes: 0, startPoints: 15, earlyLeavePoints: 10 },
    { upToMinutes: 15, startPoints: 10, earlyLeavePoints: 6 },
    { upToMinutes: 30, startPoints: 5, earlyLeavePoints: 3 },
    { upToMinutes: null, startPoints: 0, earlyLeavePoints: 0 },
  ],
  handoverAcceptancePoints: {
    ACCEPTED: 10,
    MINOR_ISSUE: 5,
    MAJOR_ISSUE: 0,
    AROSE_AFTER_HANDOVER: 10,
    NO_FAULT: 10,
    UNDETERMINED: null,
  },
  minApplicablePoints: 60,
  secondApprovalThreshold: 10,
});

export function totalMaxPoints(rules: BonusRules): number {
  return BONUS_CRITERIA.reduce((sum, c) => sum + rules.criteria[c].maxPoints, 0);
}

/** Бали пунктуальності за відхилення понад пільгове вікно (ТЗ 7.3). */
export function punctualityPoints(
  rules: BonusRules,
  minutesBeyondGrace: number,
  kind: 'start' | 'earlyLeave',
): number {
  const step =
    rules.punctualityScale.find(
      (s) => s.upToMinutes === null || minutesBeyondGrace <= s.upToMinutes,
    ) ?? rules.punctualityScale[rules.punctualityScale.length - 1];
  if (!step) throw new RangeError('Шкала пунктуальності порожня');
  return kind === 'start' ? step.startPoints : step.earlyLeavePoints;
}
