import { describe, expect, it } from 'vitest';
import {
  AnchorMode,
  IntervalUnit,
  OperationResult,
  WorkPriority,
  WorkStatus,
  WorkType,
} from './codes.js';
import {
  DEFAULT_EMERGENCY_POLICY,
  emergencyDeadlines,
  emergencyPriority,
  reportNeedsRepair,
} from './emergency.js';
import { reminderPlan } from './reminders.js';
import { addInterval, forecastDueDates, isOverdue, nextCycle } from './schedule.js';
import { WorkAction, WorkError, transitionWork, type WorkSnapshot } from './work.js';
import {
  MaintenanceCallbackAction,
  maintenanceCallback,
  parseMaintenanceCallback,
} from './callbacks.js';

const monthly = {
  intervalUnit: IntervalUnit.MONTH,
  intervalCount: 1,
  anchorMode: AnchorMode.FROM_COMPLETION,
};

describe('maintenance schedule (spec 014 FR-024, FR-052)', () => {
  it('adds calendar intervals and clamps month ends', () => {
    expect(addInterval('2026-01-31', IntervalUnit.MONTH, 1)).toBe('2026-02-28');
    expect(addInterval('2026-09-30', IntervalUnit.WEEK, 2)).toBe('2026-10-14');
    expect(addInterval('2026-12-30', IntervalUnit.DAY, 3)).toBe('2027-01-02');
  });

  it('counts from the performed date when anchored to completion', () => {
    expect(nextCycle(monthly, '2026-09-30', '2026-10-03')).toEqual({
      nextDueOn: '2026-11-03',
      missed: [],
    });
  });

  it('keeps a fixed grid and records the cycles a late one skipped', () => {
    const fixed = { ...monthly, anchorMode: AnchorMode.FIXED_CALENDAR };
    expect(nextCycle(fixed, '2026-01-31', '2026-02-10')).toEqual({
      nextDueOn: '2026-02-28',
      missed: [],
    });
    expect(nextCycle(fixed, '2026-01-31', '2026-04-05')).toEqual({
      nextDueOn: '2026-04-30',
      missed: ['2026-02-28', '2026-03-31'],
    });
  });

  it('forecasts later cycles without the open one', () => {
    const weekly = { ...monthly, intervalUnit: IntervalUnit.WEEK };
    expect(
      forecastDueDates(weekly, '2026-10-01', { from: '2026-10-01', to: '2026-10-31' }),
    ).toEqual(['2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29']);
  });

  it('is overdue only while open and after the due date', () => {
    expect(isOverdue('2026-09-22', '2026-09-24', WorkStatus.ASSIGNED)).toBe(true);
    expect(isOverdue('2026-09-22', '2026-09-22', WorkStatus.ASSIGNED)).toBe(false);
    expect(isOverdue('2026-09-22', '2026-09-24', WorkStatus.COMPLETED)).toBe(false);
  });
});

describe('maintenance reminders (FR-040, FR-041)', () => {
  it('fires 7, 3 and 1 day before at 09:00 site time', () => {
    const plan = reminderPlan({
      plannedOn: '2026-10-10',
      offsets: [7, 3, 1],
      localTime: '09:00',
      timezone: 'Europe/Kyiv',
      now: new Date('2026-09-24T12:00:00Z'),
    });
    expect(plan.notifyNow).toBe(false);
    expect(plan.fires.map((fire) => [fire.offsetDays, fire.fireAt.toISOString()])).toEqual([
      [7, '2026-10-03T06:00:00.000Z'],
      [3, '2026-10-07T06:00:00.000Z'],
      [1, '2026-10-09T06:00:00.000Z'],
    ]);
  });

  it('replaces skipped offsets by one notice now', () => {
    const plan = reminderPlan({
      plannedOn: '2026-10-10',
      offsets: [7, 3, 1],
      localTime: '09:00',
      timezone: 'Europe/Kyiv',
      now: new Date('2026-10-08T07:00:00Z'),
    });
    expect(plan.fires.map((fire) => fire.offsetDays)).toEqual([1]);
    expect(plan.notifyNow).toBe(true);
  });

  it('sends nothing for a date already past', () => {
    const plan = reminderPlan({
      plannedOn: '2026-09-22',
      offsets: [7, 3, 1],
      localTime: '09:00',
      timezone: 'Europe/Kyiv',
      now: new Date('2026-09-24T07:00:00Z'),
    });
    expect(plan).toEqual({ fires: [], notifyNow: false });
  });

  it('keeps local 09:00 across the October DST change', () => {
    const plan = reminderPlan({
      plannedOn: '2026-10-26',
      offsets: [1],
      localTime: '09:00',
      timezone: 'Europe/Kyiv',
      now: new Date('2026-10-01T00:00:00Z'),
    });
    expect(plan.fires[0]?.fireAt.toISOString()).toBe('2026-10-25T07:00:00.000Z');
  });
});

const notApplicable = { operationId: 'a', result: OperationResult.NOT_APPLICABLE, hasPhoto: false };
const donePhoto = { operationId: 'b', result: OperationResult.DONE, hasPhoto: true };

const planned: WorkSnapshot = {
  type: WorkType.PLANNED_MAINTENANCE,
  status: WorkStatus.IN_PROGRESS,
  accepted: true,
  operations: [
    { id: 'a', photoRequired: false },
    { id: 'b', photoRequired: true },
  ],
  answers: [notApplicable, donePhoto],
  summary: null,
};

