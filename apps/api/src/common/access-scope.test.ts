import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Subject, firstValueFrom, take, toArray, timeout } from 'rxjs';
import {
  downtimeIncidents,
  employeePositions,
  employees,
  orgUnits,
  positions,
  requests,
  responsibilityZones,
  shiftSessions,
  shiftSummaries,
  sites,
  sql,
} from '@vakhta/db';
import { DEFAULT_ATTENDANCE_WINDOW, accessScope, type AccessScope } from '@vakhta/domain';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { MediaService } from '../handover/media.service.js';
import { IncidentChanges } from '../incidents/incident-changes.js';
import { IncidentsService } from '../incidents/incidents.service.js';
import { InMemoryObjectStorage } from '../infra/object-storage.js';
import { TimerScheduler } from '../infra/timers.queue.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { OrgService } from '../org/org.service.js';
import { CorrectionsService } from '../requests/corrections.service.js';
import { RequestChanges } from '../requests/request-changes.js';
import { RequestsService } from '../requests/requests.service.js';
import { ScheduleService } from '../scheduling/schedule.service.js';
import { TemplatesService } from '../scheduling/templates.service.js';
import { ShiftChanges } from '../shift/shift-changes.js';
import { ShiftService } from '../shift/shift.service.js';
import { DomainError } from './domain-error.js';
import { assertInScope, scopedEvents } from './access-scope.js';
import { emergencyService } from '../../test/maintenance.js';

/**
 * Spec 004 AC-001–AC-003: overview sources apply role and scope of one grant. Two sites, three
 * units; every source holds one record per unit, and each scoped reader sees only its own.
 */
