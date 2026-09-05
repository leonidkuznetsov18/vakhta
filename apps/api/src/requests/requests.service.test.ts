import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  activityIntervals,
  domainEvents,
  employeePositions,
  employees,
  eq,
  notificationOutbox,
  orgUnits,
  positions,
  reasonCodes,
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
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { MediaService } from '../handover/media.service.js';
import { InMemoryObjectStorage } from '../infra/object-storage.js';
import { InMemoryTimerScheduler } from '../infra/timers.queue.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { OrgService } from '../org/org.service.js';
import { ScheduleService } from '../scheduling/schedule.service.js';
import { TemplatesService } from '../scheduling/templates.service.js';
import { ShiftChanges } from '../shift/shift-changes.js';
import { ShiftService } from '../shift/shift.service.js';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { CorrectionsService } from './corrections.service.js';
import { RequestChanges } from './request-changes.js';
import { RequestsService, type Decider } from './requests.service.js';

const HEAD: Decider = {
  type: 'WEB_USER',
  id: 'a0000000-0000-4000-8000-00000000bbbb',
  role: 'PRODUCTION_HEAD',
  roles: ['PRODUCTION_HEAD'],
};
const HR: Decider = {
  type: 'WEB_USER',
  id: 'a0000000-0000-4000-8000-00000000cccc',
  role: 'HR',
  roles: ['HR'],
};
const MASTER: Decider = {
  type: 'WEB_USER',
  id: 'a0000000-0000-4000-8000-00000000aaaa',
  role: 'SHIFT_MASTER',
  roles: ['SHIFT_MASTER'],
};
let n = 0;
const key = () => `rq-${++n}`;

