import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  activityIntervals,
  employees,
  orgUnits,
  presenceSessions,
  scheduleVersions,
  shiftAssignments,
  shiftSessions,
  shiftTemplates,
  sites,
  sql,
} from '@vakhta/db';
import { DEFAULT_ATTENDANCE_WINDOW } from '@vakhta/domain';
import { AttendanceService } from '../attendance/attendance.service.js';
import { employeeActor } from '../common/actor.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { InMemoryTimerScheduler } from '../infra/timers.queue.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ShiftChanges } from '../shift/shift-changes.js';
import { ShiftService } from '../shift/shift.service.js';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';

const MASTER = {
  type: 'WEB_USER',
  id: 'a0000000-0000-4000-8000-00000000aaaa',
  role: 'SHIFT_MASTER',
} as const;
const EMPLOYEES = Number(process.env['VAKHTA_LOAD_EMPLOYEES'] ?? 40);

function p95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
}

/**
 * Пік межі зміни (ТЗ 16, NFR-01, AC-05): усі працівники одночасно відмічають прихід, тиснуть
 * «Почати зміну» двічі і роблять перший перехід. Перевіряється відсутність дублів і p95 на рівні сервісів.
 * Кількість працівників задається VAKHTA_LOAD_EMPLOYEES (типово 40; для стенду замовника 200+).
 */
describe('load: одночасний старт зміни', () => {
  let testDb: TestDatabase;
  let shift: ShiftService;
  let attendance: AttendanceService;
  let ids: string[] = [];

  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE shift_summaries, activity_intervals, shift_sessions, idempotency_keys, notification_outbox, presence_sessions, shift_assignments, schedule_versions, shift_templates, employees, org_units, sites CASCADE`,
    );
    const events = new EventStore();
    const audit = new AuditLog();
    attendance = new AttendanceService(testDb.db, events, audit, {
      window: DEFAULT_ATTENDANCE_WINDOW,
    });
    shift = new ShiftService(
      testDb.db,
      events,
      audit,
      new NotificationsService(),
      attendance,
      new ShiftChanges(),
      new InMemoryTimerScheduler(),
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
    const [site] = await testDb.db
      .insert(sites)
      .values({ code: 'main', name: 'Основная', timezone: 'Europe/Kyiv' })
      .returning();
    const [unit] = await testDb.db
      .insert(orgUnits)
      .values({ siteId: site!.id, name: 'Цех' })
      .returning();
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
      .values(
        Array.from({ length: EMPLOYEES }, (_, i) => ({
          personnelNumber: String(1000 + i),
          fullName: `Сотрудник ${i}`,
        })),
      )
      .returning();
    ids = people.map((p) => p.id);
    const start = new Date(Date.now() - 5 * 60_000);
    await testDb.db.insert(shiftAssignments).values(
      ids.map((employeeId) => ({
        scheduleVersionId: version!.id,
        employeeId,
        templateId: tpl!.id,
        businessDate: '2026-10-01',
        planStartAt: start,
        planEndAt: new Date(start.getTime() + 12 * 3_600_000),
        orgUnitId: unit!.id,
      })),
    );
  });

  it(`${EMPLOYEES} працівників: прихід, подвійний старт, перший перехід без дублів; p95 < 1 с`, async () => {
    const arrivals = await Promise.all(
      ids.map(async (employeeId) => {
        const t0 = performance.now();
        const r = await attendance.reserveCheckIn(
          { employeeId, action: 'ARRIVE', reasonCode: 'TERMINAL_DOWN' },
          MASTER,
        );
        return { ok: r.ok, ms: performance.now() - t0 };
      }),
    );
    expect(arrivals.every((a) => a.ok)).toBe(true);

    // Подвійне натискання «Почати зміну» з різними update_id: рівно одна сесія на працівника (AC-05).
    const starts = await Promise.all(
      ids.flatMap((employeeId, i) =>
        [0, 1].map(async (k) => {
          const t0 = performance.now();
          const r = await shift.start(
            employeeId,
            { idempotencyKey: `load-${i}-${k}` },
            { actor: employeeActor(employeeId), source: 'TELEGRAM' },
          );
          return { ok: r.ok, error: r.ok ? null : r.error, ms: performance.now() - t0 };
        }),
      ),
    );
    const okStarts = starts.filter((s) => s.ok).length;
    const conflicts = starts.filter((s) => !s.ok && s.error === 'ALREADY_STARTED').length;
    expect(okStarts).toBe(EMPLOYEES);
    expect(conflicts).toBe(EMPLOYEES);
    expect(await testDb.db.select().from(shiftSessions)).toHaveLength(EMPLOYEES);

    const works = await Promise.all(
      ids.map(async (employeeId, i) => {
        const current = await shift.activeSession(employeeId);
        const t0 = performance.now();
        const r = await shift.transition(
          employeeId,
          {
            action: 'START_WORK',
            expectedVersion: current!.version,
            idempotencyKey: `load-work-${i}`,
          },
          { actor: employeeActor(employeeId), source: 'TELEGRAM' },
        );
        return { ok: r.ok, ms: performance.now() - t0 };
      }),
    );
    expect(works.every((w) => w.ok)).toBe(true);
    const openIntervals = await testDb.db
      .select()
      .from(activityIntervals)
      .where(sql`${activityIntervals.endedAt} IS NULL`);
    expect(openIntervals).toHaveLength(EMPLOYEES);
    expect(await testDb.db.select().from(presenceSessions)).toHaveLength(EMPLOYEES);

    const timings = {
      arriveP95: p95(arrivals.map((a) => a.ms)),
      startP95: p95(starts.map((s) => s.ms)),
      workP95: p95(works.map((w) => w.ms)),
    };
    console.info(`load: ${EMPLOYEES} працівників, p95 мс: ${JSON.stringify(timings)}`);
    expect(Math.max(timings.arriveP95, timings.startP95, timings.workP95)).toBeLessThan(1000);
  });
});