describe('work order transitions (FR-050, FR-051)', () => {
  it('sends complete planned maintenance to review', () => {
    expect(transitionWork(planned, WorkAction.SUBMIT)).toEqual({
      ok: true,
      next: WorkStatus.IN_REVIEW,
    });
  });

  it('refuses submission with a missing answer, a not-done operation or a missing photo', () => {
    expect(
      transitionWork({ ...planned, answers: planned.answers.slice(1) }, WorkAction.SUBMIT),
    ).toEqual({ ok: false, error: WorkError.ANSWERS_MISSING });
    expect(
      transitionWork(
        {
          ...planned,
          answers: [
            { operationId: 'a', result: OperationResult.NOT_DONE, hasPhoto: false },
            donePhoto,
          ],
        },
        WorkAction.SUBMIT,
      ),
    ).toEqual({ ok: false, error: WorkError.OPERATION_NOT_DONE });
    expect(
      transitionWork(
        {
          ...planned,
          answers: [
            notApplicable,
            { operationId: 'b', result: OperationResult.DONE, hasPhoto: false },
          ],
        },
        WorkAction.SUBMIT,
      ),
    ).toEqual({ ok: false, error: WorkError.PHOTO_MISSING });
  });

  it('accepts or returns only reviews of planned maintenance', () => {
    const review = { ...planned, status: WorkStatus.IN_REVIEW };
    expect(transitionWork(review, WorkAction.ACCEPT_REVIEW)).toEqual({
      ok: true,
      next: WorkStatus.COMPLETED,
    });
    expect(transitionWork(review, WorkAction.RETURN)).toEqual({
      ok: true,
      next: WorkStatus.IN_PROGRESS,
    });
    expect(transitionWork({ ...review, status: WorkStatus.COMPLETED }, WorkAction.CANCEL)).toEqual({
      ok: false,
      error: WorkError.TRANSITION_NOT_ALLOWED,
    });
  });

  it('starts an emergency repair only after acceptance and completes it with a summary', () => {
    const emergency: WorkSnapshot = {
      type: WorkType.EMERGENCY_REPAIR,
      status: WorkStatus.ASSIGNED,
      accepted: false,
      operations: [],
      answers: [],
      summary: null,
    };
    expect(transitionWork(emergency, WorkAction.START)).toEqual({
      ok: false,
      error: WorkError.NOT_ACCEPTED,
    });
    const started = { ...emergency, accepted: true, status: WorkStatus.IN_PROGRESS };
    expect(transitionWork(started, WorkAction.SUBMIT)).toEqual({
      ok: false,
      error: WorkError.SUMMARY_MISSING,
    });
    expect(transitionWork({ ...started, summary: 'Replaced belt' }, WorkAction.SUBMIT)).toEqual({
      ok: true,
      next: WorkStatus.COMPLETED,
    });
    expect(
      transitionWork({ ...started, status: WorkStatus.IN_REVIEW }, WorkAction.ACCEPT_REVIEW),
    ).toEqual({ ok: false, error: WorkError.TRANSITION_NOT_ALLOWED });
  });
});

describe('emergency repair (FR-061, FR-062)', () => {
  it('derives priority from severity and stop', () => {
    expect(emergencyPriority('SAFETY', false)).toBe(WorkPriority.P0);
    expect(emergencyPriority('CRITICAL', true)).toBe(WorkPriority.P1);
    expect(emergencyPriority('NORMAL', false)).toBe(WorkPriority.P2);
    expect(reportNeedsRepair('NORMAL', false)).toBe(false);
    expect(reportNeedsRepair('NORMAL', true)).toBe(true);
  });

  it('counts deadlines from the receipt', () => {
    const at = new Date('2026-09-24T10:41:00Z');
    const p1 = emergencyDeadlines(at, WorkPriority.P1, DEFAULT_EMERGENCY_POLICY);
    expect(p1.ackDueAt.toISOString()).toBe('2026-09-24T10:46:00.000Z');
    expect(p1.escalateAt.toISOString()).toBe('2026-09-24T10:51:00.000Z');
    expect(p1.escalateImmediately).toBe(false);
    expect(
      emergencyDeadlines(at, WorkPriority.P0, DEFAULT_EMERGENCY_POLICY).escalateImmediately,
    ).toBe(true);
  });
});

describe('maintenance callbacks', () => {
  it('round-trips within 64 bytes and rejects foreign data', () => {
    const id = '0f5a7c1e-2b3d-4e5f-8a9b-0c1d2e3f4a5b';
    const data = maintenanceCallback(MaintenanceCallbackAction.ANSWER, id, '12.n');
    expect(data.length).toBeLessThanOrEqual(64);
    expect(parseMaintenanceCallback(data)).toEqual({
      action: MaintenanceCallbackAction.ANSWER,
      workOrderId: id,
      arg: '12.n',
    });
    expect(parseMaintenanceCallback(maintenanceCallback(MaintenanceCallbackAction.LIST))).toEqual({
      action: MaintenanceCallbackAction.LIST,
      workOrderId: null,
      arg: null,
    });
    expect(parseMaintenanceCallback('mw:o:not-a-uuid')).toBeNull();
    expect(parseMaintenanceCallback('inc:new')).toBeNull();
  });
});
