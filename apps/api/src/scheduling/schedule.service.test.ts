import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, notificationOutbox, scheduleVersions, sql, telegramAccounts } from '@vakhta/db';
import { DEFAULT_SCHEDULE_RULES, addMonths, businessDateOf } from '@vakhta/domain';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { EmployeesService } from '../identity/employees.service.js';
import { InMemoryTimerScheduler } from '../infra/timers.queue.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { OrgService } from '../org/org.service.js';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { ScheduleService } from './schedule.service.js';
import { TemplatesService } from './templates.service.js';

const PLANNER = { type: 'WEB_USER', id: null, role: 'PLANNER', label: 'planner' } as const;
const HEAD = { type: 'WEB_USER', id: null, role: 'PRODUCTION_HEAD', label: 'head' } as const;

/** Наступний місяць: нагадування ставляться лише на майбутні зміни. */
const MONTH = addMonths(businessDateOf(new Date(), 'Europe/Kyiv').slice(0, 7), 1);
const day = (n: number) => `${MONTH}-${String(n).padStart(2, '0')}`;

describe('scheduling: версії, валідація, публікація, ознайомлення (ТЗ 3)', () => {
  let testDb: TestDatabase;
  let org: OrgService;
  let templates: TemplatesService;
  let employeesService: EmployeesService;
  let timers: InMemoryTimerScheduler;
  let schedule: ScheduleService;

  let siteId: string;
  let unitId: string;
  let otherUnitId: string;
  let zoneId: string;
  let dayId: string;
  let nightId: string;
  let ivanov: string;
  let petrova: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const events = new EventStore();
    const audit = new AuditLog();
    org = new OrgService(testDb.db, events, audit);
    templates = new TemplatesService(testDb.db, events, audit, org);
    employeesService = new EmployeesService(testDb.db, events, audit);
    timers = new InMemoryTimerScheduler();
    schedule = new ScheduleService(
      testDb.db,
      events,
      audit,
      org,
      templates,
      new NotificationsService(),
      timers,
      {
        rules: DEFAULT_SCHEDULE_RULES,
        shiftReminderMinutes: 120,
        ackReminderHours: 24,
        defaultTimezone: 'Europe/Kyiv',
      },
    );
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE notification_outbox, assignment_acknowledgements, shift_assignments, schedule_versions, shift_templates, telegram_accounts, employees, responsibility_zones, teams, org_units, sites CASCADE`,
    );
    timers.scheduled.length = 0;
    const site = await org.createSite(
      { code: 'main', name: 'Основная', timezone: 'Europe/Kyiv' },
      PLANNER,
    );
    siteId = site.id;
    unitId = (await org.createOrgUnit({ siteId, name: 'Цех фасовки' }, PLANNER)).id;
    otherUnitId = (await org.createOrgUnit({ siteId, name: 'Цех упаковки' }, PLANNER)).id;
    zoneId = (
      await org.createZone(
        {
          siteId,
          orgUnitId: unitId,
          code: 'FILL_1',
          name: 'Линия 1',
          type: 'FILLING',
          isShared: false,
        },
        PLANNER,
      )
    ).id;
    dayId = (
      await templates.create(
        {
          siteId,
          code: 'DAY',
          name: 'Дневная',
          localStart: '08:00',
          localEnd: '20:00',
          isNight: false,
        },
        PLANNER,
      )
    ).id;
    nightId = (
      await templates.create(
        {
          siteId,
          code: 'NIGHT',
          name: 'Ночная',
          localStart: '20:00',
          localEnd: '08:00',
          isNight: true,
        },
        PLANNER,
      )
    ).id;
    ivanov = (
      await employeesService.create(
        { personnelNumber: '1', fullName: 'Иванов Иван', status: 'ACTIVE' },
        PLANNER,
      )
    ).id;
    petrova = (
      await employeesService.create(
        { personnelNumber: '2', fullName: 'Петрова Ольга', status: 'ACTIVE' },
        PLANNER,
      )
    ).id;
    await testDb.db.insert(telegramAccounts).values({ employeeId: ivanov, telegramUserId: 111 });
  });

  it('чернетка → помилки валідації блокують подання → виправлення → публікація з нотифікацією і таймерами', async () => {
    const v1 = await schedule.createVersion(
      { siteId, orgUnitId: unitId, periodMonth: MONTH },
      PLANNER,
    );
    expect(v1).toMatchObject({ versionNo: 1, status: 'DRAFT', assignmentsCount: 0 });

    // Ніч 1-го закінчується о 08:00 2-го; день 2-го починається о 08:00: відпочинку 0 → помилка.
    const bad = await schedule.putAssignments(
      v1.id,
      {
        items: [
          {
            employeeId: ivanov,
            templateId: nightId,
            businessDate: day(1),
            zoneId,
            kind: 'REGULAR',
          },
          { employeeId: ivanov, templateId: dayId, businessDate: day(2), zoneId, kind: 'REGULAR' },
          { employeeId: petrova, templateId: dayId, businessDate: day(1), kind: 'REGULAR' },
        ],
      },
      PLANNER,
    );
    expect(bad.issues.map((i) => i.code)).toContain('REST_TOO_SHORT');
    await expect(schedule.submit(v1.id, PLANNER)).rejects.toMatchObject({
      code: 'SCHEDULE_HAS_ERRORS',
    });

    const good = await schedule.putAssignments(
      v1.id,
      {
        items: [
          { employeeId: ivanov, templateId: dayId, businessDate: day(1), zoneId, kind: 'REGULAR' },
          { employeeId: ivanov, templateId: dayId, businessDate: day(2), zoneId, kind: 'REGULAR' },
          {
            employeeId: ivanov,
            templateId: nightId,
            businessDate: day(4),
            zoneId,
            kind: 'REGULAR',
          },
          { employeeId: petrova, templateId: dayId, businessDate: day(1), kind: 'REGULAR' },
        ],
      },
      PLANNER,
    );
    expect(good.issues.filter((i) => i.severity === 'ERROR')).toEqual([]);
    const first = good.assignments.find(
      (a) => a.employeeId === ivanov && a.businessDate === day(1),
    );
    // 08:00 за Києвом у вересні-жовтні = 05:00Z; після переходу на зимовий час 06:00Z.
    expect(['05:00', '06:00']).toContain(first!.planStartAt.slice(11, 16));

    await expect(schedule.publish(v1.id, {}, HEAD)).rejects.toMatchObject({
      code: 'SCHEDULE_TRANSITION_NOT_ALLOWED',
    });
    expect((await schedule.submit(v1.id, PLANNER)).status).toBe('IN_REVIEW');
    await expect(schedule.putAssignments(v1.id, { items: [] }, PLANNER)).rejects.toMatchObject({
      code: 'SCHEDULE_NOT_EDITABLE',
    });

    const published = await schedule.publish(v1.id, {}, HEAD);
    expect(published).toMatchObject({
      status: 'PUBLISHED',
      supersedesId: null,
      assignmentsCount: 4,
    });

    // Нотифікація лише працівнику з привʼязкою, з кнопкою «Ознайомлений».
    const outbox = await testDb.db.select().from(notificationOutbox);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      recipientId: ivanov,
      template: 'SCHEDULE_PUBLISHED',
      status: 'PENDING',
    });
    expect(outbox[0]?.payload.text).toContain('3 смен');
    expect(outbox[0]?.payload.buttons?.[0]?.[0]?.callbackData).toBe(`ack:${v1.id}`);

    // Таймери: нагадування на 4 зміни + ознайомлення для 2 працівників.
    const jobs = timers.scheduled.map((s) => s.jobId);
    expect(jobs.filter((j) => j.startsWith('shift-reminder.'))).toHaveLength(4);
    expect(jobs.filter((j) => j.startsWith('ack-reminder.'))).toHaveLength(2);

    // Ознайомлення.
    expect(await schedule.unacknowledgedVersions(ivanov)).toEqual([
      { versionId: v1.id, periodMonth: MONTH },
    ]);
    expect(await schedule.acknowledge(v1.id, ivanov, 'TELEGRAM')).toEqual({
      acknowledged: 3,
      total: 3,
    });
    expect(await schedule.acknowledge(v1.id, ivanov, 'TELEGRAM')).toEqual({
      acknowledged: 0,
      total: 3,
    });
    expect(await schedule.unacknowledgedVersions(ivanov)).toEqual([]);
    const status = await schedule.acknowledgementStatus(v1.id);
    expect(status.find((s) => s.employeeId === ivanov)).toMatchObject({
      assignments: 3,
      acknowledged: 3,
      telegramLinked: true,
    });
    expect(status.find((s) => s.employeeId === petrova)).toMatchObject({
      assignments: 1,
      acknowledged: 0,
      telegramLinked: false,
    });

    // «Мій план».
    const plan = await schedule.myPlan(ivanov, MONTH);
    expect(plan.timezone).toBe('Europe/Kyiv');
    expect(plan.totals).toMatchObject({
      shifts: 3,
      dayShifts: 2,
      nightShifts: 1,
      plannedMinutes: 3 * 720,
    });
    expect(plan.days[0]).toMatchObject({ date: day(1), kind: 'DAY' });
    expect(plan.days[0]?.assignment).toMatchObject({
      zoneName: 'Линия 1',
      orgUnitName: 'Цех фасовки',
      acknowledged: true,
    });
    expect(plan.days[2]?.kind).toBe('OFF');
    expect(plan.unacknowledgedVersionIds).toEqual([]);
    const next = await schedule.nextShift(ivanov);
    expect(next?.zoneName).toBe('Линия 1');
    expect(next?.isNight).toBe(false);
  });

  it('нова версія копіює опубліковану, публікація замінює її і шле нотифікацію про зміни', async () => {
    const v1 = await schedule.createVersion(
      { siteId, orgUnitId: unitId, periodMonth: MONTH },
      PLANNER,
    );
    await schedule.putAssignments(
      v1.id,
      {
        items: [
          { employeeId: ivanov, templateId: dayId, businessDate: day(1), kind: 'REGULAR' },
          { employeeId: ivanov, templateId: dayId, businessDate: day(2), kind: 'REGULAR' },
        ],
      },
      PLANNER,
    );
    await schedule.submit(v1.id, PLANNER);
    await schedule.publish(v1.id, {}, HEAD);
    await schedule.acknowledge(v1.id, ivanov, 'TELEGRAM');

    const v2 = await schedule.createVersion(
      { siteId, orgUnitId: unitId, periodMonth: MONTH },
      PLANNER,
    );
    expect(v2).toMatchObject({ versionNo: 2, assignmentsCount: 2 });
    await schedule.putAssignments(
      v2.id,
      {
        items: [
          { employeeId: ivanov, templateId: nightId, businessDate: day(1), kind: 'REGULAR' },
          { employeeId: ivanov, templateId: dayId, businessDate: day(5), kind: 'REGULAR' },
        ],
      },
      PLANNER,
    );
    await schedule.submit(v2.id, PLANNER);
    const published = await schedule.publish(v2.id, { changeReason: 'заміна за заявою' }, HEAD);
    expect(published.supersedesId).toBe(v1.id);

    const [old] = await testDb.db
      .select()
      .from(scheduleVersions)
      .where(eq(scheduleVersions.id, v1.id));
    expect(old?.status).toBe('SUPERSEDED');

    const outbox = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.template, 'SCHEDULE_CHANGED'));
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.payload.text).toMatch(/добавлено 1, отменено 1, изменено 1/);

    // Стара ознайомленість не переноситься: нова версія вимагає нового підтвердження (FR-SCH-03).
    expect(await schedule.unacknowledgedVersions(ivanov)).toEqual([
      { versionId: v2.id, periodMonth: MONTH },
    ]);
    const listed = await schedule.list({ siteId, orgUnitId: unitId, periodMonth: MONTH });
    expect(listed.map((v) => [v.versionNo, v.status])).toEqual([
      [2, 'PUBLISHED'],
      [1, 'SUPERSEDED'],
    ]);
  });

  it('валідація бачить опубліковані зміни того ж працівника в іншому підрозділі', async () => {
    const a = await schedule.createVersion(
      { siteId, orgUnitId: unitId, periodMonth: MONTH },
      PLANNER,
    );
    await schedule.putAssignments(
      a.id,
      {
        items: [{ employeeId: ivanov, templateId: dayId, businessDate: day(10), kind: 'REGULAR' }],
      },
      PLANNER,
    );
    await schedule.submit(a.id, PLANNER);
    await schedule.publish(a.id, {}, HEAD);

    const b = await schedule.createVersion(
      { siteId, orgUnitId: otherUnitId, periodMonth: MONTH },
      PLANNER,
    );
    const detail = await schedule.putAssignments(
      b.id,
      {
        items: [
          { employeeId: ivanov, templateId: nightId, businessDate: day(10), kind: 'REGULAR' },
        ],
      },
      PLANNER,
    );
    expect(detail.issues.map((i) => i.code)).toContain('REST_TOO_SHORT');
    await expect(schedule.submit(b.id, PLANNER)).rejects.toMatchObject({
      code: 'SCHEDULE_HAS_ERRORS',
    });
  });

  it('відхиляє чужу зону, неактивного працівника, дату поза місяцем і дубль дня', async () => {
    const v = await schedule.createVersion(
      { siteId, orgUnitId: otherUnitId, periodMonth: MONTH },
      PLANNER,
    );
    const base = { employeeId: ivanov, templateId: dayId, kind: 'REGULAR' as const };
    await expect(
      schedule.putAssignments(
        v.id,
        { items: [{ ...base, businessDate: day(1), zoneId }] },
        PLANNER,
      ),
    ).rejects.toMatchObject({ code: 'ZONE_MISMATCH' });
    await expect(
      schedule.putAssignments(
        v.id,
        { items: [{ ...base, businessDate: `${addMonths(MONTH, 1)}-01` }] },
        PLANNER,
      ),
    ).rejects.toMatchObject({ code: 'DATE_OUTSIDE_PERIOD' });
    await expect(
      schedule.putAssignments(
        v.id,
        {
          items: [
            { ...base, businessDate: day(1) },
            { ...base, templateId: nightId, businessDate: day(1) },
          ],
        },
        PLANNER,
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE_ASSIGNMENT' });
    await employeesService.changeStatus(petrova, { status: 'BLOCKED', reason: 'тест' }, PLANNER);
    await expect(
      schedule.putAssignments(
        v.id,
        { items: [{ ...base, employeeId: petrova, businessDate: day(1) }] },
        PLANNER,
      ),
    ).rejects.toMatchObject({ code: 'EMPLOYEE_NOT_ACTIVE' });
  });

  it('a manual reminder reaches only employees with unacknowledged shifts, once per day', async () => {
    const v1 = await schedule.createVersion(
      { siteId, orgUnitId: unitId, periodMonth: MONTH },
      PLANNER,
    );
    await schedule.putAssignments(
      v1.id,
      {
        items: [
          { employeeId: ivanov, templateId: dayId, businessDate: day(1), kind: 'REGULAR' },
          { employeeId: petrova, templateId: dayId, businessDate: day(2), kind: 'REGULAR' },
        ],
      },
      PLANNER,
    );
    await expect(schedule.remindAcknowledgement(v1.id, HEAD)).rejects.toMatchObject({
      code: 'SCHEDULE_NOT_PUBLISHED',
    });
    await schedule.submit(v1.id, PLANNER);
    await schedule.publish(v1.id, {}, HEAD);
    // Petrova acknowledges; Ivanov (the only one with Telegram) has not, so he is the one reminded.
    await schedule.acknowledge(v1.id, petrova, 'TELEGRAM');

    const first = await schedule.remindAcknowledgement(v1.id, HEAD);
    expect(first.reminded).toBe(1);
    const again = await schedule.remindAcknowledgement(v1.id, HEAD);
    expect(again.reminded).toBe(0);
    const queued = await testDb.db
      .select({ id: notificationOutbox.id, template: notificationOutbox.template })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.template, 'ACK_REMINDER'));
    expect(queued).toHaveLength(1);
  });

  it('deletes a draft with its assignments; a published version is refused', async () => {
    const draft = await schedule.createVersion(
      { siteId, orgUnitId: unitId, periodMonth: MONTH },
      PLANNER,
    );
    await schedule.putAssignments(
      draft.id,
      { items: [{ employeeId: ivanov, templateId: dayId, businessDate: day(1), kind: 'REGULAR' }] },
      PLANNER,
    );
    await schedule.deleteVersion(draft.id, PLANNER);
    await expect(schedule.detail(draft.id)).rejects.toMatchObject({
      code: 'SCHEDULE_VERSION_NOT_FOUND',
    });
    expect(await schedule.list({ siteId, orgUnitId: unitId, periodMonth: MONTH })).toHaveLength(0);

    const v1 = await schedule.createVersion(
      { siteId, orgUnitId: unitId, periodMonth: MONTH },
      PLANNER,
    );
    await schedule.putAssignments(
      v1.id,
      { items: [{ employeeId: ivanov, templateId: dayId, businessDate: day(1), kind: 'REGULAR' }] },
      PLANNER,
    );
    await schedule.submit(v1.id, PLANNER);
    await expect(schedule.deleteVersion(v1.id, PLANNER)).rejects.toMatchObject({
      code: 'SCHEDULE_TRANSITION_NOT_ALLOWED',
    });
    await schedule.publish(v1.id, {}, HEAD);
    await expect(schedule.deleteVersion(v1.id, PLANNER)).rejects.toMatchObject({
      code: 'SCHEDULE_TRANSITION_NOT_ALLOWED',
    });
  });
});
