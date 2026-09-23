import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  and,
  domainEvents,
  eq,
  openSlots,
  schedulePatterns,
  shiftAssignments,
  shiftTemplates,
  sql,
  zoneStaffingRequirements,
} from '@vakhta/db';
import {
  ShiftPeriod,
  ShiftTemplateError,
  ShiftTemplateEvent,
  addMonths,
  businessDateOf,
} from '@vakhta/domain';
import { ShiftKindSchema } from '@vakhta/contracts';
import type { WebUser } from '../auth/web-auth.guard.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { EmployeesService } from '../identity/employees.service.js';
import { TimerScheduler } from '../infra/timers.queue.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { OrgService } from '../org/org.service.js';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { ScheduleService } from './schedule.service.js';
import { TemplatesService } from './templates.service.js';

const SYSTEM = { type: 'WEB_USER', id: null, role: 'ADMIN', label: 'setup' } as const;
const TZ = 'Europe/Kyiv';
const MONTH = addMonths(businessDateOf(new Date(), TZ).slice(0, 7), 1);
const day = (n: number) => `${MONTH}-${String(n).padStart(2, '0')}`;
const MORNING = {
  name: 'Ранкова',
  period: ShiftPeriod.DAY,
  localStart: '05:00',
  localEnd: '13:00',
};

