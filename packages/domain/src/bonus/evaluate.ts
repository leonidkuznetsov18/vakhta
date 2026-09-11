import type { HandoverStatus } from '../handover/lifecycle.js';
import type { MediaQualityStatus } from '../media/quality.js';
import { punctualityPoints, type BonusRules, type HandoverDecision } from './rules.js';
import type { CriterionResult, CriterionStatus } from './score.js';

/**
 * Входи оцінки зміни (ТЗ 7.2–7.6). Збирає застосунок із журналу подій і таблиць рішень;
 * оцінювач чистий і детермінований (ADR-0007).
 */
export interface ShiftBonusInputs {
  /** Планові межі; null для зміни без призначення (резервний старт майстром). */
  readonly plan: { readonly planStartAt: Date; readonly planEndAt: Date } | null;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly lateMinutes: number;
  readonly earlyLeaveMinutes: number;
  /** Затверджені керівником допустимі відхилення (ТЗ 7.3): пересувають межу, не стирають факт. */
  readonly approvedLateMinutes: number;
  readonly approvedEarlyLeaveMinutes: number;
  readonly presence: {
    readonly arrived: boolean;
    readonly departed: boolean;
  };
  readonly sequence: {
    readonly closedByEmployee: boolean;
    readonly emergencyExit: boolean;
    readonly corrections: number;
    readonly needsClarification: boolean;
  };
  readonly breaks: {
    /** Перерви, обіди та службовий час понад ліміт без затвердженої причини. */
    readonly exceeded: number;
  };
  readonly openRequests: number;
  readonly downtime: {
    readonly events: readonly {
      readonly started: boolean;
      readonly reasonGiven: boolean;
      /** Повідомлення про проблему або причина без обовʼязкового сповіщення. */
      readonly notified: boolean;
      readonly ended: boolean;
    }[];
    readonly unregisteredConfirmed: number;
  };
  readonly handover: {
    readonly required: boolean;
    readonly status: HandoverStatus | null;
    readonly checklistComplete: boolean;
    readonly cannotComplete: boolean;
    readonly photos: readonly MediaQualityStatus[];
    readonly remarksComplete: boolean;
    readonly decision: HandoverDecision | null;
  };
  /** Підтверджений системний збій нейтралізує критерії, що залежать від бота (AC-17). */
  readonly systemIncident: boolean;
}

const BOT_DEPENDENT = [
  'DISCIPLINE_PRESENCE',
  'DISCIPLINE_SEQUENCE',
  'DISCIPLINE_BREAKS',
  'HANDOVER_PHOTOS',
] as const;

function result(
  criterion: CriterionResult['criterion'],
  status: CriterionStatus,
  earnedPoints: number,
  basis: string[],
): CriterionResult {
  return { criterion, status, earnedPoints, basis };
}

/** Вплив статусу передачі на критерій приймання (ТЗ 5.9, 7.5). */
export function handoverDecisionFrom(
  status: HandoverStatus | null,
  resolutionSeverity: 'NORMAL' | 'CRITICAL' | 'SAFETY' | null,
): HandoverDecision | null {
  switch (status) {
    case 'ACCEPTED':
    case 'RESOLVED_ACCEPTED':
      return 'ACCEPTED';
    case 'RESOLVED_NO_FAULT':
      return 'NO_FAULT';
    case 'RESOLVED_ISSUE_CONFIRMED':
      return resolutionSeverity === 'NORMAL' ? 'MINOR_ISSUE' : 'MAJOR_ISSUE';
    default:
      return null;
  }
}

