import { afterEach, vi, afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assignmentBreaks,
  backgroundTasks,
  activityIntervals,
  bonusRuleVersions,
  bonusShiftScores,
  domainEvents,
  employeePositions,
  employees,
  and,
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
import { ShiftKindSchema } from '@vakhta/contracts';
import {
  AppealError,
  DEFAULT_ATTENDANCE_WINDOW,
  DEFAULT_BONUS_RULES,
  ShiftPeriod,
  ShiftTemplateError,
} from '@vakhta/domain';
import { AttendanceService } from '../attendance/attendance.service.js';
import { employeeActor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { MediaService } from '../handover/media.service.js';
import { InMemoryObjectStorage } from '../infra/object-storage.js';
import { TimerScheduler } from '../infra/timers.queue.js';
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
  let timers: TimerScheduler;
  let ivanov: string;
  let petrova: string;
  let siteId: string;
  let unitId: string;
  let dayTpl: string;
  let ivanovShift: string;
  let petrovaShift: string;

  async function timerJobs() {
    const rows = await testDb.db.select().from(backgroundTasks);
    return rows
      .filter((row) => row.kind !== 'MEDIA_PROCESS' && row.kind !== 'BONUS_RECALCULATE')
      .map((row) => ({ jobId: row.dedupeKey, fireAt: row.dueAt }));
  }

  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE request_decisions, requests, overtime_approvals, shift_summaries, activity_intervals, shift_sessions, idempotency_keys, notification_outbox, presence_sessions, assignment_acknowledgements, shift_assignments, schedule_versions, shift_templates, employee_positions, positions, responsibility_zones, media_objects, employees, org_units, sites, reason_codes CASCADE`,
    );
    timers = new TimerScheduler();
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
        shiftReminderMinutes: 120,
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
      { appealWindowDays: 3 },
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
      .values({
        siteId,
        code: 'DAY',
        name: 'Дневная',
        localStart: '08:00',
        period: ShiftPeriod.DAY,
        localEnd: '20:00',
      })
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
          // Custom hours and a planned break: a request approval must carry them into the new version.
          {
            employeeId: petrova,
            templateId: dayTpl,
            businessDate: `${month}-09`,
            kind: 'REGULAR',
            customStart: '09:00',
            customEnd: '19:00',
            breaks: [{ localStart: '13:00', localEnd: '13:30', reliefEmployeeId: null }],
          },
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
    // The rest of the month is carried over whole, not rebuilt from template hours.
    const untouched = planned.find((a) => a.employeeId === petrova);
    if (!untouched) throw new Error('Petrova lost her shift');
    expect(untouched).toMatchObject({ customStart: '09:00', customEnd: '19:00' });
    const breaks = await testDb.db
      .select()
      .from(assignmentBreaks)
      .where(eq(assignmentBreaks.assignmentId, untouched.id));
    expect(breaks).toMatchObject([{ localStart: '13:00', localEnd: '13:30' }]);
    const notices = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.template, 'REQUEST_DECIDED'));
    expect(notices).toHaveLength(1);
    const detail = await service.detail(created.id, HR);
    expect(detail.decisions.map((d) => d.stepKey)).toEqual(['HEAD', 'HR']);
  });

  it('offers an extra shift only from the site defaults and the employee’s own unit', async () => {
    const [otherUnit] = await testDb.db
      .insert(orgUnits)
      .values({ siteId, name: 'Склад' })
      .returning();
    if (!otherUnit) throw new Error('unit missing');
    const [own, foreign] = await testDb.db
      .insert(shiftTemplates)
      .values([
        {
          siteId,
          orgUnitId: unitId,
          code: 'U_OWN',
          name: '',
          localStart: '05:00',
          localEnd: '13:00',
          period: ShiftPeriod.DAY,
        },
        {
          siteId,
          orgUnitId: otherUnit.id,
          code: 'U_FOREIGN',
          name: 'Приймання',
          localStart: '06:00',
          localEnd: '14:00',
          period: ShiftPeriod.DAY,
        },
      ])
      .returning();
    if (!own || !foreign) throw new Error('templates missing');
    expect(await service.templatesFor(ivanov)).toEqual(
      expect.arrayContaining([
        { id: dayTpl, label: 'Дневная · 08:00–20:00' },
        { id: own.id, label: '05:00–13:00' },
      ]),
    );
    expect((await service.templatesFor(ivanov)).some((t) => t.id === foreign.id)).toBe(false);
    await expect(
      service.create(
        ivanov,
        {
          type: 'EXTRA_SHIFT',
          businessDate: `${month()}-10`,
          templateId: foreign.id,
          comment: 'Потрібна допомога на складі',
          idempotencyKey: key(),
        },
        employeeActor(ivanov),
      ),
    ).rejects.toMatchObject({ code: ShiftTemplateError.OUT_OF_UNIT });
  });

  it('plans an approved extra shift on the current version of an edited shift', async () => {
    const [requested, current] = await testDb.db
      .insert(shiftTemplates)
      .values([
        {
          siteId,
          orgUnitId: unitId,
          code: 'U_OLD',
          name: 'Ранкова',
          localStart: '05:00',
          localEnd: '13:00',
          period: ShiftPeriod.DAY,
        },
        {
          siteId,
          orgUnitId: unitId,
          code: 'U_NEW',
          name: 'Рання',
          localStart: '06:00',
          localEnd: '14:00',
          period: ShiftPeriod.DAY,
        },
      ])
      .returning();
    if (!requested || !current) throw new Error('templates missing');
    const created = await service.create(
      ivanov,
      {
        type: 'EXTRA_SHIFT',
        businessDate: `${month()}-10`,
        templateId: requested.id,
        comment: 'Можу вийти',
        idempotencyKey: key(),
      },
      employeeActor(ivanov),
    );
    // The administrator edits the hours before the request is decided.
    await testDb.db
      .update(shiftTemplates)
      .set({ isActive: false, retiredAt: new Date(), replacedById: current.id })
      .where(eq(shiftTemplates.id, requested.id));
    await service.decide(created.id, { decision: 'APPROVED', comment: 'Так' }, HEAD);
    const [extra] = await testDb.db
      .select({ templateId: shiftAssignments.templateId })
      .from(shiftAssignments)
      .where(
        and(
          eq(shiftAssignments.employeeId, ivanov),
          eq(shiftAssignments.businessDate, `${month()}-10`),
          eq(shiftAssignments.kind, ShiftKindSchema.enum.EXTRA),
        ),
      );
    expect(extra?.templateId).toBe(current.id);
  });

  it('rolls back all schedule months when the final request decision fails after publication', async () => {
    const nextMonth = new Date(`${month()}-01T00:00:00Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const secondMonth = nextMonth.toISOString().slice(0, 7);
    const second = await schedule.createVersion(
      { siteId, orgUnitId: unitId, periodMonth: secondMonth },
      HEAD,
    );
    await schedule.putAssignments(
      second.id,
      {
        items: [
          {
            employeeId: ivanov,
            templateId: dayTpl,
            businessDate: `${secondMonth}-05`,
            kind: 'REGULAR',
          },
          {
            employeeId: petrova,
            templateId: dayTpl,
            businessDate: `${secondMonth}-07`,
            kind: 'REGULAR',
          },
        ],
      },
      HEAD,
    );
    await schedule.submit(second.id, HEAD);
    await schedule.publish(second.id, {}, HEAD);
    const created = await service.create(
      ivanov,
      {
        type: 'VACATION',
        periodFrom: `${month()}-04`,
        periodTo: `${secondMonth}-06`,
        comment: 'Leave across two months',
        idempotencyKey: key(),
      },
      employeeActor(ivanov),
    );
    await service.decide(created.id, { decision: 'APPROVED', comment: 'Approved by head' }, HEAD);
    const beforeVersions = await testDb.db
      .select()
      .from(scheduleVersions)
      .orderBy(scheduleVersions.id);
    const beforeAssignments = await testDb.db
      .select()
      .from(shiftAssignments)
      .orderBy(shiftAssignments.id);
    const beforeTimers = [...(await timerJobs())];
    const append = EventStore.prototype.append;
    const fault = vi.spyOn(EventStore.prototype, 'append').mockImplementation(async function (
      this: EventStore,
      tx,
      input,
    ) {
      if (input.type === 'REQUEST_DECIDED') throw new Error('Injected decision failure');
      return append.call(this, tx, input);
    });

    await expect(
      service.decide(created.id, { decision: 'APPROVED', comment: 'Final approval' }, HR),
    ).rejects.toThrow('Injected decision failure');

    expect
      .soft(await testDb.db.select().from(scheduleVersions).orderBy(scheduleVersions.id))
      .toEqual(beforeVersions);
    expect
      .soft(await testDb.db.select().from(shiftAssignments).orderBy(shiftAssignments.id))
      .toEqual(beforeAssignments);
    expect.soft(await timerJobs()).toEqual(beforeTimers);
    const detail = await service.detail(created.id, HR);
    expect.soft(detail.request.status).toBe('IN_REVIEW');
    expect.soft(detail.decisions).toHaveLength(1);
    fault.mockRestore();
    expect(
      await service.decide(created.id, { decision: 'APPROVED', comment: 'Retry approval' }, HR),
    ).toMatchObject({ status: 'APPROVED' });
  });

  it('approves leave that removes the last assignment from a published month', async () => {
    await testDb.db.delete(shiftAssignments).where(sql`${shiftAssignments.id} <> ${ivanovShift}`);
    const created = await service.create(
      ivanov,
      {
        type: 'VACATION',
        periodFrom: `${month()}-04`,
        periodTo: `${month()}-06`,
        comment: 'Last scheduled employee is on leave',
        idempotencyKey: key(),
      },
      employeeActor(ivanov),
    );
    await service.decide(created.id, { decision: 'APPROVED', comment: 'Approved by head' }, HEAD);
    const result = await service.decide(
      created.id,
      { decision: 'APPROVED', comment: 'Final approval' },
      HR,
    );
    expect(result.status).toBe('APPROVED');
    if (!result.resultVersionId) throw new Error('Expected a published replacement');
    expect(
      await testDb.db
        .select()
        .from(shiftAssignments)
        .where(eq(shiftAssignments.scheduleVersionId, result.resultVersionId)),
    ).toEqual([]);
    expect(
      await testDb.db
        .select()
        .from(scheduleVersions)
        .where(eq(scheduleVersions.id, result.resultVersionId)),
    ).toEqual([expect.objectContaining({ status: 'PUBLISHED' })]);
  });

  it('a swap counterpart must be one the bot offers: another active employee of the unit', async () => {
    const published = await testDb.db.select().from(shiftAssignments);
    const ivanovOther = published.find(
      (a) => a.employeeId === ivanov && a.businessDate.endsWith('-07'),
    );
    if (!ivanovOther) throw new Error('Missing fixture shift');
    const swap = (counterpartEmployeeId: string, counterpartAssignmentId: string) =>
      service.create(
        ivanov,
        {
          type: 'SWAP',
          assignmentId: ivanovShift,
          counterpartEmployeeId,
          counterpartAssignmentId,
          comment: 'Поменяемся',
          idempotencyKey: key(),
        },
        employeeActor(ivanov),
      );
    const refused = { code: 'SWAP_COUNTERPART_NOT_ALLOWED' };
    // Crafted callbacks: the requester himself, a blocked colleague, a colleague of another unit.
    await expect(swap(ivanov, ivanovOther.id)).rejects.toMatchObject(refused);
    await testDb.db.update(employees).set({ status: 'BLOCKED' }).where(eq(employees.id, petrova));
    await expect(swap(petrova, petrovaShift)).rejects.toMatchObject(refused);
    await testDb.db.update(employees).set({ status: 'ACTIVE' }).where(eq(employees.id, petrova));
    const [otherUnit] = await testDb.db
      .insert(orgUnits)
      .values({ siteId, name: 'Склад' })
      .returning();
    if (!otherUnit) throw new Error('Missing unit');
    await testDb.db
      .update(shiftAssignments)
      .set({ orgUnitId: otherUnit.id })
      .where(eq(shiftAssignments.id, petrovaShift));
    await expect(swap(petrova, petrovaShift)).rejects.toMatchObject(refused);
    // Candidates are listed only for the requester's own shift.
    expect(await service.swapCandidates(petrova, ivanovShift)).toEqual([]);
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

  it('keeps the entire role-filtered inbox when other roles have more than 500 newer requests', async () => {
    const older = new Date('2026-09-01T08:00:00Z');
    const newer = new Date('2026-09-02T08:00:00Z');
    const [late] = await testDb.db
      .insert(requests)
      .values({
        type: 'LATE',
        employeeId: ivanov,
        submittedAt: older,
      })
      .returning({ id: requests.id });
    await testDb.db.insert(requests).values(
      Array.from({ length: 501 }, () => ({
        type: 'SICK' as const,
        employeeId: petrova,
        submittedAt: newer,
      })),
    );
    expect((await service.list({ scope: 'inbox' }, MASTER)).map((r) => r.id)).toEqual([late!.id]);
    expect(await service.list({ scope: 'inbox' }, HR)).toHaveLength(501);
    expect(await service.list({ scope: 'all' }, HR)).toHaveLength(500);
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

  it('spec 7.7: an appeal needs an appealable score of the own shift and no open appeal', async () => {
    const started = await shift.masterStart(
      ivanov,
      { idempotencyKey: key(), comment: 'Телефон разряжен' },
      MASTER,
    );
    if (!started.ok) throw new Error('Expected the fixture shift to start');
    const shiftSessionId = started.session.id;
    const appeal = (employeeId: string, extra: { scoreId?: string } = {}) =>
      service.create(
        employeeId,
        { type: 'APPEAL', shiftSessionId, comment: 'Не согласен', idempotencyKey: key(), ...extra },
        employeeActor(employeeId),
      );
    // A crafted bn:ap:<id> callback arrives before the shift has a score.
    await expect(appeal(ivanov)).rejects.toMatchObject({ code: AppealError.NOT_ALLOWED });

    const [rule] = await testDb.db
      .insert(bonusRuleVersions)
      .values({ label: 'v1', validFrom: new Date(0), rules: DEFAULT_BONUS_RULES })
      .returning();
    if (!rule) throw new Error('Missing rule version');
    const [score] = await testDb.db
      .insert(bonusShiftScores)
      .values({
        shiftSessionId,
        employeeId: ivanov,
        businessDate: started.session.businessDate,
        ruleVersionId: rule.id,
        applicableMax: 100,
        earned: 80,
        score: 80,
        inputsHash: 'h',
      })
      .returning();
    if (!score) throw new Error('Missing score');

    await expect(appeal(petrova)).rejects.toMatchObject({ code: 'SHIFT_NOT_FOUND' });
    await expect(
      appeal(ivanov, { scoreId: '00000000-0000-4000-8000-000000000000' }),
    ).rejects.toMatchObject({ code: AppealError.NOT_ALLOWED });

    const created = await appeal(ivanov);
    const [stored] = await testDb.db.select().from(requests).where(eq(requests.id, created.id));
    expect(stored?.payload).toEqual({ scoreId: score.id });
    await expect(appeal(ivanov)).rejects.toMatchObject({ code: AppealError.ALREADY_OPEN });

    // Once the first appeal is decided, the window still bounds a new one.
    await testDb.db.update(requests).set({ status: 'REJECTED' }).where(eq(requests.id, created.id));
    await testDb.db
      .update(bonusShiftScores)
      .set({ computedAt: new Date(Date.now() - 30 * 86_400_000) })
      .where(eq(bonusShiftScores.id, score.id));
    await expect(appeal(ivanov)).rejects.toMatchObject({ code: AppealError.NOT_ALLOWED });
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
      .set({
        startedAt,
        planStartAt: startedAt,
        planEndAt: new Date(startedAt.getTime() + 12 * 3_600_000),
      })
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
    expect(summary).toMatchObject({ overtimePending: true, overtimeMinutes: 60 });
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
