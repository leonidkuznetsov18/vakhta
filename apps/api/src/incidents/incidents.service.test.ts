import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  domainEvents,
  downtimeIncidents,
  downtimeReports,
  employees,
  eq,
  incidentStatusHistory,
  notificationOutbox,
  orgUnits,
  reasonCodes,
  responsibilityZones,
  scheduleVersions,
  shiftAssignments,
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
import { InMemoryTimerScheduler } from '../infra/timers.queue.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ShiftChanges } from '../shift/shift-changes.js';
import { ShiftService } from '../shift/shift.service.js';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { IncidentChanges } from './incident-changes.js';
import { IncidentsService } from './incidents.service.js';

const MASTER = { type: 'WEB_USER', id: null, role: 'SHIFT_MASTER', label: 'master' } as const;
let n = 0;
const key = () => `inc-${++n}`;

describe('incidents: повідомлення про проблему, дублі, SLA, дії майстра (ТЗ 5.5, FR-DWN-*)', () => {
  let testDb: TestDatabase;
  let incidents: IncidentsService;
  let shift: ShiftService;
  let timers: InMemoryTimerScheduler;
  let ivanov: string;
  let petrova: string;
  let sidorov: string;
  let zoneA: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE incident_status_history, downtime_reports, downtime_incidents, shift_summaries, activity_intervals, shift_sessions, idempotency_keys, notification_outbox, presence_sessions, shift_assignments, schedule_versions, shift_templates, responsibility_zones, employees, org_units, sites, reason_codes CASCADE`,
    );
    timers = new InMemoryTimerScheduler();
    const attendance = new AttendanceService(testDb.db, new EventStore(), new AuditLog(), {
      window: DEFAULT_ATTENDANCE_WINDOW,
    });
    shift = new ShiftService(
      testDb.db,
      new EventStore(),
      new AuditLog(),
      new NotificationsService(),
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
    incidents = new IncidentsService(
      testDb.db,
      new EventStore(),
      new AuditLog(),
      new NotificationsService(),
      shift,
      new IncidentChanges(),
      timers,
      {
        sla: { normalMinutes: 60, criticalMinutes: 30, safetyMinutes: 0 },
        duplicateWindowMinutes: 60,
      },
    );

    const [site] = await testDb.db
      .insert(sites)
      .values({ code: 'main', name: 'Основная', timezone: 'Europe/Kyiv' })
      .returning();
    const [unit] = await testDb.db
      .insert(orgUnits)
      .values({ siteId: site!.id, name: 'Цех' })
      .returning();
    const zones = await testDb.db
      .insert(responsibilityZones)
      .values([
        { siteId: site!.id, orgUnitId: unit!.id, code: 'A', name: 'Линия A' },
        { siteId: site!.id, orgUnitId: unit!.id, code: 'B', name: 'Линия B' },
      ])
      .returning();
    zoneA = zones[0]!.id;
    await testDb.db.insert(reasonCodes).values([
      { kind: 'DOWNTIME', code: 'BREAKDOWN', label: 'Поломка', notifyMaster: true },
      {
        kind: 'DOWNTIME',
        code: 'SAFETY',
        label: 'Безопасность',
        notifyMaster: true,
        severity: 'SAFETY',
      },
      { kind: 'DOWNTIME', code: 'OTHER', label: 'Другое', requiresComment: true },
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
        { personnelNumber: '3', fullName: 'Сидоров Пётр' },
      ])
      .returning();
    [ivanov, petrova, sidorov] = [people[0]!.id, people[1]!.id, people[2]!.id];
    const start = new Date(Date.now() - 5 * 60_000);
    await testDb.db.insert(shiftAssignments).values(
      [
        [ivanov, zoneA],
        [petrova, zoneA],
        [sidorov, zones[1]!.id],
      ].map(([employeeId, zoneId]) => ({
        scheduleVersionId: version!.id,
        employeeId: employeeId!,
        templateId: tpl!.id,
        businessDate: '2026-10-01',
        planStartAt: start,
        planEndAt: new Date(start.getTime() + 12 * 3_600_000),
        orgUnitId: unit!.id,
        zoneId: zoneId!,
      })),
    );
    for (const id of [ivanov, petrova, sidorov]) {
      await attendance.reserveCheckIn(
        { employeeId: id, action: 'ARRIVE', reasonCode: 'TERMINAL_DOWN' },
        MASTER,
      );
      const started = await shift.start(
        id,
        { idempotencyKey: key() },
        { actor: employeeActor(id), source: 'TELEGRAM' },
      );
      expect(started.ok).toBe(true);
      await shift.acceptZone(id, employeeActor(id));
      const current = await shift.activeSession(id);
      const work = await shift.transition(
        id,
        { action: 'START_WORK', expectedVersion: current!.version, idempotencyKey: key() },
        { actor: employeeActor(id), source: 'TELEGRAM' },
      );
      expect(work.ok).toBe(true);
    }
    timers.scheduled.length = 0;
  });

  it('AC-08: проблема без зупинки створює інцидент, але не простій; SLA планується', async () => {
    const result = await incidents.report(
      ivanov,
      { reasonCode: 'BREAKDOWN', stoppedWork: false, idempotencyKey: key() },
      employeeActor(ivanov),
    );
    expect(result).toMatchObject({
      linkedToExisting: false,
      severity: 'NORMAL',
      downtimeStarted: false,
      downtimeError: null,
    });
    const session = await shift.activeSession(ivanov);
    expect(session?.state).toBe('WORKING');
    expect(timers.scheduled.map((s) => s.jobId)).toEqual([`incident-sla.${result.incidentId}`]);
    const [incident] = await testDb.db.select().from(downtimeIncidents);
    expect(incident).toMatchObject({
      status: 'REPORTED',
      reportsCount: 1,
      zoneId: zoneA,
      escalatedAt: null,
    });
    expect(incident!.slaDueAt.getTime() - incident!.openedAt.getTime()).toBe(60 * 60_000);
    const history = await testDb.db.select().from(incidentStatusHistory);
    expect(history.map((h) => h.toStatus)).toEqual(['REPORTED']);
  });

  it('«Работа остановлена: да» відкриває особистий DOWNTIME атомарно з інцидентом', async () => {
    const result = await incidents.report(
      ivanov,
      {
        reasonCode: 'BREAKDOWN',
        stoppedWork: true,
        idempotencyKey: key(),
        comment: 'Заклинило ленту',
      },
      employeeActor(ivanov),
    );
    expect(result.downtimeStarted).toBe(true);
    const session = await shift.activeSession(ivanov);
    expect(session).toMatchObject({ state: 'DOWNTIME', resumeState: 'WORKING' });
    expect(timers.scheduled.map((s) => s.jobId.split('.')[0]).sort()).toEqual([
      'downtime-escalation',
      'incident-sla',
    ]);
    const list = await incidents.list({});
    expect(list[0]).toMatchObject({ reportsCount: 1, stoppedNow: 1, reasonLabel: 'Поломка' });
    const events = await testDb.db
      .select({ type: domainEvents.type })
      .from(domainEvents)
      .where(eq(domainEvents.employeeId, ivanov));
    expect(events.map((e) => e.type)).toContain('INCIDENT_REPORTED');
    expect(events.map((e) => e.type)).toContain('DOWNTIME_STARTED');
  });

  it('FR-DWN-04: повідомлення другого працівника з тієї ж зони лінкується до відкритого інциденту', async () => {
    const first = await incidents.report(
      ivanov,
      { reasonCode: 'BREAKDOWN', stoppedWork: true, idempotencyKey: key() },
      employeeActor(ivanov),
    );
    const second = await incidents.report(
      petrova,
      { reasonCode: 'BREAKDOWN', stoppedWork: true, idempotencyKey: key() },
      employeeActor(petrova),
    );
    expect(second.incidentId).toBe(first.incidentId);
    expect(second.linkedToExisting).toBe(true);
    const other = await incidents.report(
      sidorov,
      { reasonCode: 'BREAKDOWN', stoppedWork: false, idempotencyKey: key() },
      employeeActor(sidorov),
    );
    expect(other.incidentId).not.toBe(first.incidentId);

    const detail = await incidents.detail(first.incidentId);
    expect(detail.incident.reportsCount).toBe(2);
    expect(detail.incident.stoppedNow).toBe(2);
    expect(detail.reports.map((r) => r.fullName).sort()).toEqual(['Иванов Иван', 'Петрова Ольга']);
    expect(await testDb.db.select().from(downtimeIncidents)).toHaveLength(2);
    expect(timers.scheduled.filter((s) => s.jobId.startsWith('incident-sla')).length).toBe(2);
  });

  it('FR-DWN-02/03: «Другое» вимагає коментар; безпека ескалюється негайно без SLA-таймера', async () => {
    await expect(
      incidents.report(
        ivanov,
        { reasonCode: 'OTHER', stoppedWork: false, idempotencyKey: key() },
        employeeActor(ivanov),
      ),
    ).rejects.toBeInstanceOf(DomainError);
    const safety = await incidents.report(
      ivanov,
      { reasonCode: 'SAFETY', stoppedWork: false, idempotencyKey: key() },
      employeeActor(ivanov),
    );
    expect(safety.severity).toBe('SAFETY');
    const [incident] = await testDb.db.select().from(downtimeIncidents);
    expect(incident?.escalatedAt).not.toBeNull();
    expect(timers.scheduled).toHaveLength(0);
    const events = await testDb.db
      .select({ type: domainEvents.type })
      .from(domainEvents)
      .where(eq(domainEvents.incidentId, safety.incidentId));
    expect(events.map((e) => e.type)).toEqual(['INCIDENT_REPORTED', 'INCIDENT_ESCALATED']);
  });

  it('ідемпотентність: повтор із тим самим ключем повертає той самий інцидент без другого повідомлення', async () => {
    const k = key();
    const a = await incidents.report(
      ivanov,
      { reasonCode: 'BREAKDOWN', stoppedWork: true, idempotencyKey: k },
      employeeActor(ivanov),
    );
    const b = await incidents.report(
      ivanov,
      { reasonCode: 'BREAKDOWN', stoppedWork: true, idempotencyKey: k },
      employeeActor(ivanov),
    );
    expect(b.incidentId).toBe(a.incidentId);
    expect(await testDb.db.select().from(downtimeReports)).toHaveLength(1);
  });

  it('FR-DWN-05/06: майстер підтверджує, вирішує й закриває; історія зберігається, простій працівника не закривається', async () => {
    const reported = await incidents.report(
      ivanov,
      { reasonCode: 'BREAKDOWN', stoppedWork: true, idempotencyKey: key() },
      employeeActor(ivanov),
    );
    const id = reported.incidentId;
    await expect(incidents.transition(id, { to: 'CLOSED' }, MASTER)).rejects.toMatchObject({
      code: 'INCIDENT_TRANSITION_NOT_ALLOWED',
    });
    await expect(incidents.transition(id, { to: 'REJECTED' }, MASTER)).rejects.toMatchObject({
      code: 'COMMENT_REQUIRED',
    });

    const ack = await incidents.transition(id, { to: 'ACKNOWLEDGED' }, MASTER);
    expect(ack.status).toBe('ACKNOWLEDGED');
    expect(ack.acknowledgedAt).not.toBeNull();
    expect(timers.scheduled.some((s) => s.jobId.startsWith('incident-sla'))).toBe(true);

    const resolved = await incidents.transition(
      id,
      { to: 'RESOLVED', comment: 'Ленту заменили' },
      MASTER,
    );
    expect(resolved.status).toBe('RESOLVED');
    expect(timers.scheduled.some((s) => s.jobId.startsWith('incident-sla'))).toBe(false);
    const notices = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.template, 'INCIDENT_RESOLVED'));
    expect(notices.map((x) => x.recipientId)).toEqual([ivanov]);
    expect((await shift.activeSession(ivanov))?.state).toBe('DOWNTIME');

    const closed = await incidents.transition(id, { to: 'CLOSED' }, MASTER);
    expect(closed.closedAt).not.toBeNull();
    const detail = await incidents.detail(id);
    expect(detail.history.map((h) => h.toStatus)).toEqual([
      'REPORTED',
      'ACKNOWLEDGED',
      'RESOLVED',
      'CLOSED',
    ]);
    expect(detail.history[2]?.comment).toBe('Ленту заменили');
    expect(await incidents.list({})).toHaveLength(0);
    expect(await incidents.list({ scope: 'all' })).toHaveLength(1);
  });

  it('FR-DWN-05: злиття дублів зберігає вихідні записи; деталі первинного показують усі повідомлення', async () => {
    const a = await incidents.report(
      ivanov,
      { reasonCode: 'BREAKDOWN', stoppedWork: false, idempotencyKey: key() },
      employeeActor(ivanov),
    );
    const b = await incidents.report(
      sidorov,
      { reasonCode: 'BREAKDOWN', stoppedWork: false, idempotencyKey: key() },
      employeeActor(sidorov),
    );
    expect(a.incidentId).not.toBe(b.incidentId);
    await expect(
      incidents.transition(b.incidentId, { to: 'DUPLICATE' }, MASTER),
    ).rejects.toMatchObject({ code: 'DUPLICATE_TARGET_REQUIRED' });
    const merged = await incidents.transition(
      b.incidentId,
      { to: 'DUPLICATE', duplicateOfId: a.incidentId, comment: 'Та же поломка' },
      MASTER,
    );
    expect(merged).toMatchObject({ status: 'DUPLICATE', duplicateOfId: a.incidentId });
    const detail = await incidents.detail(a.incidentId);
    expect(detail.duplicates.map((d) => d.id)).toEqual([b.incidentId]);
    expect(detail.reports).toHaveLength(2);
    expect(await testDb.db.select().from(downtimeReports)).toHaveLength(2);
    const updated = await incidents.update(
      a.incidentId,
      { reasonCode: 'SAFETY', comment: 'Уточнена причина' },
      MASTER,
    );
    expect(updated).toMatchObject({ reasonCode: 'SAFETY', severity: 'SAFETY' });
  });

  it('статистика по причинах і зонах: кількість, хвилини простою, порушення SLA', async () => {
    const a = await incidents.report(
      ivanov,
      { reasonCode: 'BREAKDOWN', stoppedWork: true, idempotencyKey: key() },
      employeeActor(ivanov),
    );
    await incidents.report(
      sidorov,
      { reasonCode: 'SAFETY', stoppedWork: false, idempotencyKey: key() },
      employeeActor(sidorov),
    );
    // штучно зсуваємо SLA в минуле, щоб зафіксувати порушення
    await testDb.db
      .update(downtimeIncidents)
      .set({ slaDueAt: new Date(Date.now() - 60_000) })
      .where(eq(downtimeIncidents.id, a.incidentId));
    const stats = await incidents.stats({
      from: new Date(Date.now() - 3_600_000).toISOString(),
      to: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(stats.totals.incidents).toBe(2);
    expect(stats.totals.reports).toBe(2);
    expect(stats.totals.slaBreached).toBe(2);
    const breakdown = stats.byReason.find((r) => r.key === 'BREAKDOWN');
    expect(breakdown?.incidents).toBe(1);
    expect(stats.byZone.find((z) => z.label === 'Линия A')?.incidents).toBe(1);
    expect(stats.byZone.find((z) => z.label === 'Линия B')?.incidents).toBe(1);
  });
});