/** Оцінка зміни за критеріями ТЗ 7.2. Простої та повідомлення про небезпеку не знижують бали (7.1). */
export function evaluateShift(rules: BonusRules, inputs: ShiftBonusInputs): CriterionResult[] {
  const results: CriterionResult[] = [];
  const max = (c: CriterionResult['criterion']) => rules.criteria[c].maxPoints;

  // Графік і пунктуальність
  if (!inputs.plan) {
    results.push(result('SCHEDULE_START', 'not_applicable', 0, ['NO_PLAN']));
    results.push(result('SCHEDULE_NO_EARLY_LEAVE', 'not_applicable', 0, ['NO_PLAN']));
  } else {
    const late = Math.max(0, inputs.lateMinutes - inputs.approvedLateMinutes);
    const lateBeyond = Math.max(0, late - Math.max(0, rules.graceMinutes.start - 0));
    const startPoints = punctualityPoints(rules, lateBeyond, 'start');
    results.push(
      result(
        'SCHEDULE_START',
        startPoints >= max('SCHEDULE_START') ? 'earned' : 'missed',
        startPoints,
        [
          `LATE_MINUTES:${inputs.lateMinutes}`,
          ...(inputs.approvedLateMinutes > 0
            ? [`APPROVED_LATE:${inputs.approvedLateMinutes}`]
            : []),
        ],
      ),
    );
    const early = Math.max(0, inputs.earlyLeaveMinutes - inputs.approvedEarlyLeaveMinutes);
    const earlyBeyond = Math.max(0, early - Math.max(0, rules.graceMinutes.end - 0));
    const earlyPoints = punctualityPoints(rules, earlyBeyond, 'earlyLeave');
    results.push(
      result(
        'SCHEDULE_NO_EARLY_LEAVE',
        earlyPoints >= max('SCHEDULE_NO_EARLY_LEAVE') ? 'earned' : 'missed',
        earlyPoints,
        [
          `EARLY_LEAVE_MINUTES:${inputs.earlyLeaveMinutes}`,
          ...(inputs.approvedEarlyLeaveMinutes > 0
            ? [`APPROVED_EARLY:${inputs.approvedEarlyLeaveMinutes}`]
            : []),
        ],
      ),
    );
  }

  // Цифрова дисципліна
  const presenceOk = inputs.presence.arrived && inputs.presence.departed;
  results.push(
    result(
      'DISCIPLINE_PRESENCE',
      presenceOk ? 'earned' : 'missed',
      presenceOk ? max('DISCIPLINE_PRESENCE') : 0,
      [`ARRIVED:${inputs.presence.arrived}`, `DEPARTED:${inputs.presence.departed}`],
    ),
  );

  if (inputs.sequence.emergencyExit || inputs.sequence.needsClarification) {
    results.push(
      result('DISCIPLINE_SEQUENCE', 'pending', 0, [
        inputs.sequence.emergencyExit ? 'EMERGENCY_EXIT' : 'NEEDS_CLARIFICATION',
      ]),
    );
  } else if (inputs.sequence.closedByEmployee && inputs.sequence.corrections === 0) {
    results.push(
      result('DISCIPLINE_SEQUENCE', 'earned', max('DISCIPLINE_SEQUENCE'), ['CLOSED_BY_EMPLOYEE']),
    );
  } else {
    const points = inputs.sequence.closedByEmployee
      ? Math.floor(max('DISCIPLINE_SEQUENCE') / 2)
      : 0;
    results.push(
      result('DISCIPLINE_SEQUENCE', 'missed', points, [
        `CLOSED_BY_EMPLOYEE:${inputs.sequence.closedByEmployee}`,
        `CORRECTIONS:${inputs.sequence.corrections}`,
      ]),
    );
  }

  const breakPoints = Math.max(0, max('DISCIPLINE_BREAKS') - inputs.breaks.exceeded * 2);
  results.push(
    result('DISCIPLINE_BREAKS', inputs.breaks.exceeded === 0 ? 'earned' : 'missed', breakPoints, [
      `BREAKS_EXCEEDED:${inputs.breaks.exceeded}`,
    ]),
  );

  if (inputs.openRequests > 0) {
    results.push(
      result('DISCIPLINE_NO_UNRESOLVED', 'pending', 0, [`OPEN_REQUESTS:${inputs.openRequests}`]),
    );
  } else {
    const ok = !inputs.sequence.needsClarification;
    results.push(
      result(
        'DISCIPLINE_NO_UNRESOLVED',
        ok ? 'earned' : 'missed',
        ok ? max('DISCIPLINE_NO_UNRESOLVED') : 0,
        [`NEEDS_CLARIFICATION:${inputs.sequence.needsClarification}`],
      ),
    );
  }

  // Простої та проблеми (ТЗ 7.4): тільки повнота оформлення; кількість і тривалість не карають.
  const events = inputs.downtime.events;
  if (events.length === 0 && inputs.downtime.unregisteredConfirmed === 0) {
    results.push(result('DOWNTIME_PROCESS', 'earned', max('DOWNTIME_PROCESS'), ['NO_DOWNTIME']));
  } else {
    const completeness = events.map(
      (e) => [e.started, e.reasonGiven, e.notified, e.ended].filter(Boolean).length / 4,
    );
    for (let i = 0; i < inputs.downtime.unregisteredConfirmed; i += 1) completeness.push(0);
    const avg = completeness.reduce((s, c) => s + c, 0) / completeness.length;
    const points = Math.round(max('DOWNTIME_PROCESS') * avg);
    results.push(
      result('DOWNTIME_PROCESS', points >= max('DOWNTIME_PROCESS') ? 'earned' : 'missed', points, [
        `EVENTS:${events.length}`,
        `UNREGISTERED:${inputs.downtime.unregisteredConfirmed}`,
        `COMPLETENESS:${Math.round(avg * 100)}`,
      ]),
    );
  }

  // Чистота і передача (ТЗ 7.5)
  const h = inputs.handover;
  if (!h.required) {
    for (const c of [
      'HANDOVER_CHECKLIST',
      'HANDOVER_PHOTOS',
      'HANDOVER_REMARKS',
      'HANDOVER_ACCEPTANCE',
    ] as const) {
      results.push(result(c, 'not_applicable', 0, ['NO_ZONE']));
    }
  } else {
    const submitted = h.status !== null && h.status !== 'DRAFT' && h.status !== 'SUPERSEDED';
    if (h.cannotComplete)
      results.push(result('HANDOVER_CHECKLIST', 'pending', 0, ['CANNOT_COMPLETE']));
    else
      results.push(
        result(
          'HANDOVER_CHECKLIST',
          submitted && h.checklistComplete ? 'earned' : 'missed',
          submitted && h.checklistComplete ? max('HANDOVER_CHECKLIST') : 0,
          [`SUBMITTED:${submitted}`],
        ),
      );

    const photosOk = h.photos.length >= 3 && h.photos.every((q) => q === 'OK');
    const suspicious = h.photos.some(
      (q) => q === 'DUPLICATE_SUSPECT' || q === 'DARK' || q === 'MANUAL_REVIEW' || q === 'PENDING',
    );
    if (h.photos.length >= 3 && suspicious)
      results.push(result('HANDOVER_PHOTOS', 'pending', 0, [`PHOTOS:${h.photos.join(',')}`]));
    else
      results.push(
        result(
          'HANDOVER_PHOTOS',
          photosOk ? 'earned' : 'missed',
          photosOk ? max('HANDOVER_PHOTOS') : 0,
          [`PHOTOS:${h.photos.join(',')}`],
        ),
      );

    results.push(
      result(
        'HANDOVER_REMARKS',
        submitted && h.remarksComplete ? 'earned' : 'missed',
        submitted && h.remarksComplete ? max('HANDOVER_REMARKS') : 0,
        [`REMARKS_COMPLETE:${h.remarksComplete}`],
      ),
    );

    if (h.status === 'DISPUTED' || h.status === 'SUBMITTED') {
      results.push(result('HANDOVER_ACCEPTANCE', 'pending', 0, [`STATUS:${h.status}`]));
    } else if (h.decision === null) {
      results.push(
        result('HANDOVER_ACCEPTANCE', submitted ? 'not_applicable' : 'missed', 0, [
          `STATUS:${h.status ?? 'NONE'}`,
        ]),
      );
    } else {
      const points = rules.handoverAcceptancePoints[h.decision];
      if (points === null)
        results.push(result('HANDOVER_ACCEPTANCE', 'not_applicable', 0, ['UNDETERMINED']));
      else
        results.push(
          result(
            'HANDOVER_ACCEPTANCE',
            points >= max('HANDOVER_ACCEPTANCE') ? 'earned' : 'missed',
            points,
            [`DECISION:${h.decision}`],
          ),
        );
    }
  }

  if (inputs.systemIncident) {
    return results.map((r) =>
      (BOT_DEPENDENT as readonly string[]).includes(r.criterion)
        ? {
            ...r,
            status: 'not_applicable',
            earnedPoints: 0,
            basis: [...r.basis, 'SYSTEM_INCIDENT'],
          }
        : r,
    );
  }
  return results;
}
