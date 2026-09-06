import { describe, expect, it } from 'vitest';
import { DEFAULT_BONUS_RULES } from './rules.js';
import { scoreShift } from './score.js';
import { evaluateShift, handoverDecisionFrom, type ShiftBonusInputs } from './evaluate.js';

const T0 = new Date('2026-09-07T05:00:00Z');
const plan = { planStartAt: T0, planEndAt: new Date(T0.getTime() + 12 * 3_600_000) };

function perfect(): ShiftBonusInputs {
  return {
    plan,
    startedAt: T0,
    endedAt: plan.planEndAt,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    approvedLateMinutes: 0,
    approvedEarlyLeaveMinutes: 0,
    presence: { arrived: true, departed: true },
    sequence: {
      closedByEmployee: true,
      emergencyExit: false,
      corrections: 0,
      needsClarification: false,
    },
    breaks: { exceeded: 0 },
    openRequests: 0,
    downtime: { events: [], unregisteredConfirmed: 0 },
    handover: {
      required: true,
      status: 'ACCEPTED',
      checklistComplete: true,
      cannotComplete: false,
      photos: ['OK', 'OK', 'OK'],
      remarksComplete: true,
      decision: 'ACCEPTED',
    },
    systemIncident: false,
  };
}

describe('оцінка зміни (ТЗ 7.2–7.6, ADR-0007)', () => {
  it('ідеальна зміна дає 100 і final', () => {
    const score = scoreShift(DEFAULT_BONUS_RULES, evaluateShift(DEFAULT_BONUS_RULES, perfect()));
    expect(score).toMatchObject({
      score: 100,
      earnedPoints: 100,
      applicableMaxPoints: 100,
      status: 'final',
    });
  });

  it('T-15/7.3: запізнення за шкалою; затверджені хвилини пересувають межу, факт лишається в basis', () => {
    const late = evaluateShift(DEFAULT_BONUS_RULES, { ...perfect(), lateMinutes: 20 });
    const start = late.find((r) => r.criterion === 'SCHEDULE_START')!;
    expect(start).toMatchObject({ status: 'missed', earnedPoints: 10 });
    expect(start.basis).toContain('LATE_MINUTES:20');
    const approved = evaluateShift(DEFAULT_BONUS_RULES, {
      ...perfect(),
      lateMinutes: 20,
      approvedLateMinutes: 20,
    });
    expect(approved.find((r) => r.criterion === 'SCHEDULE_START')).toMatchObject({
      status: 'earned',
      earnedPoints: 15,
    });
    const noPlan = evaluateShift(DEFAULT_BONUS_RULES, { ...perfect(), plan: null });
    expect(noPlan.find((r) => r.criterion === 'SCHEDULE_START')?.status).toBe('not_applicable');
  });

  it('7.4: простої не карають за кількість, лише за повноту оформлення; незареєстрований простій рахується нулем', () => {
    const full = evaluateShift(DEFAULT_BONUS_RULES, {
      ...perfect(),
      downtime: {
        events: [
          { started: true, reasonGiven: true, notified: true, ended: true },
          { started: true, reasonGiven: true, notified: true, ended: true },
        ],
        unregisteredConfirmed: 0,
      },
    });
    expect(full.find((r) => r.criterion === 'DOWNTIME_PROCESS')).toMatchObject({
      status: 'earned',
      earnedPoints: 20,
    });
    const partial = evaluateShift(DEFAULT_BONUS_RULES, {
      ...perfect(),
      downtime: {
        events: [{ started: true, reasonGiven: true, notified: false, ended: true }],
        unregisteredConfirmed: 1,
      },
    });
    // (0.75 + 0) / 2 = 0.375 → 20 × 0.375 = 7.5 → 8
    expect(partial.find((r) => r.criterion === 'DOWNTIME_PROCESS')).toMatchObject({
      status: 'missed',
      earnedPoints: 8,
    });
  });

  it('7.5/AC-13: спір і підозріле фото переводять критерії на перевірку, а не знімають бали', () => {
    const disputed = evaluateShift(DEFAULT_BONUS_RULES, {
      ...perfect(),
      handover: {
        ...perfect().handover,
        status: 'DISPUTED',
        decision: null,
        photos: ['OK', 'DUPLICATE_SUSPECT', 'OK'],
      },
    });
    expect(disputed.find((r) => r.criterion === 'HANDOVER_ACCEPTANCE')?.status).toBe('pending');
    expect(disputed.find((r) => r.criterion === 'HANDOVER_PHOTOS')?.status).toBe('pending');
    expect(scoreShift(DEFAULT_BONUS_RULES, disputed).status).toBe('preliminary');
    expect(handoverDecisionFrom('RESOLVED_ISSUE_CONFIRMED', 'NORMAL')).toBe('MINOR_ISSUE');
    expect(handoverDecisionFrom('RESOLVED_ISSUE_CONFIRMED', 'CRITICAL')).toBe('MAJOR_ISSUE');
    expect(handoverDecisionFrom('RESOLVED_NO_FAULT', null)).toBe('NO_FAULT');
    const minor = evaluateShift(DEFAULT_BONUS_RULES, {
      ...perfect(),
      handover: {
        ...perfect().handover,
        status: 'RESOLVED_ISSUE_CONFIRMED',
        decision: 'MINOR_ISSUE',
      },
    });
    expect(minor.find((r) => r.criterion === 'HANDOVER_ACCEPTANCE')).toMatchObject({
      status: 'missed',
      earnedPoints: 5,
    });
  });

  it('7.6: без зони критерії передачі N/A і нормалізуються; системний збій нейтралізує залежні від бота (AC-17)', () => {
    const noZone = evaluateShift(DEFAULT_BONUS_RULES, {
      ...perfect(),
      handover: { ...perfect().handover, required: false },
    });
    const score = scoreShift(DEFAULT_BONUS_RULES, noZone);
    expect(score.applicableMaxPoints).toBe(70);
    expect(score.score).toBe(100);
    const outage = evaluateShift(DEFAULT_BONUS_RULES, {
      ...perfect(),
      presence: { arrived: false, departed: false },
      systemIncident: true,
    });
    expect(outage.find((r) => r.criterion === 'DISCIPLINE_PRESENCE')?.status).toBe(
      'not_applicable',
    );
    const s2 = scoreShift(DEFAULT_BONUS_RULES, outage);
    expect(s2.score).toBe(100);
    const bare = scoreShift(
      DEFAULT_BONUS_RULES,
      evaluateShift(DEFAULT_BONUS_RULES, {
        ...perfect(),
        plan: null,
        handover: { ...perfect().handover, required: false },
        systemIncident: true,
      }),
    );
    expect(bare.status).toBe('manual_review');
  });

  it('екстрений вихід і відкриті звернення дають попередній результат; корекції знижують послідовність наполовину', () => {
    const emergency = evaluateShift(DEFAULT_BONUS_RULES, {
      ...perfect(),
      sequence: { ...perfect().sequence, emergencyExit: true },
    });
    expect(emergency.find((r) => r.criterion === 'DISCIPLINE_SEQUENCE')?.status).toBe('pending');
    const corrected = evaluateShift(DEFAULT_BONUS_RULES, {
      ...perfect(),
      sequence: { ...perfect().sequence, corrections: 1 },
    });
    expect(corrected.find((r) => r.criterion === 'DISCIPLINE_SEQUENCE')).toMatchObject({
      status: 'missed',
      earnedPoints: 5,
    });
    const open = evaluateShift(DEFAULT_BONUS_RULES, {
      ...perfect(),
      openRequests: 1,
      breaks: { exceeded: 2 },
    });
    expect(open.find((r) => r.criterion === 'DISCIPLINE_NO_UNRESOLVED')?.status).toBe('pending');
    expect(open.find((r) => r.criterion === 'DISCIPLINE_BREAKS')).toMatchObject({
      status: 'missed',
      earnedPoints: 1,
    });
  });
});