describe('requests: маршрути, рішення, нова версія графіка, корекції, переробка (ТЗ 8, FR-REQ, FR-COR)', () => {
  let testDb: TestDatabase;
  let service: RequestsService;
  let schedule: ScheduleService;
  let shift: ShiftService;
  let attendance: AttendanceService;
  let corrections: CorrectionsService;
  let timers: InMemoryTimerScheduler;
  let ivanov: string;
  let petrova: string;
  let siteId: string;
  let unitId: string;
  let dayTpl: string;
  let ivanovShift: string;
  let petrovaShift: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE request_decisions, requests, overtime_approvals, shift_summaries, activity_intervals, shift_sessions, idempotency_keys, notification_outbox, presence_sessions, assignment_acknowledgements, shift_assignments, schedule_versions, shift_templates, employee_positions, positions, responsibility_zones, media_objects, employees, org_units, sites, reason_codes CASCADE`,
    );
    timers = new InMemoryTimerScheduler();
    const events = new EventStore();
    const audit = new AuditLog();
    const notifications = new NotificationsService();
    const org = new OrgService(testDb.db, events, audit);
    schedule = new ScheduleService(
      testDb.db,
      events,
      audit,
      org,
      new TemplatesService(testDb.db, events, audit, org),
      notifications,
      timers,
      {
        rules: {
          minRestMinutes: 660,
          maxHoursPerMonth: 200,
          maxConsecutiveDays: 4,
          nightShare: { min: 0.3, max: 0.7, minShifts: 6 },
        },
        shiftReminderMinutes: 120,
        ackReminderHours: 24,
        defaultTimezone: 'Europe/Kyiv',
      },
    );
    attendance = new AttendanceService(testDb.db, events, audit, {
      window: DEFAULT_ATTENDANCE_WINDOW,
    });
    shift = new ShiftService(
      testDb.db,
      events,
      audit,
      notifications,
      attendance,
      new ShiftChanges(),
      timers,
      {
        breakMinutes: 15,
        mealMinutes: 30,
        serviceTimeMinutes: 30,
        downtimeEscalationMinutes: 15,
        graceMinutes: 10,
        earlyStartWindowMinutes: 30,
        overtimeThresholdMinutes: 15,
        defaultTimezone: 'Europe/Kyiv',
      },
    );
    corrections = new CorrectionsService(testDb.db, events, audit, shift);
    const media = new MediaService(
      testDb.db,
      audit,
      timers,
      { linkTtlSeconds: 300 },
      new InMemoryObjectStorage(),
    );
    service = new RequestsService(
      testDb.db,
      events,
      audit,
      notifications,
      schedule,
      media,
      corrections,
      new RequestChanges(),
    );

    const [site] = await testDb.db
      .insert(sites)
      .values({ code: 'main', name: 'Основная', timezone: 'Europe/Kyiv' })
      .returning();
    siteId = site!.id;
    const [unit] = await testDb.db.insert(orgUnits).values({ siteId, name: 'Цех' }).returning();
    unitId = unit!.id;
    await testDb.db
      .insert(reasonCodes)
      .values([{ kind: 'CORRECTION', code: 'FORGOT_BUTTON', label: 'Забыл нажать кнопку' }]);
    const [tpl] = await testDb.db
      .insert(shiftTemplates)
      .values({ siteId, code: 'DAY', name: 'Дневная', localStart: '08:00', localEnd: '20:00' })
      .returning();
    dayTpl = tpl!.id;
    const [pos] = await testDb.db
      .insert(positions)
      .values({ code: 'OPERATOR', name: 'Оператор' })
      .returning();
    const people = await testDb.db
      .insert(employees)
      .values([
        { personnelNumber: '1', fullName: 'Иванов Иван' },
        { personnelNumber: '2', fullName: 'Петрова Ольга' },
      ])
      .returning();
    ivanov = people[0]!.id;
    petrova = people[1]!.id;
    await testDb.db.insert(employeePositions).values([
      {
        employeeId: ivanov,
        orgUnitId: unitId,
        positionId: pos!.id,
        validFrom: new Date(Date.now() - 86_400_000),
      },
      {
        employeeId: petrova,
        orgUnitId: unitId,
        positionId: pos!.id,
        validFrom: new Date(Date.now() - 86_400_000),
      },
    ]);
    // опублікований графік наступного місяця: Іванов 5-го і 7-го, Петрова 9-го
    const next = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1));
    const month = next.toISOString().slice(0, 7);
    const draft = await schedule.createVersion(
      { siteId, orgUnitId: unitId, periodMonth: month },
      HEAD,
    );
    await schedule.putAssignments(
      draft.id,
      {
        items: [
          { employeeId: ivanov, templateId: dayTpl, businessDate: `${month}-05`, kind: 'REGULAR' },
          { employeeId: ivanov, templateId: dayTpl, businessDate: `${month}-07`, kind: 'REGULAR' },
          { employeeId: petrova, templateId: dayTpl, businessDate: `${month}-09`, kind: 'REGULAR' },
        ],
      },
      HEAD,
    );
    await schedule.submit(draft.id, HEAD);
    await schedule.publish(draft.id, {}, HEAD);
    const published = await testDb.db.select().from(shiftAssignments);
    ivanovShift = published.find(
      (a) => a.employeeId === ivanov && a.businessDate.endsWith('-05'),
    )!.id;
    petrovaShift = published.find((a) => a.employeeId === petrova)!.id;
  });

  function month(): string {
    const next = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1));
    return next.toISOString().slice(0, 7);
  }

  it('відпустка: керівник → HR; схвалення створює нову опубліковану версію без змін періоду (FR-REQ-04, T-35)', async () => {
    const created = await service.create(
      ivanov,
      {
        type: 'VACATION',
        periodFrom: `${month()}-04`,
        periodTo: `${month()}-06`,
        comment: 'Семейные обстоятельства',
        idempotencyKey: key(),
      },
      employeeActor(ivanov),
    );
    expect(created).toMatchObject({
      status: 'SUBMITTED',
      currentStepKey: 'HEAD',
      totalSteps: 2,
      overdue: false,
    });
    await expect(
      service.decide(created.id, { decision: 'APPROVED', comment: 'ok' }, HR),
    ).rejects.toMatchObject({ code: 'REQUEST_NOT_YOUR_STEP' });
    const afterHead = await service.decide(
      created.id,
      { decision: 'APPROVED', comment: 'Не возражаю' },
      HEAD,
    );
    expect(afterHead).toMatchObject({ status: 'IN_REVIEW', currentStepKey: 'HR' });
    const approved = await service.decide(
      created.id,
      { decision: 'APPROVED', comment: 'Оформлено приказом' },
      HR,
    );
    expect(approved.status).toBe('APPROVED');
    expect(approved.resultVersionId).not.toBeNull();

    const versions = await testDb.db
      .select()
      .from(scheduleVersions)
      .orderBy(scheduleVersions.versionNo);
    expect(versions.map((v) => v.status)).toEqual(['SUPERSEDED', 'PUBLISHED']);
    const planned = await testDb.db
      .select()
      .from(shiftAssignments)
      .where(eq(shiftAssignments.scheduleVersionId, versions[1]!.id));
    expect(planned.filter((a) => a.employeeId === ivanov).map((a) => a.businessDate)).toEqual([
      `${month()}-07`,
    ]);
    const notices = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.template, 'REQUEST_DECIDED'));
    expect(notices).toHaveLength(1);
    const detail = await service.detail(created.id, HR);
    expect(detail.decisions.map((d) => d.stepKey)).toEqual(['HEAD', 'HR']);
  });

  it('обмін змінами: згода другого працівника, потім майстер і керівник; версія міняє працівників місцями', async () => {
    const created = await service.create(
      ivanov,
      {
        type: 'SWAP',
        assignmentId: ivanovShift,
        counterpartEmployeeId: petrova,
        counterpartAssignmentId: petrovaShift,
        comment: 'Поменяемся',
        idempotencyKey: key(),
      },
      employeeActor(ivanov),
    );
    expect(created.currentStepKey).toBe('COUNTERPART');
    const asked = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.template, 'REQUEST_COUNTERPART'));
    expect(asked[0]?.recipientId).toBe(petrova);
    expect(asked[0]?.payload.buttons?.[0]?.map((b) => b.callbackData)).toEqual([
      `rq:ok:${created.id}`,
      `rq:no:${created.id}`,
    ]);
    expect(await service.pendingCounterpart(petrova)).toHaveLength(1);

    await expect(
      service.decide(created.id, { decision: 'APPROVED', comment: 'ok' }, MASTER),
    ).rejects.toMatchObject({ code: 'REQUEST_NOT_YOUR_STEP' });
    const counterpart: Decider = { ...employeeActor(petrova), roles: [], employeeId: petrova };
    await service.decide(created.id, { decision: 'APPROVED', comment: 'Согласна' }, counterpart);
    await service.decide(created.id, { decision: 'APPROVED', comment: 'Не против' }, MASTER);
    const done = await service.decide(
      created.id,
      { decision: 'APPROVED', comment: 'Утверждаю' },
      HEAD,
    );
    expect(done.status).toBe('APPROVED');
    const [published] = await testDb.db
      .select()
      .from(scheduleVersions)
      .where(eq(scheduleVersions.status, 'PUBLISHED'));
    const planned = await testDb.db
      .select()
      .from(shiftAssignments)
      .where(eq(shiftAssignments.scheduleVersionId, published!.id));
    expect(planned.find((a) => a.businessDate.endsWith('-05'))?.employeeId).toBe(petrova);
    expect(planned.find((a) => a.businessDate.endsWith('-09'))?.employeeId).toBe(ivanov);
  });

  it('відмова закриває звернення з коментарем; ідемпотентність створення; скасування працівником', async () => {
    const k = key();
    const a = await service.create(
      ivanov,
      {
        type: 'LATE',
        assignmentId: ivanovShift,
        minutes: 20,
        comment: 'Пробки',
        idempotencyKey: k,
      },
      employeeActor(ivanov),
    );
    const b = await service.create(
      ivanov,
      {
        type: 'LATE',
        assignmentId: ivanovShift,
        minutes: 20,
        comment: 'Пробки',
        idempotencyKey: k,
      },
      employeeActor(ivanov),
    );
    expect(b.id).toBe(a.id);
    const rejected = await service.decide(
      a.id,
      { decision: 'REJECTED', comment: 'Найдите замену' },
      MASTER,
    );
    expect(rejected).toMatchObject({ status: 'REJECTED', minutes: 20 });
    await expect(
      service.decide(a.id, { decision: 'APPROVED', comment: 'x' }, MASTER),
    ).rejects.toMatchObject({ code: 'REQUEST_CLOSED' });

    const c = await service.create(
      ivanov,
      { type: 'TECH_ISSUE', comment: 'Не приходят уведомления', idempotencyKey: key() },
      employeeActor(ivanov),
    );
    const cancelled = await service.cancel(ivanov, c.id, employeeActor(ivanov));
    expect(cancelled.status).toBe('CANCELLED');
    expect((await service.mine(ivanov)).map((r) => r.status).sort()).toEqual([
      'CANCELLED',
      'REJECTED',
    ]);
  });

  it('LATE зі схваленими хвилинами зберігає допустиме відхилення (ТЗ 7.3); вхідні фільтруються за роллю', async () => {
    const late = await service.create(
      ivanov,
      {
        type: 'LATE',
        assignmentId: ivanovShift,
        minutes: 25,
        comment: 'Врач',
        idempotencyKey: key(),
      },
      employeeActor(ivanov),
    );
    const sick = await service.create(
      petrova,
      {
        type: 'SICK',
        periodFrom: `${month()}-09`,
        periodTo: `${month()}-10`,
        medicalPhoto: { telegramFileId: 'mf', telegramFileUniqueId: 'mu' },
        idempotencyKey: key(),
      },
      employeeActor(petrova),
    );
    expect(sick.hasMedicalDocument).toBe(true);
    expect((await service.list({ scope: 'inbox' }, MASTER)).map((r) => r.id)).toEqual([late.id]);
    expect((await service.list({ scope: 'inbox' }, HR)).map((r) => r.id)).toEqual([sick.id]);
    const masterView = (await service.list({ scope: 'all' }, MASTER)).find((r) => r.id === sick.id);
    expect(masterView?.medicalMediaId).toBeNull();
    const hrView = (await service.list({ scope: 'all' }, HR)).find((r) => r.id === sick.id);
    expect(hrView?.medicalMediaId).not.toBeNull();
    await expect(service.medicalLink(sick.id, MASTER)).rejects.toMatchObject({
      code: 'MEDICAL_FORBIDDEN',
    });

    const decided = await service.decide(
      late.id,
      { decision: 'APPROVED', comment: 'Подтверждено', approvedMinutes: 25 },
      MASTER,
    );
    expect(decided).toMatchObject({ status: 'APPROVED', approvedMinutes: 25 });
  });

  it('корекція: схвалення майстром створює компенсуючу подію, перераховує підсумок і знімає «потрібна перевірка» (T-38, T-39)', async () => {
    // зміна вчора: відкрита майстром, працював, забув закрити
    const started = await shift.masterStart(
      ivanov,
      { idempotencyKey: key(), comment: 'Телефон разряжен' },
      MASTER,
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const sessionId = started.session.id;
    const work = await shift.masterTransition(
      sessionId,
      {
        action: 'START_WORK',
        expectedVersion: started.session.version,
        idempotencyKey: key(),
        comment: 'x',
      },
      MASTER,
    );
    expect(work.ok).toBe(true);
    await shift.flagClarification(sessionId, 'Не закрыл смену', MASTER);
    const startedAt = new Date(Date.now() - 13 * 3_600_000);
    await testDb.db.update(shiftSessions).set({ startedAt }).where(eq(shiftSessions.id, sessionId));
    const rows = await testDb.db
      .select()
      .from(activityIntervals)
      .where(eq(activityIntervals.shiftSessionId, sessionId))
      .orderBy(activityIntervals.startedAt);
    await testDb.db
      .update(activityIntervals)
      .set({ startedAt, endedAt: new Date(startedAt.getTime() + 10 * 60_000) })
      .where(eq(activityIntervals.id, rows[0]!.id));
    await testDb.db
      .update(activityIntervals)
      .set({ startedAt: new Date(startedAt.getTime() + 10 * 60_000) })
      .where(eq(activityIntervals.id, rows[1]!.id));

    const request = await service.create(
      ivanov,
      {
        type: 'CORRECTION',
        shiftSessionId: sessionId,
        reasonCode: 'FORGOT_BUTTON',
        comment: 'Ушёл в 20:05, кнопку не нажал',
        idempotencyKey: key(),
      },
      employeeActor(ivanov),
    );
    const endedAt = new Date(startedAt.getTime() + 12 * 3_600_000 + 5 * 60_000);
    await expect(
      service.decide(request.id, { decision: 'APPROVED', comment: 'Подтверждаю' }, MASTER),
    ).rejects.toMatchObject({ code: 'CORRECTION_PROPOSAL_REQUIRED' });
    const decided = await service.decide(
      request.id,
      {
        decision: 'APPROVED',
        comment: 'Подтверждаю по камерам',
        proposal: { kind: 'CLOSE_SHIFT_AT', endedAt: endedAt.toISOString() },
      },
      MASTER,
    );
    expect(decided.status).toBe('APPROVED');
    const [session] = await testDb.db
      .select()
      .from(shiftSessions)
      .where(eq(shiftSessions.id, sessionId));
    expect(session).toMatchObject({ state: 'SHIFT_CLOSED', needsClarification: false });
    expect(session?.endedAt?.getTime()).toBe(endedAt.getTime());
    const [summary] = await testDb.db
      .select()
      .from(shiftSummaries)
      .where(eq(shiftSummaries.shiftSessionId, sessionId));
    expect(summary?.totalMinutes).toBe(12 * 60 + 5);
    const events = await testDb.db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.shiftSessionId, sessionId));
    const corrected = events.find((e) => e.type === 'SHIFT_CORRECTED');
    expect(corrected?.correctsEventId).not.toBeNull();
    expect(corrected?.reasonCode).toBe('FORGOT_BUTTON');
    const invalid = corrections.apply(
      sessionId,
      {
        proposal: {
          kind: 'MOVE_BOUNDARY',
          intervalId: rows[1]!.id,
          newStartedAt: new Date(startedAt.getTime() - 3_600_000).toISOString(),
        },
        reasonCode: 'FORGOT_BUTTON',
        comment: 'x',
      },
      MASTER,
    );
    await expect(invalid).rejects.toBeInstanceOf(DomainError);
  });

  it('переробка: очікує рішення керівника, після рішення зникає з черги (FR-TIME-06, AC-14)', async () => {
    const started = await shift.masterStart(
      petrova,
      { idempotencyKey: key(), comment: 'резерв' },
      MASTER,
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const startedAt = new Date(Date.now() - 14 * 3_600_000);
    await testDb.db
      .update(shiftSessions)
      .set({ startedAt })
      .where(eq(shiftSessions.id, started.session.id));
    await testDb.db
      .update(activityIntervals)
      .set({ startedAt })
      .where(eq(activityIntervals.shiftSessionId, started.session.id));
    const decidedCorrection = await corrections.apply(
      started.session.id,
      {
        proposal: {
          kind: 'CLOSE_SHIFT_AT',
          endedAt: new Date(startedAt.getTime() + 13 * 3_600_000).toISOString(),
        },
        reasonCode: 'FORGOT_BUTTON',
        comment: 'закрыто мастером',
      },
      MASTER,
    );
    expect(decidedCorrection.changes).toHaveLength(1);
    const [summary] = await testDb.db
      .select()
      .from(shiftSummaries)
      .where(eq(shiftSummaries.shiftSessionId, started.session.id));
    expect(summary?.overtimePending).toBe(false);
    // без плану переробка не рахується; змоделюємо факт понад план вручну
    await testDb.db
      .update(shiftSummaries)
      .set({ overtimePending: true, overtimeMinutes: 60 })
      .where(eq(shiftSummaries.shiftSessionId, started.session.id));
    const pending = await service.overtime('pending');
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      employeeName: 'Петрова Ольга',
      minutes: 60,
      status: 'PENDING',
    });
    const approved = await service.decideOvertime(
      started.session.id,
      { decision: 'APPROVED', comment: 'Замена заболевшего' },
      HEAD,
    );
    expect(approved.status).toBe('APPROVED');
    expect(await service.overtime('pending')).toHaveLength(0);
    await expect(
      service.decideOvertime(started.session.id, { decision: 'REJECTED', comment: 'x' }, HEAD),
    ).rejects.toMatchObject({ code: 'OVERTIME_ALREADY_DECIDED' });
  });
});
