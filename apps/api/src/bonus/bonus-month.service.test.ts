import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  authUser,
  bonusPointAwards,
  employeePositions,
  employees,
  eq,
  notificationOutbox,
  orgUnits,
  positions,
  sites,
  sql,
  webUserRoles,
} from '@vakhta/db';
import { NotificationsService } from '../notifications/notifications.service.js';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { BonusMonthService } from './bonus-month.service.js';

const MONTH = '2026-08';
const NOW = new Date('2026-09-02T06:00:00Z');

describe('BonusMonthService', () => {
  let testDb: TestDatabase;
  let service: BonusMonthService;
  let siteId: string;
  let bestUnit: string;
  let otherUnit: string;
  let best: string[];
  let masterEmployee: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE bonus_point_awards, web_user_roles, auth_user, employee_positions, notification_outbox, employees, positions, org_units, sites CASCADE`,
    );
    service = new BonusMonthService(testDb.db, new NotificationsService());

    const [site] = await testDb.db
      .insert(sites)
      .values({ code: 'S1', name: 'Site', timezone: 'Europe/Kyiv' })
      .returning();
    siteId = site!.id;
    const units = await testDb.db
      .insert(orgUnits)
      .values([
        { siteId, name: 'Alpha' },
        { siteId, name: 'Beta' },
      ])
      .returning();
    bestUnit = units[0]!.id;
    otherUnit = units[1]!.id;
    const [position] = await testDb.db
      .insert(positions)
      .values({ code: 'OP', name: 'Operator' })
      .returning();

    const staff = await testDb.db
      .insert(employees)
      .values([
        { personnelNumber: 'A1', fullName: 'Alpha One' },
        { personnelNumber: 'A2', fullName: 'Alpha Two' },
        { personnelNumber: 'B1', fullName: 'Beta One' },
        { personnelNumber: 'M1', fullName: 'Master', email: 'master@vakhta.test' },
      ])
      .returning();
    best = [staff[0]!.id, staff[1]!.id];
    masterEmployee = staff[3]!.id;
    await testDb.db.insert(employeePositions).values([
      { employeeId: best[0]!, orgUnitId: bestUnit, positionId: position!.id, validFrom: NOW },
      { employeeId: best[1]!, orgUnitId: bestUnit, positionId: position!.id, validFrom: NOW },
      { employeeId: staff[2]!.id, orgUnitId: otherUnit, positionId: position!.id, validFrom: NOW },
      { employeeId: masterEmployee, orgUnitId: bestUnit, positionId: position!.id, validFrom: NOW },
    ]);

    // The master is a web user matched to their employee card by e-mail.
    const [user] = await testDb.db
      .insert(authUser)
      .values({ name: 'Master', email: 'Master@Vakhta.test' })
      .returning();
    await testDb.db.insert(webUserRoles).values({
      userId: user!.id,
      role: 'SHIFT_MASTER',
      scopeType: 'ORG_UNIT',
      scopeId: bestUnit,
    });

    // Alpha earns three checklist points, Beta one.
    await testDb.db.insert(bonusPointAwards).values([
      {
        employeeId: best[0]!,
        orgUnitId: bestUnit,
        month: MONTH,
        businessDate: '2026-08-04',
        kind: 'CHECKLIST_APPROVED',
        points: 1,
      },
      {
        employeeId: best[0]!,
        orgUnitId: bestUnit,
        month: MONTH,
        businessDate: '2026-08-05',
        kind: 'CHECKLIST_APPROVED',
        points: 1,
      },
      {
        employeeId: best[1]!,
        orgUnitId: bestUnit,
        month: MONTH,
        businessDate: '2026-08-06',
        kind: 'CHECKLIST_APPROVED',
        points: 1,
      },
      {
        employeeId: staff[2]!.id,
        orgUnitId: otherUnit,
        month: MONTH,
        businessDate: '2026-08-07',
        kind: 'CHECKLIST_APPROVED',
        points: 1,
      },
    ]);
  });

  it('crowns the unit with the most checklist points and pays everyone in it', async () => {
    const outcome = await service.closeMonth(siteId, MONTH, NOW);

    expect(outcome.unitOfMonth).toBe(bestUnit);
    const awards = await testDb.db
      .select()
      .from(bonusPointAwards)
      .where(eq(bonusPointAwards.kind, 'UNIT_OF_MONTH'));
    // Both Alpha employees and the master, who also holds a position in Alpha.
    expect(awards.map((a) => a.employeeId).sort()).toEqual([...best, masterEmployee].sort());
    const masterAwards = await testDb.db
      .select()
      .from(bonusPointAwards)
      .where(eq(bonusPointAwards.kind, 'MASTER_OF_MONTH'));
    expect(masterAwards).toHaveLength(1);
    expect(masterAwards[0]!.employeeId).toBe(masterEmployee);
  });

  it('writes a card for every employee who scored, and names the winners', async () => {
    await service.closeMonth(siteId, MONTH, NOW);

    const outbox = await testDb.db.select().from(notificationOutbox);
    expect(outbox).toHaveLength(4);
    const master = outbox.find((r) => r.recipientId === masterEmployee);
    expect(master?.template).toBe('BONUS_MONTH_MASTER');
    const winner = outbox.find((r) => r.recipientId === best[0]);
    expect(winner?.template).toBe('BONUS_MONTH_CARD');
    const text = (winner?.payload as { text: string }).text;
    expect(text).toContain(MONTH);
    expect(text).toContain('Alpha');
  });

  it('is idempotent: a repeated close adds no points and no cards', async () => {
    const first = await service.closeMonth(siteId, MONTH, NOW);
    const second = await service.closeMonth(siteId, MONTH, NOW);

    expect(first.awarded).toBeGreaterThan(0);
    expect(second.awarded).toBe(0);
    expect(second.cards).toBe(0);
    const outbox = await testDb.db.select().from(notificationOutbox);
    expect(outbox).toHaveLength(4);
  });

  it('does nothing before the close day of the new month', async () => {
    const outcomes = await service.closeDueMonths(new Date('2026-09-01T06:00:00Z'));
    expect(outcomes).toEqual([]);
    const awards = await testDb.db
      .select()
      .from(bonusPointAwards)
      .where(eq(bonusPointAwards.kind, 'UNIT_OF_MONTH'));
    expect(awards).toHaveLength(0);
  });

  it('closes the previous month once the site calendar has moved past it', async () => {
    const outcomes = await service.closeDueMonths(NOW);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.month).toBe(MONTH);
    expect(outcomes[0]!.unitOfMonth).toBe(bestUnit);
  });
});
