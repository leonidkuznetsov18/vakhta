import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  activityIntervals,
  domainEvents,
  downtimeIncidents,
  employeePositions,
  employees,
  orgUnits,
  positions,
  qrTerminals,
  responsibilityZones,
  scheduleVersions,
  shiftAssignments,
  shiftSessions,
  shiftTemplates,
  sites,
} from '@vakhta/db';
import type { RoleGrant } from '@vakhta/domain';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { OverviewService } from './overview.service.js';
import { ShiftPeriod } from '@vakhta/domain';

/**
 * Spec 004 US2–US6 on a real database: one site, two units, 11:45 local on 13.09.2026.
 * U1 plans three people (present, missing, expected later) and has one unscheduled worker;
 * U2 plans one person who stands in downtime. Two incidents, one paired silent kiosk.
 */
describe('overview snapshot (spec 004)', () => {
  let testDb: TestDatabase;
  let service: OverviewService;
  const now = new Date('2026-09-13T08:45:00Z');
  const ids: Record<string, string> = {};

  const admin: RoleGrant[] = [{ role: 'ADMIN', scopeType: 'ENTERPRISE', scopeId: null }];
  const master = (): RoleGrant[] => [
    { role: 'SHIFT_MASTER', scopeType: 'ORG_UNIT', scopeId: ids.u2! },
  ];

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const db = testDb.db;
    service = new OverviewService(db, {
      lateGraceMinutes: 10,
      closingGraceMinutes: 120,
      downtimeEscalationMinutes: 15,
      rotationSeconds: 45,
      defaultTimezone: 'Europe/Kyiv',
    });
    const [site] = await db
      .insert(sites)
      .values({ code: 'p1', name: 'Plant 1', timezone: 'Europe/Kyiv' })
      .returning();
    ids.site = site!.id;
    const [u1, u2] = await db
      .insert(orgUnits)
      .values([
        { siteId: site!.id, name: 'Lathe shop' },
        { siteId: site!.id, name: 'Packing' },
      ])
      .returning();
    ids.u1 = u1!.id;
    ids.u2 = u2!.id;
    const [z1, z2, z3] = await db
      .insert(responsibilityZones)
      .values([
        { siteId: site!.id, orgUnitId: u1!.id, code: 'L1', name: 'Lathe 1' },
        { siteId: site!.id, orgUnitId: u1!.id, code: 'L2', name: 'Lathe 2' },
        { siteId: site!.id, orgUnitId: u2!.id, code: 'P1', name: 'Packing line' },
      ])
      .returning();
    ids.z3 = z3!.id;
    const [day] = await db
      .insert(shiftTemplates)
      .values([
        {
          siteId: site!.id,
          code: 'DAY',
          name: 'Day',
          localStart: '08:00',
          period: ShiftPeriod.DAY,
          localEnd: '20:00',
        },
        {
          siteId: site!.id,
          code: 'NIGHT',
          name: 'Night',
          localStart: '20:00',
          localEnd: '08:00',
          period: ShiftPeriod.NIGHT,
        },
      ])
      .returning();
    const [v1, v2] = await db
      .insert(scheduleVersions)
      .values([
        {
          siteId: site!.id,
          orgUnitId: u1!.id,
          periodMonth: '2026-09',
          versionNo: 1,
          status: 'PUBLISHED',
        },
        {
          siteId: site!.id,
          orgUnitId: u2!.id,
          periodMonth: '2026-09',
          versionNo: 1,
          status: 'PUBLISHED',
        },
      ])
      .returning();
    const [position] = await db
      .insert(positions)
      .values({ code: 'OP', name: 'Operator' })
      .returning();
    const people = await db
      .insert(employees)
      .values(
        ['Present Anna', 'Missing Boris', 'Later Clara', 'Stopped Denys', 'Unplanned Eva'].map(
          (fullName, i) => ({ personnelNumber: `E${i}`, fullName }),
        ),
      )
      .returning();
    const [anna, boris, clara, denys, eva] = people;
    await db.insert(employeePositions).values(
      people.map((p, i) => ({
        employeeId: p.id,
        orgUnitId: i === 3 ? u2!.id : u1!.id,
        positionId: position!.id,
        validFrom: new Date('2026-01-01T00:00:00Z'),
      })),
    );
    const plan = (
      employeeId: string,
      zoneId: string,
      unit: string,
      version: string,
      start = '2026-09-13T05:00:00Z',
    ) => ({
      scheduleVersionId: version,
      employeeId,
      templateId: day!.id,
      businessDate: '2026-09-13',
      planStartAt: new Date(start),
      planEndAt: new Date('2026-09-13T17:00:00Z'),
      orgUnitId: unit,
      zoneId,
    });
    const assignments = await db
      .insert(shiftAssignments)
      .values([
        plan(anna!.id, z1!.id, u1!.id, v1!.id),
        plan(boris!.id, z1!.id, u1!.id, v1!.id),
        plan(clara!.id, z2!.id, u1!.id, v1!.id, '2026-09-13T09:00:00Z'),
        plan(denys!.id, z3!.id, u2!.id, v2!.id),
      ])
      .returning();
    await db.insert(shiftSessions).values([
      {
        employeeId: anna!.id,
        assignmentId: assignments[0]!.id,
        businessDate: '2026-09-13',
        state: 'WORKING',
        startedAt: new Date('2026-09-13T05:02:00Z'),
        zoneId: z1!.id,
      },
      {
        employeeId: eva!.id,
        businessDate: '2026-09-13',
        state: 'WORKING',
        startedAt: new Date('2026-09-13T05:30:00Z'),
        zoneId: z2!.id,
      },
    ]);
    const [stopped] = await db
      .insert(shiftSessions)
      .values({
        employeeId: denys!.id,
        assignmentId: assignments[3]!.id,
        businessDate: '2026-09-13',
        state: 'DOWNTIME',
        resumeState: 'WORKING',
        startedAt: new Date('2026-09-13T05:00:00Z'),
        zoneId: z3!.id,
      })
      .returning();
    await db.insert(activityIntervals).values([
      {
        shiftSessionId: stopped!.id,
        state: 'WORKING',
        startedAt: new Date('2026-09-13T05:00:00Z'),
        endedAt: new Date('2026-09-13T08:30:00Z'),
      },
      {
        shiftSessionId: stopped!.id,
        state: 'DOWNTIME',
        reasonCode: 'AIR',
        startedAt: new Date('2026-09-13T08:30:00Z'),
      },
    ]);
    await db.insert(downtimeIncidents).values([
      {
        siteId: site!.id,
        orgUnitId: u2!.id,
        zoneId: z3!.id,
        reasonCode: 'AIR',
        status: 'ACKNOWLEDGED',
        openedAt: new Date('2026-09-13T07:00:00Z'),
        acknowledgedAt: new Date('2026-09-13T07:04:00Z'),
        slaDueAt: new Date('2026-09-13T07:30:00Z'),
      },
      {
        siteId: site!.id,
        orgUnitId: u1!.id,
        zoneId: z1!.id,
        reasonCode: 'BREAKDOWN',
        openedAt: new Date('2026-09-13T08:00:00Z'),
        slaDueAt: new Date('2026-09-13T08:30:00Z'),
      },
    ]);
    const incidentRows = await db
      .select({ id: downtimeIncidents.id, zoneId: downtimeIncidents.zoneId })
      .from(downtimeIncidents);
    const packing = incidentRows.find((i) => i.zoneId === z3!.id)!;
    const lathe = incidentRows.find((i) => i.zoneId === z1!.id)!;
    await db.insert(domainEvents).values([
      {
        type: 'INCIDENT_REPORTED',
        occurredAt: new Date('2026-09-13T07:00:00Z'),
        source: 'TELEGRAM',
        incidentId: packing.id,
        zoneId: z3!.id,
        employeeId: denys!.id,
        reasonCode: 'AIR',
        comment: 'private note that must not leave the server',
      },
      {
        type: 'INCIDENT_STATUS_CHANGED',
        occurredAt: new Date('2026-09-13T07:04:00Z'),
        source: 'WEB',
        incidentId: packing.id,
        zoneId: z3!.id,
        payload: { from: 'REPORTED', to: 'ACKNOWLEDGED' },
      },
      {
        type: 'INCIDENT_STATUS_CHANGED',
        occurredAt: new Date('2026-09-13T07:05:00Z'),
        source: 'WEB',
        incidentId: packing.id,
        payload: { from: 'ACKNOWLEDGED', to: 'IN_PROGRESS' },
      },
      {
        type: 'INCIDENT_REPORTED',
        occurredAt: new Date('2026-09-13T08:00:00Z'),
        source: 'TELEGRAM',
        incidentId: lathe.id,
        zoneId: z1!.id,
      },
      {
        type: 'DOWNTIME_STARTED',
        occurredAt: new Date('2026-09-13T08:30:00Z'),
        source: 'TELEGRAM',
        shiftSessionId: stopped!.id,
        employeeId: denys!.id,
        zoneId: z3!.id,
        reasonCode: 'AIR',
      },
      {
        type: 'REQUEST_SUBMITTED',
        occurredAt: new Date('2026-09-13T08:31:00Z'),
        source: 'TELEGRAM',
        employeeId: denys!.id,
        comment: 'sick leave certificate',
      },
    ]);
    await db.insert(qrTerminals).values([
      {
        siteId: site!.id,
        name: 'Gate 1',
        deviceTokenHash: 'hash-1',
        lastSeenAt: new Date('2026-09-13T08:39:00Z'),
      },
      { siteId: site!.id, name: 'Gate 2' },
    ]);
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  it('AC-004/AC-014–AC-016/AC-020/AC-022: the enterprise view of the running day shift', async () => {
    const s = await service.snapshot(admin, {}, now);
    expect(s.contexts).toHaveLength(1);
    expect(s.contexts[0]!.current).toMatchObject({
      code: 'DAY',
      businessDate: '2026-09-13',
      staffed: true,
    });
    // Nobody is planned for tonight and nothing is recorded there: a day off is not shown as a shift.
    expect(s.contexts[0]!.next).toMatchObject({ code: 'NIGHT', staffed: false });
    expect(s.staffing).toMatchObject({
      planned: 4,
      present: 2,
      notArrived: 1,
      expected: 1,
      unscheduled: 1,
    });
    // The live-shift screen lists the no-show as a row, so the person carries the planned shift.
    expect(s.staffing!.notArrivedPeople).toMatchObject([
      {
        fullName: 'Missing Boris',
        personnelNumber: 'E1',
        orgUnitName: 'Lathe shop',
        planStartAt: '2026-09-13T05:00:00.000Z',
        planEndAt: '2026-09-13T17:00:00.000Z',
        zoneName: 'Lathe 1',
      },
    ]);
    expect(s.staffing!.unscheduledPeople.map((p) => p.fullName)).toEqual(['Unplanned Eva']);
    expect(s.downtime).toMatchObject({ zoneMinutes: 15, personMinutes: 15, incidents: 2 });
    expect(s.downtime!.byZone[0]).toMatchObject({ zoneName: 'Packing line', minutes: 15 });
    expect(s.timeToAction).toMatchObject({
      reported: 2,
      acknowledged: 1,
      medianMinutes: 4,
      awaiting: 1,
      awaitingBreached: 1,
    });
    expect(s.zones!.map((z) => `${z.zoneName}:${z.status}:${z.present}/${z.planned}`)).toEqual([
      'Packing line:DOWNTIME:1/1',
      'Lathe 1:UNDERSTAFFED:1/2',
      'Lathe 2:WORKING:1/0',
    ]);
    // The faces behind each zone count: who is there and who of the plan is not.
    expect(
      (s.zones ?? []).map(
        (z) =>
          `${z.zoneName}:${z.presentPeople.map((p) => p.fullName).join(',')}|${z.missingPeople.map((p) => p.fullName).join(',')}`,
      ),
    ).toEqual([
      'Packing line:Stopped Denys|',
      'Lathe 1:Present Anna|Missing Boris',
      'Lathe 2:Unplanned Eva|',
    ]);
    expect((s.staffing?.presentPeople ?? []).map((p) => p.fullName)).toEqual([
      'Present Anna',
      'Stopped Denys',
    ]);
    expect((s.staffing?.expectedPeople ?? []).map((p) => p.fullName)).toEqual(['Later Clara']);
    expect(s.terminals).toEqual([
      expect.objectContaining({ name: 'Gate 1', connectivity: 'OFFLINE', critical: true }),
      expect.objectContaining({ name: 'Gate 2', connectivity: 'UNPAIRED', critical: false }),
    ]);
    expect(s.setup).toEqual({ unlinkedEmployees: 5, unpairedTerminals: 1 });
    expect(s.handover).toEqual({ clean: 0, decided: 0, disputed: 0, pending: 0 });
  });

  it('AC-001/AC-007: a unit master sees only their unit and cannot select another', async () => {
    const s = await service.snapshot(master(), {}, now);
    expect(s.options.orgUnits.map((u) => u.name)).toEqual(['Packing']);
    expect(s.options.sites.map((x) => x.name)).toEqual(['Plant 1']);
    expect(s.staffing).toMatchObject({ planned: 1, present: 1, notArrived: 0, unscheduled: 0 });
    expect(s.timeToAction).toMatchObject({ reported: 1, awaiting: 0 });
    expect(s.zones!.map((z) => z.zoneName)).toEqual(['Packing line']);
    expect(s.setup).toEqual({ unlinkedEmployees: 1, unpairedTerminals: 1 });
    await expect(service.snapshot(master(), { orgUnitId: ids.u1 }, now)).rejects.toMatchObject({
      code: 'OUT_OF_SCOPE',
      status: 403,
    });
  });

  it('AC-008: selecting a unit narrows every section to it', async () => {
    const s = await service.snapshot(admin, { orgUnitId: ids.u1 }, now);
    expect(s.selection).toEqual({ siteId: ids.site, orgUnitId: ids.u1 });
    expect(s.staffing).toMatchObject({ planned: 3, present: 1, notArrived: 1, expected: 1 });
    expect(s.zones!.map((z) => z.zoneName)).toEqual(['Lathe 1', 'Lathe 2']);
    expect(s.downtime).toMatchObject({ zoneMinutes: 0, incidents: 1 });
  });

  it('D-09: sections a role cannot read are absent, not zero', async () => {
    const accountant = await service.snapshot(
      [{ role: 'ACCOUNTANT', scopeType: 'ENTERPRISE', scopeId: null }],
      {},
      now,
    );
    expect(accountant.staffing).toBeNull();
    expect(accountant.zones).toBeNull();
    expect(accountant.terminals).toBeNull();
    expect(accountant.setup).toBeNull();
    expect(accountant.timeToAction).not.toBeNull();
    const hr = await service.snapshot(
      [{ role: 'HR', scopeType: 'ENTERPRISE', scopeId: null }],
      {},
      now,
    );
    expect(hr.terminals).toBeNull();
    expect(hr.staffing).not.toBeNull();
  });

  it('AC-025/AC-026: events are allowlisted, scoped per source and carry no free text', async () => {
    const all = await service.events(admin, { limit: 30 }, now);
    expect(all.map((e) => `${e.kind}:${e.zoneName}`)).toEqual([
      'DOWNTIME_STARTED:Packing line',
      'INCIDENT_REPORTED:Lathe 1',
      'INCIDENT_ACKNOWLEDGED:Packing line',
      'INCIDENT_REPORTED:Packing line',
    ]);
    expect(all[0]!.target).toMatchObject({ section: 'operations', businessDate: '2026-09-13' });
    expect(all[3]).toMatchObject({
      employeeName: 'Stopped Denys',
      target: { section: 'incidents' },
    });
    expect(JSON.stringify(all)).not.toMatch(/private note|certificate/);

    const unit = await service.events(master(), { limit: 30 }, now);
    expect(unit.every((e) => e.zoneName === 'Packing line')).toBe(true);
    expect(unit).toHaveLength(3);
    await expect(
      service.events(master(), { orgUnitId: ids.u1, limit: 30 }, now),
    ).rejects.toMatchObject({
      code: 'OUT_OF_SCOPE',
    });

    const accountant = await service.events(
      [{ role: 'ACCOUNTANT', scopeType: 'ENTERPRISE', scopeId: null }],
      { limit: 30 },
      now,
    );
    expect(accountant.map((e) => e.kind)).not.toContain('DOWNTIME_STARTED');
    expect(await service.events(admin, { orgUnitId: ids.u1, limit: 30 }, now)).toHaveLength(1);
  });
});
