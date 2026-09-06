import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  activityIntervals,
  bonusAdjustments,
  bonusShiftScores,
  employees,
  eq,
  notificationOutbox,
  orgUnits,
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
import { AttendanceService } from '../attendance/attendance.service.js';
import { employeeActor } from '../common/actor.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { HandoverChanges } from '../handover/handover-changes.js';
import { IncidentChanges } from '../incidents/incident-changes.js';
import { InMemoryTimerScheduler } from '../infra/timers.queue.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RequestChanges } from '../requests/request-changes.js';
import { ShiftChanges } from '../shift/shift-changes.js';
import { ShiftService, type ShiftOptions } from '../shift/shift.service.js';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
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
    await testDb.db.execute(
      sql`TRUNCATE bonus_period_results, bonus_periods, bonus_adjustments, bonus_criteria_results, bonus_shift_scores, bonus_rule_versions, request_decisions, requests, shift_summaries, activity_intervals, shift_sessions, idempotency_keys, notification_outbox, presence_sessions, shift_assignments, schedule_versions, shift_templates, employees, org_units, sites, reason_codes CASCADE`,
    );
    const events = new EventStore();
    const audit = new AuditLog();
    const notifications = new NotificationsService();
    const timers = new InMemoryTimerScheduler();
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
    bonus = new BonusService(
      testDb.db,
      events,
      audit,
      notifications,
      shiftChanges,
      new HandoverChanges(),
      new IncidentChanges(),
      new RequestChanges(),
      SHIFT_OPTIONS,
      { appealWindowDays: 3 },
    );
    bonus.onModuleInit();

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
      // The checklist report is mandatory for every shift (spec 5.6); these tests score the
      // shift, not the report, so the handover step goes through the master override.
      const r = await shift.transition(
        ivanov,
        { action, expectedVersion: current!.version, idempotencyKey: key() },
        action === 'SUBMIT_HANDOVER'
          ? { actor: MASTER, source: 'WEB', masterOverride: true }
          : { actor: employeeActor(ivanov), source: 'TELEGRAM' },
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
    return sessionId;
  }

  it('закриття зміни через шину подій оцінює її: без зони максимум 70 застосовних балів, S = 100 (7.6)', async () => {
    const sessionId = await fullShift();
    await new Promise((r) => setTimeout(r, 50));
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
});