describe('unit shift templates (spec 013)', () => {
  let testDb: TestDatabase;
  let org: OrgService;
  let templates: TemplatesService;
  let schedule: ScheduleService;
  let employeesService: EmployeesService;
  let siteId: string;
  let unitId: string;
  let otherUnitId: string;
  let zoneId: string;
  let dayId: string;
  let workerId: string;

  const admin: WebUser = {
    id: randomUUID(),
    name: 'Admin',
    email: 'admin@example.test',
    twoFactorEnabled: true,
    grants: [{ role: 'ADMIN', scopeType: 'ENTERPRISE', scopeId: null }],
  };
  const master = (): WebUser => ({
    ...admin,
    id: randomUUID(),
    grants: [{ role: 'SHIFT_MASTER', scopeType: 'ORG_UNIT', scopeId: unitId }],
  });

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const events = new EventStore();
    const audit = new AuditLog();
    org = new OrgService(testDb.db, events, audit);
    templates = new TemplatesService(testDb.db, events, audit, org);
    employeesService = new EmployeesService(testDb.db, events, audit, new NotificationsService());
    schedule = new ScheduleService(
      testDb.db,
      events,
      audit,
      org,
      templates,
      new NotificationsService(),
      new TimerScheduler(),
      { shiftReminderMinutes: 120, defaultTimezone: TZ },
    );
  }, 180_000);

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE open_slots, schedule_patterns, zone_staffing_requirements, shift_assignments, schedule_versions, shift_templates, employees, responsibility_zones, org_units, sites CASCADE`,
    );
    siteId = (await org.createSite({ code: 'main', name: 'Main', timezone: TZ }, SYSTEM)).id;
    unitId = (await org.createOrgUnit({ siteId, name: 'Cups' }, SYSTEM)).id;
    otherUnitId = (await org.createOrgUnit({ siteId, name: 'Store' }, SYSTEM)).id;
    zoneId = (
      await org.createZone(
        { siteId, orgUnitId: unitId, code: 'L1', name: 'Line 1', type: 'FILLING', isShared: false },
        SYSTEM,
      )
    ).id;
    dayId = (
      await templates.create(
        {
          siteId,
          code: 'DAY',
          name: 'Day',
          period: ShiftPeriod.DAY,
          localStart: '08:00',
          localEnd: '20:00',
        },
        SYSTEM,
      )
    ).id;
    workerId = (
      await employeesService.create(
        { personnelNumber: '1', fullName: 'Worker', status: 'ACTIVE' },
        SYSTEM,
      )
    ).id;
  });

  const assignment = (templateId: string, date = day(3)) => ({
    employeeId: workerId,
    templateId,
    businessDate: date,
    zoneId,
    kind: ShiftKindSchema.enum.REGULAR,
  });

  async function planned(templateId: string) {
    const version = await schedule.createVersion(
      { siteId, orgUnitId: unitId, periodMonth: MONTH },
      SYSTEM,
    );
    await schedule.putAssignments(version.id, { items: [assignment(templateId)] }, SYSTEM);
    return version.id;
  }

  async function storedAssignment(versionId: string) {
    const [row] = await testDb.db
      .select()
      .from(shiftAssignments)
      .where(eq(shiftAssignments.scheduleVersionId, versionId));
    if (!row) throw new Error('assignment missing');
    return row;
  }

  it('offers a unit shift only with that unit, next to the site defaults', async () => {
    const own = await templates.createForUnit(unitId, MORNING, admin);
    expect(own).toMatchObject({ orgUnitId: unitId, period: ShiftPeriod.DAY, revision: 1 });
    expect(own.code).toMatch(/^U_[0-9A-F]{32}$/);

    const forUnit = await templates.list({ siteId, orgUnitId: unitId });
    const forOther = await templates.list({ siteId, orgUnitId: otherUnitId });
    expect(forUnit.map((t) => t.id).sort()).toEqual([dayId, own.id].sort());
    expect(forOther.map((t) => t.id)).toEqual([dayId]);
  });

  it('lets only an administrator in scope manage unit shifts', async () => {
    const own = await templates.createForUnit(unitId, MORNING, admin);
    await expect(templates.createForUnit(unitId, MORNING, master())).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      templates.update(own.id, { ...MORNING, revision: 1, name: 'X' }, master()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(templates.remove(own.id, 1, master())).rejects.toMatchObject({ status: 403 });
  });

  it('keeps current names unique per unit, unnamed shifts by their hours', async () => {
    await templates.createForUnit(unitId, MORNING, admin);
    await expect(
      templates.createForUnit(unitId, { ...MORNING, name: 'ранкова', localEnd: '14:00' }, admin),
    ).rejects.toMatchObject({ code: ShiftTemplateError.NAME_TAKEN });
    await templates.createForUnit(otherUnitId, MORNING, admin);

    await templates.createForUnit(unitId, { ...MORNING, name: '', localStart: '12:00' }, admin);
    await expect(
      templates.createForUnit(unitId, { ...MORNING, name: '', localStart: '12:00' }, admin),
    ).rejects.toMatchObject({ code: ShiftTemplateError.NAME_TAKEN });
  });

  it('rejects stale edits and site defaults', async () => {
    const own = await templates.createForUnit(unitId, MORNING, admin);
    await templates.update(own.id, { ...MORNING, name: 'Early', revision: 1 }, admin);
    await expect(
      templates.update(own.id, { ...MORNING, name: 'Late', revision: 1 }, admin),
    ).rejects.toMatchObject({ code: ShiftTemplateError.STALE });
    await expect(templates.remove(dayId, 1, admin)).rejects.toMatchObject({
      code: ShiftTemplateError.DEFAULT,
    });
  });

  it('enforces the full-day rule and the unit site in SQL', async () => {
    await expect(
      testDb.db.insert(shiftTemplates).values({
        siteId,
        orgUnitId: unitId,
        code: 'BAD_FULL_DAY',
        name: 'Bad',
        period: ShiftPeriod.FULL_DAY,
        localStart: '08:00',
        localEnd: '20:00',
      }),
    ).rejects.toThrow();
    const otherSite = await org.createSite({ code: 'far', name: 'Far', timezone: TZ }, SYSTEM);
    await expect(
      testDb.db.insert(shiftTemplates).values({
        siteId: otherSite.id,
        orgUnitId: unitId,
        code: 'CROSS_SITE',
        name: 'Cross',
        period: ShiftPeriod.DAY,
        localStart: '08:00',
        localEnd: '16:00',
      }),
    ).rejects.toThrow();
  });

  it('edits an unused shift in place', async () => {
    const own = await templates.createForUnit(unitId, MORNING, admin);
    const edited = await templates.update(
      own.id,
      { ...MORNING, localStart: '06:00', localEnd: '14:00', revision: 1 },
      admin,
    );
    expect(edited).toMatchObject({ id: own.id, localStart: '06:00', revision: 2 });
  });

  it('replaces a used shift so planned assignments keep their hours', async () => {
    const own = await templates.createForUnit(unitId, MORNING, admin);
    const versionId = await planned(own.id);
    const before = await storedAssignment(versionId);
    const [pattern] = await testDb.db
      .insert(schedulePatterns)
      .values({ siteId, name: 'Mornings', definition: { pattern: 'SINGLE', templateId: own.id } })
      .returning();

    const next = await templates.update(
      own.id,
      { ...MORNING, localStart: '06:00', localEnd: '14:00', revision: 1 },
      admin,
    );
    expect(next.id).not.toBe(own.id);
    const [retired] = await testDb.db
      .select()
      .from(shiftTemplates)
      .where(eq(shiftTemplates.id, own.id));
    expect(retired).toMatchObject({ isActive: false, replacedById: next.id });
    expect(retired?.retiredAt).toBeInstanceOf(Date);

    // Re-saving the month leaves the planned shift on its original version and hours.
    await schedule.putAssignments(versionId, { items: [assignment(own.id)] }, SYSTEM);
    const after = await storedAssignment(versionId);
    expect(after.templateId).toBe(own.id);
    expect(after.planStartAt).toEqual(before.planStartAt);
    expect(after.planEndAt).toEqual(before.planEndAt);

    // A new person-day may not use the retired version, only its successor.
    await expect(
      schedule.putAssignments(
        versionId,
        { items: [assignment(own.id), assignment(own.id, day(4))] },
        SYSTEM,
      ),
    ).rejects.toMatchObject({ code: ShiftTemplateError.RETIRED });
    await schedule.putAssignments(
      versionId,
      { items: [assignment(own.id), assignment(next.id, day(4))] },
      SYSTEM,
    );

    const [moved] = await testDb.db
      .select()
      .from(schedulePatterns)
      .where(eq(schedulePatterns.id, pattern?.id ?? ''));
    expect(moved?.definition).toMatchObject({ templateId: next.id });
    const events = await testDb.db
      .select({ type: domainEvents.type })
      .from(domainEvents)
      .where(
        and(
          eq(domainEvents.type, ShiftTemplateEvent.REPLACED),
          sql`${domainEvents.payload}->>'id' = ${next.id}`,
        ),
      );
    expect(events).toHaveLength(1);
  });

  it('carries running staffing demand to the new version from today', async () => {
    const own = await templates.createForUnit(unitId, MORNING, admin);
    await planned(own.id);
    const today = businessDateOf(new Date(), TZ);
    const started = `${addMonths(today.slice(0, 7), -1)}-01`;
    await testDb.db.insert(zoneStaffingRequirements).values({
      zoneId,
      templateId: own.id,
      requiredCount: 2,
      effectiveFrom: started,
    });

    const next = await templates.update(
      own.id,
      { ...MORNING, localStart: '06:00', localEnd: '14:00', revision: 1 },
      admin,
    );
    const rows = await testDb.db
      .select()
      .from(zoneStaffingRequirements)
      .orderBy(zoneStaffingRequirements.effectiveFrom);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ templateId: own.id, effectiveFrom: started });
    expect(rows[0]?.effectiveTo).not.toBeNull();
    expect(rows[1]).toMatchObject({
      templateId: next.id,
      effectiveFrom: today,
      effectiveTo: null,
      requiredCount: 2,
    });
  });

  it('retires a used shift on delete and removes an unused one', async () => {
    const used = await templates.createForUnit(unitId, MORNING, admin);
    const unused = await templates.createForUnit(unitId, { ...MORNING, name: 'Spare' }, admin);
    const versionId = await planned(used.id);

    await templates.remove(used.id, 1, admin);
    await templates.remove(unused.id, 1, admin);

    const current = await templates.list({ siteId, orgUnitId: unitId });
    expect(current.map((t) => t.id)).toEqual([dayId]);
    const history = await templates.list({ siteId, orgUnitId: unitId, includeRetired: true });
    expect(history.find((t) => t.id === used.id)).toMatchObject({ isActive: false, usedCount: 1 });
    expect(history.some((t) => t.id === unused.id)).toBe(false);

    // The month stays saveable with the planned shift of the deleted template.
    await schedule.putAssignments(versionId, { items: [assignment(used.id)] }, SYSTEM);
  });

  it('retires a successor that is deleted, keeping the chain from planned history', async () => {
    const own = await templates.createForUnit(unitId, MORNING, admin);
    await planned(own.id);
    const next = await templates.update(
      own.id,
      { ...MORNING, localStart: '06:00', localEnd: '14:00', revision: 1 },
      admin,
    );
    await templates.remove(next.id, next.revision, admin);
    const [successor] = await testDb.db
      .select()
      .from(shiftTemplates)
      .where(eq(shiftTemplates.id, next.id));
    expect(successor).toMatchObject({ isActive: false });
    expect(successor?.retiredAt).toBeInstanceOf(Date);
  });

  it('keeps a retired version usable on its planned and offered dates', async () => {
    const own = await templates.createForUnit(unitId, MORNING, admin);
    const versionId = await planned(own.id);
    const colleague = (
      await employeesService.create(
        { personnelNumber: '2', fullName: 'Colleague', status: 'ACTIVE' },
        SYSTEM,
      )
    ).id;
    await testDb.db.insert(openSlots).values({
      siteId,
      orgUnitId: unitId,
      periodMonth: MONTH,
      businessDate: day(9),
      templateId: own.id,
      zoneId,
    });
    await templates.update(
      own.id,
      { ...MORNING, localStart: '06:00', localEnd: '14:00', revision: 1 },
      admin,
    );
    // A swap moves the planned shift to another person on the same date; a slot fills its date.
    await schedule.putAssignments(
      versionId,
      {
        items: [
          { ...assignment(own.id), employeeId: colleague },
          { ...assignment(own.id, day(9)), employeeId: workerId },
        ],
      },
      SYSTEM,
    );
    await expect(
      schedule.putAssignments(versionId, { items: [assignment(own.id, day(10))] }, SYSTEM),
    ).rejects.toMatchObject({ code: ShiftTemplateError.RETIRED });
  });

  it('refuses another unit’s shift in a schedule', async () => {
    const foreign = await templates.createForUnit(otherUnitId, MORNING, admin);
    const version = await schedule.createVersion(
      { siteId, orgUnitId: unitId, periodMonth: MONTH },
      SYSTEM,
    );
    await expect(
      schedule.putAssignments(version.id, { items: [assignment(foreign.id)] }, SYSTEM),
    ).rejects.toMatchObject({ code: ShiftTemplateError.OUT_OF_UNIT });
    await schedule.putAssignments(version.id, { items: [assignment(dayId)] }, SYSTEM);
  });

  it('plans a full-day shift as 24 hours', async () => {
    const fullDay = await templates.createForUnit(
      unitId,
      { name: 'Доба', period: ShiftPeriod.FULL_DAY, localStart: '08:00', localEnd: '08:00' },
      admin,
    );
    const row = await storedAssignment(await planned(fullDay.id));
    expect(row.planEndAt.getTime() - row.planStartAt.getTime()).toBeGreaterThanOrEqual(
      23 * 3_600_000,
    );
    expect(row.planEndAt.getTime() - row.planStartAt.getTime()).toBeLessThanOrEqual(25 * 3_600_000);
  });
});