describe('access scope of overview sources (spec 004 US1)', () => {
  let testDb: TestDatabase;
  let shifts: ShiftService;
  let incidents: IncidentsService;
  let requestsService: RequestsService;
  const place = {} as Record<'A' | 'B' | 'C', { site: string; unit: string; zone: string }>;
  const ids = {} as Record<'A' | 'B' | 'C', { shift: string; incident: string; request: string }>;
  const now = new Date('2026-09-13T09:00:00Z');

  const master = (unit: string): AccessScope =>
    accessScope([{ role: 'SHIFT_MASTER', scopeType: 'ORG_UNIT', scopeId: unit }], ['SHIFT_MASTER']);
  const head = (site: string): AccessScope =>
    accessScope(
      [{ role: 'PRODUCTION_HEAD', scopeType: 'SITE', scopeId: site }],
      ['PRODUCTION_HEAD'],
    );

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const db = testDb.db;
    await db.execute(sql`TRUNCATE sites CASCADE`);
    const events = new EventStore();
    const audit = new AuditLog();
    const notifications = new NotificationsService();
    const timers = new TimerScheduler();
    const attendance = new AttendanceService(db, events, audit, {
      window: DEFAULT_ATTENDANCE_WINDOW,
    });
    shifts = new ShiftService(
      db,
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
    const media = new MediaService(db, audit, { linkTtlSeconds: 300 }, new InMemoryObjectStorage());
    incidents = new IncidentsService(
      db,
      events,
      audit,
      notifications,
      shifts,
      new IncidentChanges(),
      media,
      timers,
      { sla: { normalMinutes: 60, criticalMinutes: 30, safetyMinutes: 0 } },
      emergencyService(db, timers),
    );
    const org = new OrgService(db, events, audit);
    const schedule = new ScheduleService(
      db,
      events,
      audit,
      org,
      new TemplatesService(db, events, audit, org),
      notifications,
      timers,
      { shiftReminderMinutes: 120, defaultTimezone: 'Europe/Kyiv' },
    );
    requestsService = new RequestsService(
      db,
      events,
      audit,
      notifications,
      schedule,
      media,
      new CorrectionsService(db, events, audit, shifts),
      new RequestChanges(),
      { appealWindowDays: 3 },
    );

    const [site1, site2] = await db
      .insert(sites)
      .values([
        { code: 's1', name: 'Plant 1', timezone: 'Europe/Kyiv' },
        { code: 's2', name: 'Plant 2', timezone: 'Europe/Kyiv' },
      ])
      .returning();
    const [position] = await db
      .insert(positions)
      .values({ code: 'OP', name: 'Operator' })
      .returning();
    const layout = { A: site1!.id, B: site1!.id, C: site2!.id } as const;
    for (const key of ['A', 'B', 'C'] as const) {
      const [unit] = await db
        .insert(orgUnits)
        .values({ siteId: layout[key], name: `Unit ${key}` })
        .returning();
      const [zone] = await db
        .insert(responsibilityZones)
        .values({ siteId: layout[key], orgUnitId: unit!.id, code: key, name: `Zone ${key}` })
        .returning();
      place[key] = { site: layout[key], unit: unit!.id, zone: zone!.id };
      const [person] = await db
        .insert(employees)
        .values({ personnelNumber: key, fullName: `Worker ${key}` })
        .returning();
      await db.insert(employeePositions).values({
        employeeId: person!.id,
        orgUnitId: unit!.id,
        positionId: position!.id,
        validFrom: new Date('2026-01-01T00:00:00Z'),
      });
      const [open] = await db
        .insert(shiftSessions)
        .values({
          employeeId: person!.id,
          businessDate: '2026-09-13',
          state: 'WORKING',
          startedAt: new Date('2026-09-13T05:00:00Z'),
          zoneId: zone!.id,
        })
        .returning();
      const [closed] = await db
        .insert(shiftSessions)
        .values({
          employeeId: person!.id,
          businessDate: '2026-09-12',
          state: 'SHIFT_CLOSED',
          startedAt: new Date('2026-09-12T05:00:00Z'),
          endedAt: new Date('2026-09-12T18:00:00Z'),
          zoneId: zone!.id,
        })
        .returning();
      await db.insert(shiftSummaries).values({
        shiftSessionId: closed!.id,
        employeeId: person!.id,
        businessDate: '2026-09-12',
        totalMinutes: 780,
        workMinutes: 780,
        preparationMinutes: 0,
        serviceMinutes: 0,
        breakMinutes: 0,
        mealMinutes: 0,
        downtimeMinutes: 0,
        overtimeMinutes: 60,
        overtimePending: true,
      });
      const [incident] = await db
        .insert(downtimeIncidents)
        .values({
          siteId: layout[key],
          orgUnitId: unit!.id,
          zoneId: zone!.id,
          reasonCode: 'BREAKDOWN',
          openedAt: new Date('2026-09-13T08:00:00Z'),
          slaDueAt: new Date('2026-09-13T08:30:00Z'),
        })
        .returning();
      const [request] = await db
        .insert(requests)
        .values({ type: 'DAY_OFF', employeeId: person!.id, periodFrom: '2026-09-20' })
        .returning();
      ids[key] = { shift: open!.id, incident: incident!.id, request: request!.id };
    }
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  it('AC-001: open shifts, incidents, incident stats, overtime and requests follow the grant', async () => {
    const shiftIds = async (s: AccessScope) =>
      (await shifts.listActive({ scope: 'OPEN' }, now, s)).map((r) => r.id).sort();
    expect(await shiftIds({ all: true })).toHaveLength(3);
    expect(await shiftIds(master(place.A.unit))).toEqual([ids.A.shift]);
    expect(await shiftIds(head(place.A.site))).toEqual([ids.A.shift, ids.B.shift].sort());

    const incidentIds = async (s: AccessScope) =>
      (await incidents.list({ scope: 'open' }, now, s)).map((r) => r.id).sort();
    expect(await incidentIds(master(place.B.unit))).toEqual([ids.B.incident]);
    expect(await incidentIds(head(place.C.site))).toEqual([ids.C.incident]);
    const stats = await incidents.stats(
      { from: '2026-09-13T00:00:00Z', to: '2026-09-14T00:00:00Z' },
      'en',
      now,
      master(place.A.unit),
    );
    expect(stats.totals.incidents).toBe(1);

    const overtime = await requestsService.overtime('pending', master(place.C.unit));
    expect(overtime.map((o) => o.employeeName)).toEqual(['Worker C']);
    expect(await requestsService.overtime('pending', head(place.A.site))).toHaveLength(2);

    const inbox = await requestsService.list(
      { scope: 'all' },
      { roles: ['SHIFT_MASTER'] },
      now,
      master(place.A.unit),
    );
    expect(inbox.map((r) => r.id)).toEqual([ids.A.request]);
  });

  it('AC-002: identifiers outside the scope are forbidden, missing ones stay not found', async () => {
    const scope = master(place.A.unit);
    expect(() => assertInScope(scope, null)).toThrow(DomainError);
    assertInScope(scope, await shifts.placeOf(ids.A.shift));
    const foreign = [
      await shifts.placeOf(ids.B.shift),
      await incidents.incidentPlace(ids.C.incident),
      await requestsService.requestPlace(ids.B.request),
    ];
    for (const target of foreign) {
      expect(() => assertInScope(scope, target)).toThrow(
        expect.objectContaining({ code: 'OUT_OF_SCOPE', status: 403 }),
      );
    }
    expect(await shifts.placeOf('a0000000-0000-4000-8000-00000000dead')).toBeNull();
  });

  it('AC-002: query filters outside the scope are forbidden, own site and unit are allowed', async () => {
    const scope = master(place.A.unit);
    await expect(
      shifts.assertFilters(scope, {
        siteId: place.A.site,
        orgUnitId: place.A.unit,
        zoneId: place.A.zone,
      }),
    ).resolves.toBeUndefined();
    for (const filters of [
      { siteId: place.C.site },
      { orgUnitId: place.B.unit },
      { zoneId: place.B.zone },
    ]) {
      await expect(shifts.assertFilters(scope, filters)).rejects.toMatchObject({
        code: 'OUT_OF_SCOPE',
        status: 403,
      });
    }
    await expect(
      incidents.assertFilters(head(place.A.site), { orgUnitId: place.B.unit }),
    ).resolves.toBeUndefined();
    await expect(
      incidents.assertFilters({ all: true }, { siteId: place.C.site }),
    ).resolves.toBeUndefined();
  });

  it('AC-002: a photo that is not an incident report photo has no place for a scoped reader', async () => {
    expect(await incidents.mediaPlace('a0000000-0000-4000-8000-00000000beef')).toEqual({});
    expect(() => assertInScope(master(place.A.unit), {})).toThrow(DomainError);
  });

  it('AC-003: a scoped subscriber receives only events placed in its scope', async () => {
    const bus = new Subject<{ incidentId: string }>();
    const received = firstValueFrom(
      scopedEvents(bus.asObservable(), master(place.A.unit), (e) =>
        incidents.incidentPlace(e.incidentId),
      ).pipe(take(2), toArray(), timeout(5_000)),
    );
    bus.next({ incidentId: ids.B.incident });
    bus.next({ incidentId: ids.A.incident });
    bus.next({ incidentId: ids.C.incident });
    bus.next({ incidentId: 'a0000000-0000-4000-8000-00000000dead' });
    bus.next({ incidentId: ids.A.incident });
    expect((await received).map((e) => e.incidentId)).toEqual([ids.A.incident, ids.A.incident]);
  });
});
