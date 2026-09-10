import { setImmediate } from 'node:timers/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  domainEvents,
  presenceSessions,
  createDatabase,
  lockBonusMonthWithin,
  activityIntervals,
  backgroundTasks,
  bonusAdjustments,
  bonusPointAwards,
  bonusMonthClosures,
  bonusShiftScores,
  employeePositions,
  employees,
  eq,
  notificationOutbox,
  orgUnits,
  positions,
  reasonCodes,
  requests,
  scheduleVersions,
  shiftAssignments,
  shiftSessions,
  shiftSummaries,
  shiftTemplates,
  sites,
  sql,
} from '@vakhta/db';
import { DEFAULT_ATTENDANCE_WINDOW } from '@vakhta/domain';
import { DEFAULT_BONUS_RULES } from '@vakhta/domain';
import { AttendanceService } from '../attendance/attendance.service.js';
import { employeeActor } from '../common/actor.js';
import { AuditLog } from '../events/audit-log.js';
import { dispatchBonusTasks } from './bonus-task-dispatcher.js';
import { EventStore } from '../events/event-store.js';
import { TimerScheduler } from '../infra/timers.queue.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ShiftChanges } from '../shift/shift-changes.js';
import { ShiftService, type ShiftOptions } from '../shift/shift.service.js';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { BonusMonthService } from './bonus-month.service.js';
import { BonusService } from './bonus.service.js';

const HEAD = {
  type: 'WEB_USER',
  id: 'a0000000-0000-4000-8000-00000000bbbb',
  role: 'PRODUCTION_HEAD',
} as const;
const MASTER = {
  type: 'WEB_USER',
  id: 'a0000000-0000-4000-8000-00000000aaaa',
  role: 'SHIFT_MASTER',
} as const;
const HR = { type: 'WEB_USER', id: 'a0000000-0000-4000-8000-00000000cccc', role: 'HR' } as const;
const SHIFT_OPTIONS: ShiftOptions = {
  breakMinutes: 15,
  mealMinutes: 30,
  serviceTimeMinutes: 30,
  downtimeEscalationMinutes: 15,
  graceMinutes: 5,
  earlyStartWindowMinutes: 30,
  overtimeThresholdMinutes: 15,
  defaultTimezone: 'Europe/Kyiv',
};
let n = 0;
const key = () => `bn-${++n}`;

