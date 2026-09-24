import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  domainEvents,
  employeePositions,
  employees,
  eq,
  equipment,
  maintenancePlanVersions,
  maintenancePlans,
  notificationOutbox,
  orgUnits,
  positions,
  requests,
  responsibilityZones,
  sites,
  sql,
  telegramAccounts,
  workOrders,
  type Transaction,
} from '@vakhta/db';
import {
  AnchorMode,
  IntervalUnit,
  PlanSourceKind,
  WorkPriority,
  WorkStatus,
  WorkType,
} from '@vakhta/domain';
import { startTestDatabase, type TestDatabase } from '../test/db.js';
import {
  handleEmergencyAckWithin,
  handleEmergencyEscalationWithin,
  handleMaintenanceReminderWithin,
} from './timers/maintenance.js';

const PLANNED_ON = '2026-10-15';
const FIRE_AT = '2026-10-08T06:00:00.000Z';
const AFTER_FIRE = new Date('2026-10-08T06:00:05Z');

function one<T>(rows: readonly T[]): T {
  const [row] = rows;
  if (row === undefined) throw new Error('expected a row');
  return row;
}

describe('worker: maintenance reminders and emergency escalation (spec 014)', () => {
  let testDb: TestDatabase;
  let mechanic: string;
  let backup: string;
  let master: string;
  let machineId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await testDb.stop();
  });

  function within<T>(run: (tx: Transaction) => Promise<T>): Promise<T> {
    return testDb.db.transaction(run);
  }

  async function person(name: string, positionId: string, unitId: string): Promise<string> {
    const row = one(
      await testDb.db
        .insert(employees)
        .values({ personnelNumber: name, fullName: name })
        .returning({ id: employees.id }),
    );
    await testDb.db.insert(employeePositions).values({
      employeeId: row.id,
      orgUnitId: unitId,
      positionId,
      validFrom: new Date('2026-01-01T00:00:00Z'),
    });
    await testDb.db
      .insert(telegramAccounts)
      .values({ employeeId: row.id, telegramUserId: Math.floor(Math.random() * 1e9) });
    return row.id;
  }

  async function plannedOrder() {
    const plan = one(
      await testDb.db
        .insert(maintenancePlans)
        .values({ equipmentId: machineId, title: 'Monthly lubrication', createdBy: 'test' })
        .returning(),
    );
    const version = one(
      await testDb.db
        .insert(maintenancePlanVersions)
        .values({
          planId: plan.id,
          revision: 1,
          intervalUnit: IntervalUnit.MONTH,
          intervalCount: 1,
          anchorMode: AnchorMode.FROM_COMPLETION,
          sourceKind: PlanSourceKind.PLANT_DECISION,
          sourceNote: 'Plant decision',
          estimatedMinutes: 60,
          requiresStop: true,
        })
        .returning(),
    );
    return one(
      await testDb.db
        .insert(workOrders)
        .values({
          type: WorkType.PLANNED_MAINTENANCE,
          planId: plan.id,
          planVersionId: version.id,
          priority: WorkPriority.P3,
          equipmentId: machineId,
          cycleKey: PLANNED_ON,
          title: 'Monthly lubrication',
          status: WorkStatus.ASSIGNED,
          dueOn: PLANNED_ON,
          plannedOn: PLANNED_ON,
          assigneeEmployeeId: mechanic,
        })
        .returning(),
    );
  }

  async function repair() {
    const reportedAt = new Date('2026-10-08T05:50:00Z');
    return one(
      await testDb.db
        .insert(workOrders)
        .values({
          type: WorkType.EMERGENCY_REPAIR,
          priority: WorkPriority.P1,
          equipmentId: machineId,
          title: 'Feed jam',
          description: 'Feed jam',
          status: WorkStatus.ASSIGNED,
          assigneeEmployeeId: mechanic,
          reportedAt,
          ackDueAt: new Date(FIRE_AT),
        })
        .returning(),
    );
  }

  async function outbox() {
    return testDb.db
      .select({
        template: notificationOutbox.template,
        recipientId: notificationOutbox.recipientId,
        payload: notificationOutbox.payload,
      })
      .from(notificationOutbox);
  }

  beforeEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE work_orders, maintenance_plan_versions, maintenance_plans, equipment, requests, notification_outbox, telegram_accounts, employee_positions, employees, positions, responsibility_zones, org_units, sites CASCADE`,
    );
    const site = one(
      await testDb.db
        .insert(sites)
        .values({ code: 'main', name: 'Main', timezone: 'Europe/Kyiv' })
        .returning(),
    );
    const unit = one(
      await testDb.db.insert(orgUnits).values({ siteId: site.id, name: 'Cups' }).returning(),
    );
    const zone = one(
      await testDb.db
        .insert(responsibilityZones)
        .values({ siteId: site.id, orgUnitId: unit.id, code: 'L1', name: 'Line 1' })
        .returning(),
    );
    const position = one(
      await testDb.db
        .insert(positions)
        .values({ code: 'MECHANIC', name: 'Mechanic', performsMaintenance: true })
        .returning(),
    );
    mechanic = await person('Mechanic One', position.id, unit.id);
    backup = await person('Mechanic Two', position.id, unit.id);
    master = await person('Master', position.id, unit.id);
    await testDb.db
      .update(orgUnits)
      .set({ masterEmployeeId: master })
      .where(eq(orgUnits.id, unit.id));
    machineId = one(
      await testDb.db
        .insert(equipment)
        .values({
          code: 'FB-100',
          codeKey: 'fb-100',
          name: 'Cup machine',
          siteId: site.id,
          orgUnitId: unit.id,
          zoneId: zone.id,
          criticality: 'HIGH',
          responsibleEmployeeId: mechanic,
          backupEmployeeId: backup,
        })
        .returning(),
    ).id;
  });

  describe('planned maintenance reminder', () => {
    it('reminds the assigned mechanic once, with the machine and the days left', async () => {
      const order = await plannedOrder();
      const job = { workOrderId: order.id, plannedOn: PLANNED_ON, offsetDays: 7, fireAt: FIRE_AT };
      expect(await within((tx) => handleMaintenanceReminderWithin(tx, job, AFTER_FIRE))).toBe(
        'queued',
      );
      expect(await within((tx) => handleMaintenanceReminderWithin(tx, job, AFTER_FIRE))).toBe(
        'duplicate',
      );
      const [sent] = await outbox();
      expect(sent).toMatchObject({ template: 'MAINTENANCE_REMINDER', recipientId: mechanic });
      expect(JSON.stringify(sent?.payload)).toContain('FB-100');
    });

    it('stays silent for re-planned, started or not yet due work', async () => {
      const order = await plannedOrder();
      const job = {
        workOrderId: order.id,
        plannedOn: '2026-10-10',
        offsetDays: 3,
        fireAt: FIRE_AT,
      };
      expect(await within((tx) => handleMaintenanceReminderWithin(tx, job, AFTER_FIRE))).toBe(
        'stale',
      );
      const early = { ...job, plannedOn: PLANNED_ON };
      const beforeFire = new Date('2026-10-08T05:59:00Z');
      expect(await within((tx) => handleMaintenanceReminderWithin(tx, early, beforeFire))).toBe(
        'stale',
      );
      await testDb.db
        .update(workOrders)
        .set({ status: WorkStatus.IN_PROGRESS })
        .where(eq(workOrders.id, order.id));
      expect(await within((tx) => handleMaintenanceReminderWithin(tx, early, AFTER_FIRE))).toBe(
        'stale',
      );
      expect(await outbox()).toEqual([]);
    });

    it('goes to the backup with a note when the mechanic is on approved leave (FR-045)', async () => {
      const order = await plannedOrder();
      await testDb.db.insert(requests).values({
        type: 'VACATION',
        employeeId: mechanic,
        status: 'APPROVED',
        periodFrom: '2026-10-12',
        periodTo: '2026-10-20',
      });
      const job = { workOrderId: order.id, plannedOn: PLANNED_ON, offsetDays: 3, fireAt: FIRE_AT };
      expect(await within((tx) => handleMaintenanceReminderWithin(tx, job, AFTER_FIRE))).toBe(
        'queued',
      );
      const [sent] = await outbox();
      expect(sent?.recipientId).toBe(backup);
      expect(JSON.stringify(sent?.payload)).toContain('Mechanic One');
    });
  });

  describe('emergency repair deadlines', () => {
    it('an unaccepted repair escalates to the backup and the master once', async () => {
      const order = await repair();
      const job = { workOrderId: order.id, fireAt: FIRE_AT };
      expect(await within((tx) => handleEmergencyAckWithin(tx, job, AFTER_FIRE))).toBe('queued');
      expect(await within((tx) => handleEmergencyAckWithin(tx, job, AFTER_FIRE))).toBe('duplicate');
      const sent = await outbox();
      expect(sent.map((row) => row.recipientId).sort()).toEqual([backup, master].sort());
      const [after] = await testDb.db.select().from(workOrders).where(eq(workOrders.id, order.id));
      expect(after?.escalatedAt).not.toBeNull();
      const events = await testDb.db
        .select({ type: domainEvents.type })
        .from(domainEvents)
        .where(eq(domainEvents.idempotencyKey, `WORK_ORDER_ACK_ESCALATED:${order.id}`));
      expect(events).toHaveLength(1);
    });

    it('an accepted repair neither escalates nor tells anyone', async () => {
      const order = await repair();
      await testDb.db
        .update(workOrders)
        .set({ acceptedAt: new Date('2026-10-08T05:55:00Z') })
        .where(eq(workOrders.id, order.id));
      const job = { workOrderId: order.id, fireAt: FIRE_AT };
      expect(await within((tx) => handleEmergencyAckWithin(tx, job, AFTER_FIRE))).toBe('stale');
      expect(await within((tx) => handleEmergencyEscalationWithin(tx, job, AFTER_FIRE))).toBe(
        'stale',
      );
      expect(await outbox()).toEqual([]);
    });

    it('the late escalation tells the master without accept buttons', async () => {
      const order = await repair();
      const job = { workOrderId: order.id, fireAt: FIRE_AT };
      expect(await within((tx) => handleEmergencyEscalationWithin(tx, job, AFTER_FIRE))).toBe(
        'queued',
      );
      const [sent] = await outbox();
      expect(sent?.recipientId).toBe(master);
      expect(sent?.payload).not.toHaveProperty('buttons');
    });
  });
});
