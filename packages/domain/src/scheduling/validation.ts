import { shiftMinutes, type PlannedShift } from './types.js';

/** Правила перевірки графіка (ТЗ 3.2). Значення налаштовуються по майданчику (ТЗ 18). */
export interface ScheduleRules {
  /** Мінімальний відпочинок між змінами; 11 годин за типовими нормами. */
  readonly minRestMinutes: number;
  /** Верхня межа планових годин на місяць; перевищення є попередженням. */
  readonly maxHoursPerMonth: number;
  /** Скільки календарних днів поспіль зі змінами допустимо без попередження. */
  readonly maxConsecutiveDays: number;
  /** Частка нічних змін поза цим коридором дає попередження, якщо змін не менше minShifts. */
  readonly nightShare: { readonly min: number; readonly max: number; readonly minShifts: number };
}

export const DEFAULT_SCHEDULE_RULES: ScheduleRules = Object.freeze({
  minRestMinutes: 11 * 60,
  maxHoursPerMonth: 200,
  maxConsecutiveDays: 4,
  nightShare: { min: 0.3, max: 0.7, minShifts: 6 },
});

export const VALIDATION_ISSUE_CODES = [
  'OVERLAP',
  'REST_TOO_SHORT',
  'DUPLICATE_DAY',
  'MONTH_HOURS_EXCEEDED',
  'TOO_MANY_CONSECUTIVE_DAYS',
  'NIGHT_SHARE_UNBALANCED',
] as const;
export type ValidationIssueCode = (typeof VALIDATION_ISSUE_CODES)[number];

export type IssueSeverity = 'ERROR' | 'WARNING';

export interface ValidationIssue {
  readonly code: ValidationIssueCode;
  readonly severity: IssueSeverity;
  readonly employeeId: string;
  readonly assignmentIds: readonly string[];
  readonly details: Readonly<Record<string, number | string>>;
}

const SEVERITY: Readonly<Record<ValidationIssueCode, IssueSeverity>> = {
  OVERLAP: 'ERROR',
  REST_TOO_SHORT: 'ERROR',
  DUPLICATE_DAY: 'ERROR',
  MONTH_HOURS_EXCEEDED: 'WARNING',
  TOO_MANY_CONSECUTIVE_DAYS: 'WARNING',
  NIGHT_SHARE_UNBALANCED: 'WARNING',
};

function dayNumber(businessDate: string): number {
  const [y, m, d] = businessDate.split('-').map(Number);
  return Math.floor(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

/**
 * Перевіряє призначення однієї версії (`own`) з урахуванням уже опублікованих змін тих самих
 * працівників в інших версіях (`context`): суміжний місяць, інший підрозділ.
 * Помилки блокують подання і публікацію, попередження лише показуються.
 */
export function validateSchedule(
  own: readonly PlannedShift[],
  context: readonly PlannedShift[],
  rules: ScheduleRules = DEFAULT_SCHEDULE_RULES,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ownIds = new Set(own.map((s) => s.id));
  const byEmployee = new Map<string, PlannedShift[]>();
  for (const s of [...own, ...context]) {
    const list = byEmployee.get(s.employeeId) ?? [];
    list.push(s);
    byEmployee.set(s.employeeId, list);
  }

  const push = (
    code: ValidationIssueCode,
    employeeId: string,
    ids: string[],
    details: Record<string, number | string>,
  ) => issues.push({ code, severity: SEVERITY[code], employeeId, assignmentIds: ids, details });

  for (const [employeeId, shifts] of byEmployee) {
    const sorted = [...shifts].sort((a, b) => a.planStartAt.getTime() - b.planStartAt.getTime());

    // Дублікати ділової дати всередині версії.
    const ownByDate = new Map<string, PlannedShift[]>();
    for (const s of sorted) {
      if (!ownIds.has(s.id)) continue;
      const list = ownByDate.get(s.businessDate) ?? [];
      list.push(s);
      ownByDate.set(s.businessDate, list);
    }
    for (const [date, list] of ownByDate) {
      if (list.length > 1)
        push(
          'DUPLICATE_DAY',
          employeeId,
          list.map((s) => s.id),
          { businessDate: date },
        );
    }

    // Перетини й відпочинок між сусідніми змінами; звітуємо, лише якщо хоча б одна зміна наша.
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1]!;
      const cur = sorted[i]!;
      if (!ownIds.has(prev.id) && !ownIds.has(cur.id)) continue;
      const gapMinutes = Math.round(
        (cur.planStartAt.getTime() - prev.planEndAt.getTime()) / 60_000,
      );
      if (gapMinutes < 0) {
        push('OVERLAP', employeeId, [prev.id, cur.id], { overlapMinutes: -gapMinutes });
      } else if (gapMinutes < rules.minRestMinutes) {
        push('REST_TOO_SHORT', employeeId, [prev.id, cur.id], {
          restMinutes: gapMinutes,
          minRestMinutes: rules.minRestMinutes,
        });
      }
    }

    // Години за місяць: лише власні призначення версії.
    const ownShifts = sorted.filter((s) => ownIds.has(s.id));
    const monthMinutes = ownShifts.reduce((sum, s) => sum + shiftMinutes(s), 0);
    if (monthMinutes > rules.maxHoursPerMonth * 60) {
      push(
        'MONTH_HOURS_EXCEEDED',
        employeeId,
        ownShifts.map((s) => s.id),
        {
          plannedHours: Math.round(monthMinutes / 60),
          maxHoursPerMonth: rules.maxHoursPerMonth,
        },
      );
    }

    // Дні поспіль з урахуванням контексту; одне попередження на серію.
    const days = [...new Set(sorted.map((s) => s.businessDate))].sort();
    let run: string[] = [];
    const flushRun = () => {
      const runOwn = run.filter((d) => ownByDate.has(d));
      if (run.length > rules.maxConsecutiveDays && runOwn.length > 0) {
        const ids = ownShifts.filter((s) => run.includes(s.businessDate)).map((s) => s.id);
        push('TOO_MANY_CONSECUTIVE_DAYS', employeeId, ids, {
          days: run.length,
          maxConsecutiveDays: rules.maxConsecutiveDays,
          from: run[0]!,
          to: run[run.length - 1]!,
        });
      }
      run = [];
    };
    for (const d of days) {
      const last = run[run.length - 1];
      if (last !== undefined && dayNumber(d) - dayNumber(last) !== 1) flushRun();
      run.push(d);
    }
    flushRun();

    // Баланс день/ніч.
    if (ownShifts.length >= rules.nightShare.minShifts) {
      const nights = ownShifts.filter((s) => s.isNight).length;
      const share = nights / ownShifts.length;
      if (share < rules.nightShare.min || share > rules.nightShare.max) {
        push(
          'NIGHT_SHARE_UNBALANCED',
          employeeId,
          ownShifts.map((s) => s.id),
          {
            nightShifts: nights,
            totalShifts: ownShifts.length,
            share: Math.round(share * 100) / 100,
          },
        );
      }
    }
  }

  return issues;
}

export function hasBlockingIssues(issues: readonly ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'ERROR');
}
