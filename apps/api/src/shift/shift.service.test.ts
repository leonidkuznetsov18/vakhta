import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  activityIntervals,
  domainEvents,
  employees,
  eq,
  notificationOutbox,
  orgUnits,
  presenceSessions,
  reasonCodes,
  responsibilityZones,
  scheduleVersions,
  shiftAssignments,
  shiftSessions,
  shiftSummaries,
  shiftTemplates,
  sites,
  sql,
} from '@vakhta/db';
import { DEFAULT_ATTENDANCE_WINDOW, checkIntervalInvariants } from '@vakhta/domain';
import type { ShiftChangedEvent, TransitionResponse } from '@vakhta/contracts';
import { AttendanceService } from '../attendance/attendance.service.js';
import { employeeActor } from '../common/actor.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { InMemoryTimerScheduler } from '../infra/timers.queue.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { ShiftChanges } from './shift-changes.js';
import { ShiftService } from './shift.service.js';

const MASTER = { type: 'WEB_USER', id: null, role: 'SHIFT_MASTER', label: 'master' } as const;
const OPTIONS = {
  breakMinutes: 15,
  mealMinutes: 30,
  serviceTimeMinutes: 30,
  downtimeEscalationMinutes: 15,
  graceMinutes: 10,
  earlyStartWindowMinutes: 30,
  overtimeThresholdMinutes: 15,
  defaultTimezone: 'Europe/Kyiv',
};

let keyCounter = 0;
const key = () => `k-${++keyCounter}`;