describe('bonus: оцінка зміни, коригування, закриття періоду (ТЗ 7, ADR-0007)', () => {
  let testDb: TestDatabase;
  let bonus: BonusService;
  let shift: ShiftService;
  let attendance: AttendanceService;
  let shiftChanges: ShiftChanges;
  let siteId: string;
  let ivanov: string;
  let month: string;
  let planStart: Date;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    // Only the isolated test database bypasses immutable history while resetting fixtures.
    await testDb.db.execute(sql`ALTER TABLE bonus_month_closures DISABLE TRIGGER USER`);
    await testDb.db.execute(sql`TRUNCATE bonus_month_closures`);
    await testDb.db.execute(sql`ALTER TABLE bonus_month_closures ENABLE TRIGGER USER`);

    await testDb.db.execute(
      sql`TRUNCATE bonus_month_guards, background_tasks, bonus_period_results, bonus_periods, bonus_adjustments, bonus_criteria_results, bonus_shift_scores, bonus_rule_versions, request_decisions, requests, shift_summaries, activity_intervals, shift_sessions, idempotency_keys, notification_outbox, presence_sessions, shift_assignments, schedule_versions, shift_templates, employees, org_units, sites, reason_codes CASCADE`,
    );
    const events = new EventStore();
    const audit = new AuditLog();
    const notifications = new NotificationsService();
    const timers = new TimerScheduler();
    shiftChanges = new ShiftChanges();
    attendance = new AttendanceService(testDb.db, events, audit, {
      window: DEFAULT_ATTENDANCE_WINDOW,
    });
    shift = new ShiftService(
      testDb.db,
      events,
      audit,
      notifications,
      attendance,
      shiftChanges,
      timers,
      SHIFT_OPTIONS,
    );
    bonus = new BonusService(testDb.db, events, audit, notifications, SHIFT_OPTIONS, {
      appealWindowDays: 3,
    });

    const [site] = await testDb.db
      .insert(sites)
      .values({ code: 'main', name: 'Основная', timezone: 'Europe/Kyiv' })
      .returning();
    siteId = site!.id;
    const [unit] = await testDb.db.insert(orgUnits).values({ siteId, name: 'Цех' }).returning();
    await testDb.db
      .insert(reasonCodes)
      .values([{ kind: 'ADJUSTMENT', code: 'MASTER_REVIEW', label: 'Проверка мастера' }]);
    const [tpl] = await testDb.db
      .insert(shiftTemplates)
      .values({ siteId, code: 'DAY', name: 'Дневная', localStart: '08:00', localEnd: '20:00' })
      .returning();
    const [version] = await testDb.db
      .insert(scheduleVersions)
      .values({
        siteId,
        orgUnitId: unit!.id,
        periodMonth: '2026-10',
        versionNo: 1,
        status: 'PUBLISHED',
      })
      .returning();
    const [emp] = await testDb.db
      .insert(employees)
      .values({ personnelNumber: '1', fullName: 'Иванов Иван' })
      .returning();
    ivanov = emp!.id;
    planStart = new Date(Date.now() - 11 * 3_600_000);
    month = new Date().toISOString().slice(0, 7);
    await testDb.db.insert(shiftAssignments).values({
      scheduleVersionId: version!.id,
      employeeId: ivanov,
      templateId: tpl!.id,
      businessDate: `${month}-15`,
      planStartAt: planStart,
      planEndAt: new Date(planStart.getTime() + 12 * 3_600_000),
      orgUnitId: unit!.id,
    });
  });

  /** Повний день без зони: старт (із запізненням за замовчуванням 0), робота, закриття. */
  it('serves final employee, department and master nominations after late ledger changes', async () => {
    await fullShift();
    const [unit] = await testDb.db.select().from(orgUnits).where(eq(orgUnits.siteId, siteId));
    if (!unit) throw new Error('Expected fixture department');
    await testDb.db.insert(bonusPointAwards).values({
      employeeId: ivanov,
      orgUnitId: unit.id,
      month,
      kind: 'CHECKLIST_APPROVED',
      points: 1,
    });
    await new BonusMonthService(testDb.db, new NotificationsService()).closeMonth(
      siteId,
      month,
      planStart,
    );
    const final = await bonus.points(siteId, month);
    await testDb.db
      .update(employees)
      .set({ fullName: 'Changed name' })
      .where(eq(employees.id, ivanov));
    await testDb.db.insert(bonusPointAwards).values({
      employeeId: ivanov,
      orgUnitId: unit.id,
      month,
      kind: 'CHECKLIST_APPROVED',
      points: 5,
    });
    const later = await bonus.points(siteId, month);
    expect(later.finalizedAt).toBe(planStart.toISOString());
    expect(later.employeeOfMonth).toEqual(final.employeeOfMonth);
    expect(later.unitOfMonth).toEqual(final.unitOfMonth);
    expect(later.masterOfMonth).toEqual(final.masterOfMonth);
    expect(later.employees[0]?.points).toBeGreaterThan(final.employees[0]?.points ?? 0);
  });

  async function fullShift(startOffsetMinutes = 0): Promise<string> {
    await attendance.reserveCheckIn(
      { employeeId: ivanov, action: 'ARRIVE', reasonCode: 'TERMINAL_DOWN' },
      MASTER,
    );
    const started = await shift.start(
      ivanov,
      { idempotencyKey: key() },
      { actor: employeeActor(ivanov), source: 'TELEGRAM' },
    );
    if (!started.ok) throw new Error(`старт відхилено: ${started.error}`);
    const sessionId = started.session.id;
    const startedAt = new Date(planStart.getTime() + startOffsetMinutes * 60_000);
    await testDb.db.update(shiftSessions).set({ startedAt }).where(eq(shiftSessions.id, sessionId));
    await testDb.db
      .update(activityIntervals)
      .set({ startedAt })
      .where(eq(activityIntervals.shiftSessionId, sessionId));
    for (const action of [
      'START_WORK',
      'START_CLEANING',
      'CLEANING_DONE',
      'SUBMIT_HANDOVER',
      'CLOSE_SHIFT',
    ] as const) {
      const current = await shift.activeSession(ivanov);
      const r = await shift.transition(
        ivanov,
        { action, expectedVersion: current!.version, idempotencyKey: key() },
        { actor: employeeActor(ivanov), source: 'TELEGRAM' },
      );
      if (!r.ok)
        throw new Error(`${action} відхилено: ${r.error} (стан ${r.session?.state ?? 'немає'})`);
    }
    await attendance.reserveCheckIn(
      { employeeId: ivanov, action: 'DEPART', reasonCode: 'TERMINAL_DOWN' },
      MASTER,
    );
    // Зміна закривається «зараз», хоча план триває ще годину: вирівнюємо план і підсумок,
    // щоб оцінка не бачила раннього відходу (сам розрахунок відхилень перевірено в домені).
    const [closed] = await testDb.db
      .select()
      .from(shiftSessions)
      .where(eq(shiftSessions.id, sessionId));
    await testDb.db.update(shiftAssignments).set({ planEndAt: closed!.endedAt! });
    await testDb.db
      .update(shiftSummaries)
      .set({ earlyLeaveMinutes: 0, plannedMinutes: 720 })
      .where(eq(shiftSummaries.shiftSessionId, sessionId));
    await dispatchBonusTasks(testDb.db, bonus, { batch: 100 });
    return sessionId;
  }

  it('does not penalize a zero-length projected downtime placeholder', async () => {
    const sessionId = await fullShift();
    const before = await bonus.evaluate(sessionId);
    const [session] = await testDb.db
      .select()
      .from(shiftSessions)
      .where(eq(shiftSessions.id, sessionId));
    if (!session?.endedAt) throw new Error('Missing closed shift');
    await testDb.db.insert(activityIntervals).values({
      shiftSessionId: sessionId,
      state: 'DOWNTIME',
      startedAt: session.endedAt,
      endedAt: session.endedAt,
      reasonCode: null,
    });
    const after = await bonus.evaluate(sessionId);
    expect(after?.criteria.find((criterion) => criterion.criterion === 'DOWNTIME_PROCESS')).toEqual(
      before?.criteria.find((criterion) => criterion.criterion === 'DOWNTIME_PROCESS'),
    );
    expect(after?.score).toBe(before?.score);
  });

  it('закриття зміни через шину подій оцінює її: без зони максимум 70 застосовних балів, S = 100 (7.6)', async () => {
    const sessionId = await fullShift();
    const view = await bonus.evaluate(sessionId);
    if (view?.status !== 'PRELIMINARY' || view.score !== 100) {
      throw new Error(
        `оцінка: ${JSON.stringify(view?.criteria.map((c) => [c.criterion, c.status, c.earnedPoints, c.basis]))}`,
      );
    }
    expect(view).toMatchObject({
      status: 'PRELIMINARY',
      score: 100,
      applicableMax: 70,
      earned: 70,
    });
    expect(view?.criteria.find((c) => c.criterion === 'HANDOVER_CHECKLIST')?.status).toBe(
      'not_applicable',
    );
    expect(view?.criteria.find((c) => c.criterion === 'DOWNTIME_PROCESS')).toMatchObject({
      status: 'earned',
      earnedPoints: 20,
    });
    expect(await testDb.db.select().from(bonusShiftScores)).toHaveLength(1);
    // повторна оцінка з тими самими входами не створює дубля і зберігає хеш
    const again = await bonus.evaluate(sessionId);
    expect(again?.id).toBe(view?.id);
  });

  it('the points page reads a real month: shifts, checklists and the ledger, scoped to the site', async () => {
    await fullShift();

    const view = await bonus.points(siteId, month);

    // The employee worked one shift this month; the page must find it, not throw on the date filter.
    expect(view.month).toBe(month);
    expect(view.employees.length).toBeGreaterThan(0);
    const row = view.employees.find((e) => e.personnelNumber === '1');
    expect(row?.shifts).toBe(1);
    // A month with nothing in it is empty, not an error.
    expect((await bonus.points(siteId, '2020-01')).employees).toEqual([]);
    // Someone who works at another site is not in this site's table; the unit says where they work.
    const [position] = await testDb.db
      .insert(positions)
      .values({ code: 'OP', name: 'Оператор' })
      .returning();
    const [unit] = await testDb.db
      .select()
      .from(orgUnits)
      .where(eq(orgUnits.siteId, siteId))
      .limit(1);
    await testDb.db.insert(employeePositions).values({
      employeeId: ivanov,
      orgUnitId: unit!.id,
      positionId: position!.id,
      validFrom: planStart,
    });
    const [other] = await testDb.db
      .insert(sites)
      .values({ code: 'second', name: 'Вторая', timezone: 'Europe/Kyiv' })
      .returning();
    expect((await bonus.points(other!.id, month)).employees).toEqual([]);
    expect((await bonus.points(siteId, month)).employees).toHaveLength(1);
  });

  it('the history tab groups the ledger by day, month and year, filtered by site and unit', async () => {
    const [unit] = await testDb.db
      .select()
      .from(orgUnits)
      .where(eq(orgUnits.siteId, siteId))
      .limit(1);
    await testDb.db.transaction(async (tx) => {
      await tx.insert(bonusPointAwards).values([
        {
          employeeId: ivanov,
          orgUnitId: unit!.id,
          month: '2026-08',
          businessDate: '2026-08-04',
          kind: 'CHECKLIST_APPROVED',
          points: 1,
        },
        {
          employeeId: ivanov,
          orgUnitId: unit!.id,
          month: '2026-08',
          businessDate: '2026-08-04',
          kind: 'UNIT_OF_MONTH',
          points: 1,
        },
        {
          employeeId: ivanov,
          orgUnitId: unit!.id,
          month: '2026-09',
          businessDate: '2026-09-02',
          kind: 'CHECKLIST_APPROVED',
          points: 1,
        },
      ]);
      await tx.insert(bonusMonthClosures).values({
        siteId,
        month: '2026-08',
        closedAt: planStart,
        employeeId: ivanov,
        employeeName: 'Иванов Иван',
        employeePoints: 2,
        orgUnitId: unit!.id,
        orgUnitName: unit!.name,
        orgUnitPoints: 1,
        masters: [],
      });
    });
    const range = { from: '2026-01-01', to: '2026-12-31', limit: 500 } as const;

    // Every grouping runs the same aggregate; a bound format pattern used to break the GROUP BY.
    const byDay = await bonus.history({ ...range, groupBy: 'day' });
    expect(byDay.buckets.map((b) => b.key)).toEqual(['2026-08-04', '2026-09-02']);
    expect(byDay.buckets[0]).toMatchObject({ points: 2, checklistPoints: 1, awardPoints: 1 });

    const byMonth = await bonus.history({ ...range, groupBy: 'month' });
    expect(byMonth.buckets.map((b) => b.key)).toEqual(['2026-08', '2026-09']);

    const byYear = await bonus.history({ ...range, groupBy: 'year' });
    expect(byYear.buckets).toEqual([
      {
        key: '2026',
        points: 3,
        checklistPoints: 2,
        awardPoints: 1,
        employees: 1,
        units: ['Цех'],
      },
    ]);

    // The rows behind the totals carry the names, so the tab and the export read the same data.
    expect(byYear.total).toBe(3);
    expect(byYear.entries).toHaveLength(3);
    expect(byYear.entries[0]).toMatchObject({
      employeeName: 'Иванов Иван',
      personnelNumber: '1',
      orgUnitName: 'Цех',
    });
    // Newest first.
    expect(byYear.entries.map((e) => e.businessDate)).toEqual([
      '2026-09-02',
      '2026-08-04',
      '2026-08-04',
    ]);

    // Filtering by reason and by name narrows both the totals and the rows.
    const awards = await bonus.history({ ...range, groupBy: 'year', kind: 'UNIT_OF_MONTH' });
    expect(awards.entries.map((e) => e.kind)).toEqual(['UNIT_OF_MONTH']);
    expect((await bonus.history({ ...range, groupBy: 'year', search: 'иванов' })).total).toBe(3);
    expect((await bonus.history({ ...range, groupBy: 'year', search: 'петров' })).total).toBe(0);

    // The download carries a header and one line per award, in both formats.
    const csvFile = await bonus.exportHistory({ ...range, groupBy: 'year' }, 'csv', HEAD);
    const text = csvFile.body.toString('utf8');
    expect(csvFile.contentType).toContain('text/csv');
    expect(csvFile.filename).toBe('vakhta-bonus-history-2026-01-01-2026-12-31.csv');
    expect(text.split('\n')).toHaveLength(4);
    expect(text).toContain('Иванов Иван');
    const xlsxFile = await bonus.exportHistory({ ...range, groupBy: 'year' }, 'xlsx', HEAD);
    expect(xlsxFile.contentType).toContain('spreadsheetml');
    expect(xlsxFile.body.byteLength).toBeGreaterThan(0);

    // Filters narrow the same query without changing its shape.
    expect((await bonus.history({ ...range, groupBy: 'year', siteId })).buckets).toHaveLength(1);
    expect(
      (await bonus.history({ ...range, groupBy: 'year', orgUnitId: unit!.id })).buckets,
    ).toHaveLength(1);
    expect(
      (await bonus.history({ from: '2026-09-01', to: '2026-09-30', groupBy: 'day', limit: 500 }))
        .buckets,
    ).toHaveLength(1);
  });

  it('T-16: запізнення знижує лише критерій початку; затверджене звернення LATE відновлює бали', async () => {
    const sessionId = await fullShift(20);
    const before = await bonus.evaluate(sessionId);
    expect(before?.criteria.find((c) => c.criterion === 'SCHEDULE_START')).toMatchObject({
      status: 'missed',
      earnedPoints: 10,
    });
    expect(before?.score).toBe(Math.round((100 * 65) / 70));
    const [assignment] = await testDb.db.select().from(shiftAssignments);
    await testDb.db.insert(requests).values({
      type: 'LATE',
      employeeId: ivanov,
      status: 'APPROVED',
      assignmentId: assignment!.id,
      payload: { minutes: 20, approvedMinutes: 20 },
      submittedAt: new Date(),
    });
    const after = await bonus.evaluate(sessionId);
    expect(after?.criteria.find((c) => c.criterion === 'SCHEDULE_START')).toMatchObject({
      status: 'earned',
      earnedPoints: 15,
    });
    expect(after?.score).toBe(100);
  });

  it('7.7: зниження понад поріг чекає другого підтвердження іншою особою; менше застосовується одразу', async () => {
    const sessionId = await fullShift();
    const view = (await bonus.evaluate(sessionId))!;
    const small = await bonus.adjust(
      view.id,
      {
        criterion: 'DISCIPLINE_BREAKS',
        delta: -2,
        reasonCode: 'MASTER_REVIEW',
        comment: 'Перерыв затянулся',
      },
      MASTER,
    );
    expect(small.criteria.find((c) => c.criterion === 'DISCIPLINE_BREAKS')).toMatchObject({
      earnedPoints: 3,
      status: 'confirmed',
    });
    expect(small.score).toBe(Math.round((100 * 68) / 70));

    const big = await bonus.adjust(
      view.id,
      {
        criterion: 'DOWNTIME_PROCESS',
        delta: -15,
        reasonCode: 'MASTER_REVIEW',
        comment: 'Незарегистрированный простой',
      },
      MASTER,
    );
    expect(big.criteria.find((c) => c.criterion === 'DOWNTIME_PROCESS')?.earnedPoints).toBe(20);
    const [pending] = await testDb.db
      .select()
      .from(bonusAdjustments)
      .where(eq(bonusAdjustments.status, 'PENDING_SECOND'));
    expect(pending).toBeDefined();
    await expect(
      bonus.secondApprove(pending!.id, { decision: 'APPROVED', comment: 'ok' }, MASTER),
    ).rejects.toMatchObject({ code: 'SECOND_APPROVER_SAME' });
    const applied = await bonus.secondApprove(
      pending!.id,
      { decision: 'APPROVED', comment: 'Подтверждаю по журналу' },
      HEAD,
    );
    expect(applied.criteria.find((c) => c.criterion === 'DOWNTIME_PROCESS')?.earnedPoints).toBe(5);
    const period = await bonus.period(siteId, month);
    expect(period.pendingAdjustments).toHaveLength(0);
  });

  it('plain bonus and penalty on the score: added, edited, withdrawn; the employee is told', async () => {
    const sessionId = await fullShift();
    const view = (await bonus.evaluate(sessionId))!;
    expect(view.score).toBe(100);
    // a penalty on the score itself (no criterion), below the second-approval threshold
    const penalised = await bonus.adjust(
      view.id,
      {
        delta: -8,
        reasonCode: 'MASTER_REVIEW',
        comment: 'Оставил рабочее место без предупреждения',
      },
      MASTER,
    );
    expect(penalised.score).toBe(92);
    expect(penalised.adjustments).toHaveLength(1);
    expect(penalised.adjustments[0]).toMatchObject({
      criterion: null,
      delta: -8,
      status: 'APPLIED',
    });
    // editing the penalty recomputes the score at once while it stays below the threshold
    const penalty = penalised.adjustments[0]!;
    const edited = await bonus.updateAdjustment(
      penalty.id,
      { delta: -5, comment: 'Уточнено после разбора' },
      MASTER,
    );
    expect(edited.score).toBe(95);
    expect(edited.adjustments.find((a) => a.id === penalty.id)).toMatchObject({
      delta: -5,
      comment: 'Уточнено после разбора',
      status: 'APPLIED',
    });
    // a bonus for good use of the app
    const rewarded = await bonus.adjust(
      view.id,
      { delta: 2, reasonCode: 'MASTER_REVIEW', comment: 'Все отметки через бот, отчёт с фото' },
      MASTER,
    );
    expect(rewarded.score).toBe(97);
    const notes = await testDb.db.select().from(notificationOutbox);
    const texts = notes.filter((n) => n.template === 'BONUS_ADJUSTED').map((n) => n.payload.text);
    expect(texts.some((t) => t.includes('снято 8 баллов'))).toBe(true);
    expect(texts.some((t) => t.includes('+2 баллов'))).toBe(true);
    // withdrawing the bonus leaves the row as history
    const reward = rewarded.adjustments.find((a) => a.delta === 2)!;
    const withdrawn = await bonus.cancelAdjustment(reward.id, { reason: 'Ошибочно' }, MASTER);
    expect(withdrawn.adjustments.find((a) => a.id === reward.id)?.status).toBe('CANCELLED');
    expect(withdrawn.score).toBe(95);
    await expect(bonus.updateAdjustment(reward.id, { delta: 1 }, MASTER)).rejects.toMatchObject({
      code: 'ADJUSTMENT_DECIDED',
    });
    // a penalty edited beyond the threshold goes back to the second-approval queue
    const escalated = await bonus.updateAdjustment(penalty.id, { delta: -20 }, MASTER);
    expect(escalated.adjustments.find((a) => a.id === penalty.id)?.status).toBe('PENDING_SECOND');
    expect(escalated.score).toBe(100);
  });

  it('manual review (7.6): the master sets the score of a shift the rules cannot score, or excludes it', async () => {
    const sessionId = await fullShift();
    const view = (await bonus.evaluate(sessionId))!;
    // the rules scored this shift, so there is nothing to review
    await expect(
      bonus.review(view.id, { decision: 'SCORE', score: 50, comment: 'x' }, MASTER),
    ).rejects.toMatchObject({ code: 'REVIEW_NOT_NEEDED' });
    // a rule version that demands more applicable points than a zone-less shift can offer
    await bonus.createRuleVersion(
      {
        label: 'strict',
        validFrom: new Date(Date.now() - 24 * 3_600_000).toISOString(),
        rules: { ...DEFAULT_BONUS_RULES, minApplicablePoints: 80 },
      },
      HEAD,
    );
    const strict = (await bonus.evaluate(sessionId))!;
    expect(strict).toMatchObject({
      status: 'MANUAL_REVIEW',
      score: null,
      reviewSuggestedScore: 100,
    });
    const scored = await bonus.review(
      strict.id,
      { decision: 'SCORE', score: 90, comment: 'Смена без графика, работа выполнена' },
      MASTER,
    );
    expect(scored).toMatchObject({
      status: 'PRELIMINARY',
      score: 90,
      reviewDecision: 'SCORE',
      manualScore: 90,
    });
    // a plain bonus applies on top of the manual score
    const rewarded = await bonus.adjust(
      scored.id,
      { delta: 5, reasonCode: 'MASTER_REVIEW', comment: 'Помог сменщику' },
      MASTER,
    );
    expect(rewarded.score).toBe(95);
    const excluded = await bonus.review(
      scored.id,
      { decision: 'EXCLUDE', comment: 'Тестовая смена' },
      MASTER,
    );
    expect(excluded).toMatchObject({
      status: 'NOT_EVALUATED',
      score: null,
      reviewDecision: 'EXCLUDE',
    });
    expect(excluded.excludedReason).toContain('Тестовая смена');
    const notes = await testDb.db.select().from(notificationOutbox);
    expect(notes.filter((n) => n.template === 'BONUS_REVIEWED')).toHaveLength(2);
  });

  it('відкрита апеляція робить оцінку APPEALED; затверджена відпустка виключає зміну (T-35)', async () => {
    const sessionId = await fullShift();
    await testDb.db.insert(requests).values({
      type: 'APPEAL',
      employeeId: ivanov,
      status: 'SUBMITTED',
      shiftSessionId: sessionId,
      payload: {},
      submittedAt: new Date(),
    });
    expect((await bonus.evaluate(sessionId))?.status).toBe('APPEALED');
    await testDb.db.update(requests).set({ status: 'REJECTED' });
    await testDb.db.insert(requests).values({
      type: 'VACATION',
      employeeId: ivanov,
      status: 'APPROVED',
      periodFrom: `${month}-14`,
      periodTo: `${month}-16`,
      payload: {},
      submittedAt: new Date(),
    });
    const excluded = await bonus.evaluate(sessionId);
    expect(excluded).toMatchObject({
      status: 'NOT_EVALUATED',
      score: null,
      excludedReason: 'ABSENCE_APPROVED:VACATION',
    });
    const mine = await bonus.myScores(ivanov, month);
    expect(mine.sMonth).toBeNull();
  });

  it('закриття періоду підтверджує бали, рахує S_month, HR задає базу, експорт лише після закриття з аудитом', async () => {
    const sessionId = await fullShift();
    await bonus.evaluate(sessionId);
    await expect(bonus.exportCsv('a0000000-0000-4000-8000-000000000000', HR)).rejects.toMatchObject(
      { code: 'PERIOD_NOT_FOUND' },
    );
    const closed = await bonus.closePeriod(siteId, month, { comment: 'Месяц закрыт' }, HEAD);
    expect(closed.status).toBe('CLOSED');
    expect(closed.employees[0]).toMatchObject({
      employeeName: 'Иванов Иван',
      shifts: 1,
      evaluatedShifts: 1,
      sMonth: 100,
    });
    const [score] = await testDb.db.select().from(bonusShiftScores);
    expect(score?.status).toBe('CONFIRMED');
    const notices = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.template, 'BONUS_PERIOD_CLOSED'));
    expect(notices).toHaveLength(1);
    await expect(bonus.closePeriod(siteId, month, { comment: 'x' }, HEAD)).rejects.toMatchObject({
      code: 'PERIOD_CLOSED',
    });

    const withBase = await bonus.setBaseAmounts(
      closed.id!,
      { items: [{ employeeId: ivanov, baseAmount: 5000 }] },
      HR,
    );
    expect(withBase.employees[0]).toMatchObject({ baseAmount: 5000, bonusAmount: 5000 });
    const csv = await bonus.exportCsv(closed.id!, HR);
    expect(csv.split('\n')).toHaveLength(3);
    expect(csv).toContain('Иванов Иван;1;1;0;100;5000;5000');
    // після закриття перерахунок не переписує підтверджену оцінку
    const after = await bonus.evaluate(sessionId);
    expect(after?.status).toBe('CONFIRMED');
  });

  it('a closed period can be reopened: scores go back to PRELIMINARY, points can change, base is kept', async () => {
    const sessionId = await fullShift();
    await bonus.evaluate(sessionId);
    const closed = await bonus.closePeriod(siteId, month, { comment: 'Месяц закрыт' }, HEAD);
    await bonus.setBaseAmounts(
      closed.id!,
      { items: [{ employeeId: ivanov, baseAmount: 5000 }] },
      HR,
    );
    const [before] = await testDb.db.select().from(bonusShiftScores);
    await expect(
      bonus.adjust(before!.id, { delta: 5, reasonCode: 'MASTER_REVIEW', comment: 'late' }, HEAD),
    ).rejects.toMatchObject({ code: 'PERIOD_CLOSED' });

    const reopened = await bonus.reopenPeriod(closed.id!, { comment: 'Забыли проверку' }, HEAD);
    expect(reopened.status).toBe('OPEN');
    expect(reopened.closedAt).toBeNull();
    const [score] = await testDb.db.select().from(bonusShiftScores);
    expect(score).toMatchObject({ status: 'PRELIMINARY', confirmedBy: null, confirmedAt: null });
    await expect(bonus.reopenPeriod(closed.id!, { comment: 'again' }, HEAD)).rejects.toMatchObject({
      code: 'PERIOD_NOT_CLOSED',
    });

    const adjusted = await bonus.adjust(
      score!.id,
      { delta: -5, reasonCode: 'MASTER_REVIEW', comment: 'late' },
      HEAD,
    );
    expect(adjusted.score).toBe(95);
    const again = await bonus.closePeriod(siteId, month, { comment: 'Закрыт повторно' }, HEAD);
    expect(again.employees[0]).toMatchObject({ sMonth: 95, baseAmount: 5000, bonusAmount: 4750 });
  });

  it('версія правил: сума максимумів має дорівнювати 100; нова версія не чіпає старі періоди', async () => {
    await expect(
      bonus.createRuleVersion(
        {
          label: 'bad',
          validFrom: new Date().toISOString(),
          rules: { criteria: { SCHEDULE_START: { section: 'SCHEDULE', maxPoints: 99 } } },
        },
        HEAD,
      ),
    ).rejects.toMatchObject({ code: 'BONUS_RULES_INVALID' });
    const created = await bonus.createRuleVersion(
      { label: 'pilot-v2', validFrom: new Date(Date.now() + 86_400_000).toISOString(), rules: {} },
      HEAD,
    );
    expect(created.label).toBe('pilot-v2');
    const sessionId = await fullShift();
    const view = await bonus.evaluate(sessionId);
    expect(view?.ruleLabel).not.toBe('pilot-v2');
    expect((await bonus.listRuleVersions()).map((v) => v.label)).toContain('pilot-v2');
  });
  it('includes an eligible closed shift whose pending invalidation has no score yet', async () => {
    const sessionId = await fullShift();
    await testDb.db.delete(bonusShiftScores).where(eq(bonusShiftScores.shiftSessionId, sessionId));
    const result = await bonus.closePeriod(
      siteId,
      month,
      { comment: 'Close from a complete snapshot' },
      HEAD,
    );
    expect(result.employees).toHaveLength(1);
    expect(result.employees[0]?.scores).toMatchObject([
      { shiftSessionId: sessionId, status: 'CONFIRMED' },
    ]);
  });

  it('keeps a terminal shift without its required summary retryable', async () => {
    const sessionId = await fullShift();
    await testDb.db.delete(shiftSummaries).where(eq(shiftSummaries.shiftSessionId, sessionId));
    await expect(bonus.evaluate(sessionId)).rejects.toMatchObject({
      code: 'BONUS_SUMMARY_MISSING',
    });
  });

  it('changes the inputs hash when an existing adjustment value changes', async () => {
    const sessionId = await fullShift();
    const score = await bonus.evaluate(sessionId);
    if (!score) throw new Error('Missing score');
    const first = await bonus.adjust(
      score.id,
      { delta: -1, reasonCode: 'MASTER_REVIEW', comment: 'First adjustment' },
      MASTER,
    );
    const adjustment = first.adjustments[0];
    if (!adjustment) throw new Error('Missing adjustment');
    const [before] = await testDb.db
      .select()
      .from(bonusShiftScores)
      .where(eq(bonusShiftScores.id, score.id));
    await bonus.updateAdjustment(
      adjustment.id,
      { delta: -2, comment: 'Changed adjustment' },
      MASTER,
    );
    const [after] = await testDb.db
      .select()
      .from(bonusShiftScores)
      .where(eq(bonusShiftScores.id, score.id));
    expect(after?.inputsHash).not.toBe(before?.inputsHash);
  });

  it('freezes unassigned manual-review scores when an including period is closed', async () => {
    const sessionId = await fullShift();
    await testDb.db
      .update(shiftSessions)
      .set({ assignmentId: null, needsClarification: true })
      .where(eq(shiftSessions.id, sessionId));
    const score = await bonus.evaluate(sessionId);
    if (!score) throw new Error('Missing score');
    expect(score.status).toBe('MANUAL_REVIEW');
    await bonus.closePeriod(siteId, month, { comment: 'Freeze unresolved score' }, HEAD);
    const frozen = await bonus.score(score.id);
    await expect(
      bonus.review(score.id, { decision: 'SCORE', score: 50, comment: 'Late review' }, MASTER),
    ).rejects.toMatchObject({ code: 'PERIOD_CLOSED' });
    await testDb.db
      .update(shiftSessions)
      .set({ needsClarification: false })
      .where(eq(shiftSessions.id, sessionId));
    expect(await bonus.evaluate(sessionId)).toEqual(frozen);
  });

  it('commits score, criteria and durable completion together and recovers after an injected failure', async () => {
    const sessionId = await fullShift();
    await testDb.db.execute(sql`TRUNCATE background_tasks`);
    const [before] = await testDb.db
      .select()
      .from(bonusShiftScores)
      .where(eq(bonusShiftScores.shiftSessionId, sessionId));
    await testDb.db.transaction(async (tx) => {
      await tx
        .update(shiftSessions)
        .set({ needsClarification: true })
        .where(eq(shiftSessions.id, sessionId));
      await new EventStore().append(tx, {
        type: 'SHIFT_FLAGGED_FOR_REVIEW',
        source: 'SYSTEM',
        actor: { type: 'SYSTEM', role: 'SYSTEM', id: null },
        occurredAt: new Date('2026-01-01'),
        shiftSessionId: sessionId,
      });
    });
    await testDb.db.execute(
      sql`CREATE FUNCTION reject_computed_score() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type = 'BONUS_SCORE_COMPUTED' THEN RAISE EXCEPTION 'Injected score failure'; END IF; RETURN NEW; END $$`,
    );
    await testDb.db.execute(
      sql`CREATE TRIGGER reject_computed_score BEFORE INSERT ON domain_events FOR EACH ROW EXECUTE FUNCTION reject_computed_score()`,
    );
    try {
      expect(await dispatchBonusTasks(testDb.db, bonus)).toMatchObject({
        claimed: 1,
        retried: 1,
        completed: 0,
      });
      const [after] = await testDb.db
        .select()
        .from(bonusShiftScores)
        .where(eq(bonusShiftScores.shiftSessionId, sessionId));
      expect(after).toEqual(before);
      const [task] = await testDb.db.select().from(backgroundTasks);
      expect(task).toMatchObject({ status: 'PENDING', attempts: 1, completedAt: null });
    } finally {
      await testDb.db.execute(sql`DROP TRIGGER reject_computed_score ON domain_events`);
      await testDb.db.execute(sql`DROP FUNCTION reject_computed_score()`);
    }
    await testDb.db.execute(sql`UPDATE background_tasks SET available_at = due_at`);
    expect(await dispatchBonusTasks(testDb.db, bonus)).toMatchObject({ claimed: 1, completed: 1 });
    expect(await bonus.evaluate(sessionId)).toMatchObject({ status: 'PENDING' });
    const [task] = await testDb.db.select().from(backgroundTasks);
    expect(task).toMatchObject({ status: 'COMPLETED', attempts: 2 });
  });

  it('keeps a shared unassigned score frozen until every including closed period is reopened', async () => {
    const sessionId = await fullShift();
    await testDb.db
      .update(shiftSessions)
      .set({ assignmentId: null })
      .where(eq(shiftSessions.id, sessionId));
    const score = await bonus.evaluate(sessionId);
    if (!score) throw new Error('Missing score');
    await bonus.review(
      score.id,
      { decision: 'SCORE', score: 80, comment: 'Manual unassigned score' },
      MASTER,
    );
    const [otherSite] = await testDb.db
      .insert(sites)
      .values({ code: 'other-close', name: 'Other Site', timezone: 'Europe/Kyiv' })
      .returning();
    if (!otherSite) throw new Error('Missing other site');
    const first = await bonus.closePeriod(
      siteId,
      month,
      { comment: 'First including period' },
      HEAD,
    );
    const second = await bonus.closePeriod(
      otherSite.id,
      month,
      { comment: 'Second including period' },
      HEAD,
    );
    if (!first.id || !second.id) throw new Error('Missing periods');
    await bonus.setBaseAmounts(
      second.id,
      { items: [{ employeeId: ivanov, baseAmount: 1000 }] },
      HR,
    );
    await bonus.reopenPeriod(first.id, { comment: 'Only first period reopens' }, HEAD);
    expect(await bonus.score(score.id)).toMatchObject({ status: 'CONFIRMED', score: 80 });
    await expect(
      bonus.adjust(
        score.id,
        { delta: -5, reasonCode: 'MASTER_REVIEW', comment: 'Still frozen by another site' },
        MASTER,
      ),
    ).rejects.toMatchObject({ code: 'PERIOD_CLOSED' });
    expect((await bonus.period(otherSite.id, month)).employees[0]).toMatchObject({
      sMonth: 80,
      bonusAmount: 800,
    });
    await bonus.reopenPeriod(second.id, { comment: 'Last including period reopens' }, HEAD);
    expect(await bonus.score(score.id)).toMatchObject({ status: 'PRELIMINARY', score: 80 });
    expect(
      await bonus.adjust(
        score.id,
        { delta: -5, reasonCode: 'MASTER_REVIEW', comment: 'Both periods are open' },
        MASTER,
      ),
    ).toMatchObject({ status: 'PRELIMINARY', score: 75 });
  });

  async function waitForDatabaseLock(fragment: string): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const rows = await testDb.db.execute(
        sql`select pid from pg_stat_activity where wait_event_type = 'Lock' and query ilike ${`%${fragment}%`}`,
      );
      if (rows.length) return;
      await setImmediate();
    }
    throw new Error(`Expected blocked database statement: ${fragment}`);
  }

  it('retries the complete close after a concurrent same-month adjustment commits', async () => {
    const sessionId = await fullShift();
    const initial = await bonus.evaluate(sessionId);
    if (!initial) throw new Error('Missing score');
    const adjusted = await bonus.adjust(
      initial.id,
      { delta: -1, reasonCode: 'MASTER_REVIEW', comment: 'Original penalty' },
      MASTER,
    );
    const adjustment = adjusted.adjustments[0];
    if (!adjustment) throw new Error('Missing adjustment');
    let release = () => {};
    let signal = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      signal = resolve;
    });
    const writer = testDb.db.transaction(async (tx) => {
      await lockBonusMonthWithin(tx, month);
      await tx
        .update(bonusAdjustments)
        .set({ delta: -2 })
        .where(eq(bonusAdjustments.id, adjustment.id));
      signal();
      await held;
    });
    await ready;
    const closing = bonus.closePeriod(siteId, month, { comment: 'Waited close snapshot' }, HEAD);
    try {
      await waitForDatabaseLock('bonus_month_guards');
      release();
      await writer;
      expect((await closing).employees[0]).toMatchObject({ sMonth: 98 });
      expect(await bonus.score(initial.id)).toMatchObject({ status: 'CONFIRMED', score: 98 });
    } finally {
      release();
      await Promise.allSettled([writer, closing]);
    }
  });

  it('includes pre-snapshot approved inputs even when their durable task remains pending', async () => {
    const sessionId = await fullShift();
    const source = await testDb.db.transaction(async (tx) => {
      const [request] = await tx
        .insert(requests)
        .values({
          employeeId: ivanov,
          type: 'VACATION',
          status: 'APPROVED',
          periodFrom: `${month}-01`,
          periodTo: `${month}-28`,
        })
        .returning();
      if (!request) throw new Error('Missing request');
      return new EventStore().append(tx, {
        type: 'REQUEST_DECIDED',
        source: 'SYSTEM',
        actor: { type: 'SYSTEM', id: null, role: 'SYSTEM' },
        payload: { requestId: request.id },
      });
    });
    const result = await bonus.closePeriod(
      siteId,
      month,
      { comment: 'Read committed source directly' },
      HEAD,
    );
    expect(result.employees[0]?.scores).toMatchObject([
      {
        shiftSessionId: sessionId,
        status: 'NOT_EVALUATED',
        excludedReason: 'ABSENCE_APPROVED:VACATION',
      },
    ]);
    const [task] = await testDb.db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.sourceEventId, source.id));
    expect(task?.status).toBe('PENDING');
  });

  it('separates a post-snapshot request from the final score and preserves the saved export', async () => {
    const sessionId = await fullShift();
    let release = () => {};
    let signal = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      signal = resolve;
    });
    const holder = testDb.db.transaction(async (tx) => {
      await tx
        .select()
        .from(shiftSessions)
        .where(eq(shiftSessions.id, sessionId))
        .for('no key update');
      signal();
      await held;
    });
    await ready;
    const closing = bonus.closePeriod(siteId, month, { comment: 'Freeze one RR snapshot' }, HEAD);
    try {
      await waitForDatabaseLock('shift_sessions');
      await testDb.db.transaction(async (tx) => {
        const [request] = await tx
          .insert(requests)
          .values({
            employeeId: ivanov,
            type: 'VACATION',
            status: 'APPROVED',
            periodFrom: `${month}-01`,
            periodTo: `${month}-28`,
          })
          .returning();
        if (!request) throw new Error('Missing late request');
        await new EventStore().append(tx, {
          type: 'REQUEST_DECIDED',
          source: 'SYSTEM',
          actor: { type: 'SYSTEM', id: null, role: 'SYSTEM' },
          payload: { requestId: request.id },
        });
      });
      release();
      await holder;
      const closed = await closing;
      if (!closed.id) throw new Error('Missing period');
      expect(closed.employees[0]).toMatchObject({ sMonth: 100, evaluatedShifts: 1 });
      await dispatchBonusTasks(testDb.db, bonus, { batch: 100 });
      expect((await bonus.period(siteId, month)).employees[0]).toMatchObject({
        sMonth: 100,
        evaluatedShifts: 1,
      });
      expect(await bonus.exportCsv(closed.id, HR)).toContain(';1;1;0;100;');
    } finally {
      release();
      await Promise.allSettled([holder, closing]);
    }
  });

  it('closes and reopens through a one-connection pool without nested root queries', async () => {
    await fullShift();
    const limited = createDatabase(testDb.url, { max: 1 });
    const service = new BonusService(
      limited.db,
      new EventStore(),
      new AuditLog(),
      new NotificationsService(),
      SHIFT_OPTIONS,
      { appealWindowDays: 3 },
    );
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const operation = (async () => {
        const closed = await service.closePeriod(
          siteId,
          month,
          { comment: 'One connection close' },
          HEAD,
        );
        if (!closed.id) throw new Error('Missing closed period');
        const reopened = await service.reopenPeriod(
          closed.id,
          { comment: 'One connection reopen' },
          HEAD,
        );
        expect(reopened.status).toBe('OPEN');
      })();
      const deadline = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Nested pool query deadlock')), 3000);
      });
      await Promise.race([operation, deadline]);
    } finally {
      if (timeout) clearTimeout(timeout);
      await limited.client.end({ timeout: 1 });
    }
  });

  it('invalidates a legacy unlinked shift when its consumed fallback presence departs', async () => {
    const sessionId = await fullShift();
    const [session] = await testDb.db
      .select()
      .from(shiftSessions)
      .where(eq(shiftSessions.id, sessionId));
    if (!session?.presenceId) throw new Error('Missing linked presence fixture');
    await testDb.db
      .update(presenceSessions)
      .set({ status: 'OPEN', departedAt: null, arrivedAt: session.startedAt ?? session.createdAt })
      .where(eq(presenceSessions.id, session.presenceId));
    await testDb.db
      .update(shiftSessions)
      .set({ presenceId: null })
      .where(eq(shiftSessions.id, sessionId));
    await bonus.evaluate(sessionId);
    const [before] = await testDb.db
      .select()
      .from(bonusShiftScores)
      .where(eq(bonusShiftScores.shiftSessionId, sessionId));
    await testDb.db.execute(sql`TRUNCATE background_tasks`);
    const departure = await attendance.reserveCheckIn(
      { employeeId: ivanov, action: 'DEPART', reasonCode: 'TERMINAL_DOWN' },
      MASTER,
    );
    expect(departure.ok).toBe(true);
    const tasks = await testDb.db
      .select({ session: backgroundTasks.targetSessionId, source: domainEvents.type })
      .from(backgroundTasks)
      .innerJoin(domainEvents, eq(domainEvents.id, backgroundTasks.sourceEventId));
    expect(tasks).toEqual([{ session: sessionId, source: 'PRESENCE_DEPARTED' }]);
    expect(await dispatchBonusTasks(testDb.db, bonus)).toMatchObject({ completed: 1 });
    const [after] = await testDb.db
      .select()
      .from(bonusShiftScores)
      .where(eq(bonusShiftScores.shiftSessionId, sessionId));
    expect(after?.inputsHash).not.toBe(before?.inputsHash);
  });
});