describe('shift: машина станів зміни в транзакції (ТЗ 4.3–4.5, документ 3.7)', () => {
  let testDb: TestDatabase;
  let service: ShiftService;
  let attendance: AttendanceService;
  let timers: InMemoryTimerScheduler;
  let changes: ShiftChanges;
  let published: ShiftChangedEvent[];
  let ivanov: string;
  let petrova: string;
  let zoneId: string;
  let planStart: Date;
  let planEnd: Date;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE shift_summaries, activity_intervals, shift_sessions, idempotency_keys, notification_outbox, presence_sessions, shift_assignments, schedule_versions, shift_templates, responsibility_zones, employees, org_units, sites, reason_codes CASCADE`,
    );
    timers = new InMemoryTimerScheduler();
    changes = new ShiftChanges();
    published = [];
    changes.stream().subscribe((e) => published.push(e));
    attendance = new AttendanceService(testDb.db, new EventStore(), new AuditLog(), {
      window: DEFAULT_ATTENDANCE_WINDOW,
    });
    service = new ShiftService(
      testDb.db,
      new EventStore(),
      new AuditLog(),
      new NotificationsService(),
      attendance,
      changes,
      timers,
      OPTIONS,
    );

    const [site] = await testDb.db
      .insert(sites)
      .values({ code: 'main', name: 'Основная', timezone: 'Europe/Kyiv' })
      .returning();
    const [unit] = await testDb.db
      .insert(orgUnits)
      .values({ siteId: site!.id, name: 'Цех' })
      .returning();
    const [zone] = await testDb.db
      .insert(responsibilityZones)
      .values({ siteId: site!.id, orgUnitId: unit!.id, code: 'L1', name: 'Линия 1' })
      .returning();
    zoneId = zone!.id;
    await testDb.db.insert(reasonCodes).values([
      { kind: 'DOWNTIME', code: 'BREAKDOWN', label: 'Поломка', notifyMaster: true },
      { kind: 'EMERGENCY', code: 'HEALTH', label: 'Самочувствие', severity: 'SAFETY' },
    ]);
    const [tpl] = await testDb.db
      .insert(shiftTemplates)
      .values({
        siteId: site!.id,
        code: 'DAY',
        name: 'Дневная',
        localStart: '08:00',
        localEnd: '20:00',
      })
      .returning();
    const [version] = await testDb.db
      .insert(scheduleVersions)
      .values({
        siteId: site!.id,
        orgUnitId: unit!.id,
        periodMonth: '2026-10',
        versionNo: 1,
        status: 'PUBLISHED',
      })
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
    planStart = new Date(Date.now() - 5 * 60_000);
    planEnd = new Date(planStart.getTime() + 12 * 3_600_000);
    await testDb.db.insert(shiftAssignments).values([
      {
        scheduleVersionId: version!.id,
        employeeId: ivanov,
        templateId: tpl!.id,
        businessDate: '2026-10-01',
        planStartAt: planStart,
        planEndAt: planEnd,
        orgUnitId: unit!.id,
        zoneId,
      },
      {
        scheduleVersionId: version!.id,
        employeeId: petrova,
        templateId: tpl!.id,
        businessDate: '2026-10-01',
        planStartAt: planStart,
        planEndAt: planEnd,
        orgUnitId: unit!.id,
      },
    ]);
  });

  async function arrive(employeeId: string): Promise<void> {
    const result = await attendance.reserveCheckIn(
      { employeeId, action: 'ARRIVE', reasonCode: 'TERMINAL_DOWN' },
      MASTER,
    );
    expect(result.ok).toBe(true);
  }

  function meta(employeeId: string) {
    return { actor: employeeActor(employeeId), source: 'TELEGRAM' as const };
  }

  async function act(
    employeeId: string,
    action: Parameters<ShiftService['transition']>[1]['action'],
    extra: Partial<Parameters<ShiftService['transition']>[1]> = {},
  ): Promise<TransitionResponse> {
    const current = await service.activeSession(employeeId);
    return service.transition(
      employeeId,
      { action, expectedVersion: current?.version ?? 0, idempotencyKey: key(), ...extra },
      meta(employeeId),
    );
  }

  it('FR-TIME-02: без присутності зміну почати не можна; з присутністю відкривається PREPARATION', async () => {
    const denied = await service.start(ivanov, { idempotencyKey: key() }, meta(ivanov));
    expect(denied).toMatchObject({ ok: false, error: 'PRESENCE_REQUIRED', session: null });

    await arrive(ivanov);
    const started = await service.start(ivanov, { idempotencyKey: key() }, meta(ivanov));
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.session).toMatchObject({
      state: 'PREPARATION',
      resumeState: null,
      version: 2,
      zoneName: 'Линия 1',
      zoneAccepted: false,
    });
    expect(started.session.startedAt).not.toBeNull();
    expect(published).toHaveLength(1);

    const again = await service.start(ivanov, { idempotencyKey: key() }, meta(ivanov));
    expect(again).toMatchObject({ ok: false, error: 'ALREADY_STARTED' });
  });

  it('ідемпотентність: той самий ключ повертає збережену відповідь без другого переходу', async () => {
    await arrive(ivanov);
    const k = key();
    const first = await service.start(ivanov, { idempotencyKey: k }, meta(ivanov));
    const second = await service.start(ivanov, { idempotencyKey: k }, meta(ivanov));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.replayed).toBe(true);
    expect(second.session.version).toBe(first.session.version);
    const events = await testDb.db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.employeeId, ivanov));
    expect(events.filter((e) => e.type === 'SHIFT_STARTED')).toHaveLength(1);
    expect(published).toHaveLength(1);
  });

  it('ТЗ 12.3: застаріла версія відхиляється і повертає актуальний стан (T-09)', async () => {
    await arrive(ivanov);
    await service.start(ivanov, { idempotencyKey: key() }, meta(ivanov));
    await service.acceptZone(ivanov, employeeActor(ivanov));
    const stale = await service.transition(
      ivanov,
      { action: 'START_WORK', expectedVersion: 1, idempotencyKey: key() },
      meta(ivanov),
    );
    expect(stale).toMatchObject({ ok: false, error: 'VERSION_CONFLICT' });
    if (stale.ok) return;
    expect(stale.session?.state).toBe('PREPARATION');
    expect(stale.session?.version).toBe(2);
  });

  it('повний день: зона → робота → перерва з нагадуванням → повернення → прибирання → закриття з підсумком', async () => {
    await arrive(petrova);
    const started = await service.start(petrova, { idempotencyKey: key() }, meta(petrova));
    expect(started.ok).toBe(true);

    // без зони у призначенні робота починається одразу
    expect(await act(petrova, 'START_WORK')).toMatchObject({
      ok: true,
      session: { state: 'WORKING' },
    });

    const onBreak = await act(petrova, 'START_BREAK');
    expect(onBreak).toMatchObject({
      ok: true,
      session: { state: 'BREAK', resumeState: 'WORKING' },
    });
    expect(timers.scheduled.map((s) => s.jobId.split('.')[0])).toEqual(['return-reminder']);
    const breakJob = timers.scheduled[0]!;
    expect(breakJob.fireAt.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);

    // друга тимчасова дія з перерви заборонена (T-08)
    expect(await act(petrova, 'START_MEAL')).toMatchObject({
      ok: false,
      error: 'TEMPORARY_STATE_OPEN',
    });

    expect(await act(petrova, 'RESUME')).toMatchObject({
      ok: true,
      session: { state: 'WORKING', resumeState: null },
    });
    expect(timers.scheduled).toHaveLength(0);

    expect(await act(petrova, 'START_CLEANING')).toMatchObject({
      ok: true,
      session: { state: 'CLEANING' },
    });
    expect(await act(petrova, 'CLEANING_DONE')).toMatchObject({
      ok: true,
      session: { state: 'HANDOVER' },
    });
    // Without a zone the checklist report is still required (spec 5.6); only the master may skip it.
    expect(await act(petrova, 'SUBMIT_HANDOVER')).toMatchObject({
      ok: false,
      error: 'HANDOVER_INCOMPLETE',
    });
    const beforeSubmit = await service.activeSession(petrova);
    expect(
      await service.transition(
        petrova,
        {
          action: 'SUBMIT_HANDOVER',
          expectedVersion: beforeSubmit!.version,
          idempotencyKey: key(),
          comment: 'Report skipped by the master during the pilot',
        },
        { ...meta(petrova), masterOverride: true },
      ),
    ).toMatchObject({
      ok: true,
      session: { state: 'READY_TO_CLOSE' },
    });
    const closed = await act(petrova, 'CLOSE_SHIFT');
    expect(closed).toMatchObject({ ok: true, session: { state: 'SHIFT_CLOSED' } });
    if (!closed.ok) return;
    expect(closed.session.endedAt).not.toBeNull();
    expect(closed.summary).not.toBeNull();
    expect(closed.summary?.plannedMinutes).toBe(720);
    expect(closed.summary?.earlyLeaveMinutes).toBeGreaterThan(600);

    const session = closed.session;
    const intervals = await testDb.db
      .select()
      .from(activityIntervals)
      .where(eq(activityIntervals.shiftSessionId, session.id));
    expect(intervals.map((i) => i.state)).toEqual([
      'PREPARATION',
      'WORKING',
      'BREAK',
      'WORKING',
      'CLEANING',
      'HANDOVER',
      'READY_TO_CLOSE',
    ]);
    expect(intervals.every((i) => i.endedAt !== null)).toBe(true);
    const violations = checkIntervalInvariants(
      intervals.map((i) => ({
        state: i.state,
        startedAt: i.startedAt.getTime(),
        endedAt: i.endedAt?.getTime() ?? null,
        resumeState: i.resumeState,
      })),
      {
        shiftStartedAt: new Date(session.startedAt!).getTime(),
        shiftEndedAt: new Date(session.endedAt!).getTime(),
        now: Date.now(),
      },
    );
    expect(violations).toEqual([]);

    expect(await testDb.db.select().from(shiftSummaries)).toHaveLength(1);
    const outbox = await testDb.db.select().from(notificationOutbox);
    expect(outbox.map((o) => o.template)).toEqual(['SHIFT_SUMMARY']);
    expect(await service.activeSession(petrova)).toBeNull();

    // екран «Після зміни» показує підсумок, поки не минуло вікно
    const screen = await service.screen(petrova);
    expect(screen.session?.state).toBe('SHIFT_CLOSED');
    expect(screen.summary?.totalMinutes).toBe(closed.summary?.totalMinutes);
    expect(screen.allowedActions).toEqual([]);
  });

  it('ТЗ 4.4: робота із зоною потребує приймання зони, передача без звіту не подається', async () => {
    await arrive(ivanov);
    await service.start(ivanov, { idempotencyKey: key() }, meta(ivanov));
    expect(await act(ivanov, 'START_WORK')).toMatchObject({
      ok: false,
      error: 'ZONE_NOT_ACCEPTED',
    });
    const screen = await service.screen(ivanov);
    expect(screen.canAcceptZone).toBe(true);
    expect(screen.allowedActions).not.toContain('START_WORK');

    await service.acceptZone(ivanov, employeeActor(ivanov));
    expect(await act(ivanov, 'START_WORK')).toMatchObject({
      ok: true,
      session: { state: 'WORKING' },
    });
    await act(ivanov, 'START_CLEANING');
    await act(ivanov, 'CLEANING_DONE');
    expect(await act(ivanov, 'SUBMIT_HANDOVER')).toMatchObject({
      ok: false,
      error: 'HANDOVER_INCOMPLETE',
    });
  });

  it('FR-DWN-01/06: простій потребує причини, ескалація планується; обід із простою повертає у простій', async () => {
    await arrive(petrova);
    await service.start(petrova, { idempotencyKey: key() }, meta(petrova));
    await act(petrova, 'START_WORK');
    expect(await act(petrova, 'START_DOWNTIME')).toMatchObject({
      ok: false,
      error: 'REASON_REQUIRED',
    });
    const down = await act(petrova, 'START_DOWNTIME', { reasonCode: 'BREAKDOWN' });
    expect(down).toMatchObject({
      ok: true,
      session: { state: 'DOWNTIME', resumeState: 'WORKING' },
    });
    expect(timers.scheduled.map((s) => s.jobId.split('.')[0])).toEqual(['downtime-escalation']);

    const meal = await act(petrova, 'START_MEAL');
    expect(meal).toMatchObject({ ok: true, session: { state: 'MEAL', resumeState: 'WORKING' } });
    // ескалацію за старим інтервалом скасовано, нагадування про обід заплановано
    expect(timers.scheduled.map((s) => s.jobId.split('.')[0])).toEqual(['return-reminder']);

    const back = await act(petrova, 'RESUME', { resumeIntoDowntime: true });
    expect(back).toMatchObject({
      ok: true,
      session: { state: 'DOWNTIME', resumeState: 'WORKING' },
    });
    expect(timers.scheduled.map((s) => s.jobId.split('.')[0])).toEqual(['downtime-escalation']);

    const resumed = await act(petrova, 'RESUME');
    expect(resumed).toMatchObject({ ok: true, session: { state: 'WORKING', resumeState: null } });
    expect(timers.scheduled).toHaveLength(0);
  });

  it('екстрений вихід закриває зміну з підсумком і позначає «потрібна перевірка»', async () => {
    await arrive(petrova);
    await service.start(petrova, { idempotencyKey: key() }, meta(petrova));
    await act(petrova, 'START_WORK');
    const exit = await act(petrova, 'EMERGENCY_EXIT', { reasonCode: 'HEALTH' });
    expect(exit).toMatchObject({
      ok: true,
      session: { state: 'EMERGENCY_EXIT', needsClarification: true, clarificationReason: 'HEALTH' },
    });
    if (!exit.ok) return;
    expect(exit.summary).not.toBeNull();
    expect(await service.activeSession(petrova)).toBeNull();
    const open = await testDb.db
      .select()
      .from(activityIntervals)
      .where(eq(activityIntervals.shiftSessionId, exit.session.id));
    expect(open.every((i) => i.endedAt !== null)).toBe(true);
  });

  it('майстер: відкриває зміну без присутності з коментарем, робить перехід і позначає уточнення', async () => {
    const started = await service.masterStart(
      ivanov,
      { idempotencyKey: key(), comment: 'Телефон разряжен, отметил лично' },
      MASTER,
    );
    expect(started).toMatchObject({ ok: true, session: { state: 'PREPARATION' } });
    if (!started.ok) return;
    const [row] = await testDb.db
      .select()
      .from(shiftSessions)
      .where(eq(shiftSessions.id, started.session.id));
    expect(row?.startMethod).toBe('MASTER');

    const work = await service.masterTransition(
      started.session.id,
      {
        action: 'START_WORK',
        expectedVersion: started.session.version,
        idempotencyKey: key(),
        comment: 'Зона принята устно',
      },
      MASTER,
    );
    expect(work).toMatchObject({ ok: true, session: { state: 'WORKING' } });

    const flagged = await service.flagClarification(
      started.session.id,
      'Не сходится время простоя',
      MASTER,
    );
    expect(flagged.needsClarification).toBe(true);

    const list = await service.listActive({});
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      fullName: 'Иванов Иван',
      state: 'WORKING',
      needsClarification: true,
    });

    const detail = await service.detail(started.session.id);
    expect(detail.intervals.map((i) => i.state)).toEqual(['PREPARATION', 'WORKING']);
    expect(detail.events.map((e) => e.type)).toEqual([
      'SHIFT_STARTED',
      'WORK_STARTED',
      'SHIFT_FLAGGED_FOR_REVIEW',
    ]);
  });

  it('AC-05: два одночасних натискання дають один перехід, друге отримує конфлікт версії', async () => {
    await arrive(petrova);
    await service.start(petrova, { idempotencyKey: key() }, meta(petrova));
    const current = await service.activeSession(petrova);
    const [a, b] = await Promise.all([
      service.transition(
        petrova,
        { action: 'START_WORK', expectedVersion: current!.version, idempotencyKey: key() },
        meta(petrova),
      ),
      service.transition(
        petrova,
        { action: 'START_WORK', expectedVersion: current!.version, idempotencyKey: key() },
        meta(petrova),
      ),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const failed = a.ok ? b : a;
    expect(failed).toMatchObject({ ok: false, error: 'VERSION_CONFLICT' });
    const intervals = await testDb.db.select().from(activityIntervals);
    expect(intervals.filter((i) => i.state === 'WORKING')).toHaveLength(1);
    expect(await testDb.db.select().from(presenceSessions)).toHaveLength(1);
  });
});
