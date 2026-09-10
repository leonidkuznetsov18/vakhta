import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  authUser,
  bonusPointAwards,
  bonusMonthClosures,
  employeePositions,
  employees,
  eq,
  notificationOutbox,
  orgUnits,
  positions,
  sites,
  sql,
  webUserRoles,
  type DbOrTx,
} from '@vakhta/db';
import { NotificationsService, type EnqueueInput } from '../notifications/notifications.service.js';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { BonusMonthService } from './bonus-month.service.js';
import { readMonthNominations } from './bonus-month-nominations.js';

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
    // Only the isolated test database bypasses immutable history while resetting fixtures.
    await testDb.db.execute(sql`ALTER TABLE bonus_month_closures DISABLE TRIGGER USER`);
    await testDb.db.execute(sql`TRUNCATE bonus_month_closures`);
    await testDb.db.execute(sql`ALTER TABLE bonus_month_closures ENABLE TRIGGER USER`);

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

  it('does not recrown another department after late checklist approvals', async () => {
    await service.closeMonth(siteId, MONTH, NOW);
    const [person] = await testDb.db
      .select()
      .from(employeePositions)
      .where(eq(employeePositions.orgUnitId, otherUnit));
    if (!person) throw new Error('Expected another department employee');
    await testDb.db.insert(bonusPointAwards).values({
      employeeId: person.employeeId,
      orgUnitId: otherUnit,
      month: MONTH,
      kind: 'CHECKLIST_APPROVED',
      points: 20,
    });
    const repeated = await service.closeMonth(siteId, MONTH, new Date('2026-09-03T06:00:00Z'));
    expect(repeated.unitOfMonth).toBe(bestUnit);
    expect(repeated.awarded).toBe(0);
    expect(repeated.cards).toBe(0);
  });

  it('keeps an empty finalized month empty after late approvals', async () => {
    const emptyMonth = '2026-07';
    const first = await service.closeMonth(siteId, emptyMonth, NOW);
    expect(first.unitOfMonth).toBeNull();
    const employeeId = best[0];
    if (!employeeId) throw new Error('Expected a fixture employee');
    await testDb.db.insert(bonusPointAwards).values({
      employeeId,
      orgUnitId: bestUnit,
      month: emptyMonth,
      kind: 'CHECKLIST_APPROVED',
      points: 10,
    });
    const repeated = await service.closeMonth(siteId, emptyMonth, NOW);
    expect(repeated.unitOfMonth).toBeNull();
    expect(repeated.awarded).toBe(0);
    expect(repeated.cards).toBe(0);
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

  it('freezes every nominee name, identity and score despite transfers and changed role holders', async () => {
    await service.closeMonth(siteId, MONTH, NOW);
    const final = await readMonthNominations(testDb.db, siteId, MONTH);
    expect(final.finalizedAt).toBe(NOW.toISOString());
    expect(final.employeeOfMonth?.id).toBe(best[0]);
    expect(final.masterOfMonth?.name).toBe('Master');
    await testDb.db.update(employees).set({ fullName: 'Renamed employee' });
    await testDb.db.update(orgUnits).set({ name: 'Renamed department' });
    await testDb.db.update(authUser).set({ name: 'Replacement name' });
    await testDb.db.update(employeePositions).set({ orgUnitId: otherUnit });
    await testDb.db.delete(webUserRoles);
    expect(await readMonthNominations(testDb.db, siteId, MONTH)).toEqual(final);
    expect((await service.closeMonth(siteId, MONTH, NOW)).awarded).toBe(0);
    expect(await testDb.db.select().from(notificationOutbox)).toHaveLength(4);
    expect((await readMonthNominations(testDb.db, null, MONTH)).finalizedAt).toBeNull();
  });

  it('aggregates a transferred employee across departments before choosing the employee nominee', async () => {
    const employeeId = best[1];
    if (!employeeId) throw new Error('Expected second employee');
    await testDb.db.insert(bonusPointAwards).values({
      employeeId,
      orgUnitId: otherUnit,
      month: MONTH,
      kind: 'CHECKLIST_APPROVED',
      points: 2,
    });
    await service.closeMonth(siteId, MONTH, NOW);
    const final = await readMonthNominations(testDb.db, siteId, MONTH);
    expect(final.unitOfMonth?.id).toBe(bestUnit);
    expect(final.employeeOfMonth).toMatchObject({ id: employeeId, points: 4 });
    expect(
      (await testDb.db.select().from(notificationOutbox)).filter(
        (row) => row.recipientId === employeeId,
      ),
    ).toHaveLength(1);
  });

  it('serializes concurrent closers and returns the existing final result to the retry', async () => {
    const results = await Promise.all([
      service.closeMonth(siteId, MONTH, NOW),
      new BonusMonthService(testDb.db, new NotificationsService()).closeMonth(siteId, MONTH, NOW),
    ]);
    expect(results.map((row) => row.awarded).sort()).toEqual([0, 4]);
    expect(results.map((row) => row.cards).sort()).toEqual([0, 4]);
    expect(await testDb.db.select().from(bonusMonthClosures)).toHaveLength(1);
  });

  it('also serializes concurrent empty closes', async () => {
    const results = await Promise.all([
      service.closeMonth(siteId, '2026-07', NOW),
      service.closeMonth(siteId, '2026-07', NOW),
    ]);
    expect(results.every((row) => row.unitOfMonth === null && row.awarded === 0)).toBe(true);
    expect(await testDb.db.select().from(bonusMonthClosures)).toHaveLength(1);
  });

  it('rolls back the final snapshot and all awards when notification creation fails', async () => {
    class FailedNotifications extends NotificationsService {
      override async enqueue(_tx: DbOrTx, _input: EnqueueInput): Promise<boolean> {
        throw new Error('Injected notification failure');
      }
    }
    await expect(
      new BonusMonthService(testDb.db, new FailedNotifications()).closeMonth(siteId, MONTH, NOW),
    ).rejects.toThrow('Injected notification failure');
    expect(await testDb.db.select().from(bonusMonthClosures)).toHaveLength(0);
    expect(
      await testDb.db
        .select()
        .from(bonusPointAwards)
        .where(eq(bonusPointAwards.kind, 'UNIT_OF_MONTH')),
    ).toHaveLength(0);
    expect(await testDb.db.select().from(notificationOutbox)).toHaveLength(0);
    expect((await service.closeMonth(siteId, MONTH, NOW)).awarded).toBe(4);
  });

  it('protects final decisions and their identity/points invariants in SQL', async () => {
    await service.closeMonth(siteId, MONTH, NOW);
    const [row] = await testDb.db.select().from(bonusMonthClosures);
    if (!row) throw new Error('Expected final snapshot');
    await expect(
      testDb.db
        .update(bonusMonthClosures)
        .set({ employeeName: 'Changed' })
        .where(eq(bonusMonthClosures.id, row.id)),
    ).rejects.toMatchObject({ cause: { code: '23001' } });
    await expect(
      testDb.db.delete(bonusMonthClosures).where(eq(bonusMonthClosures.id, row.id)),
    ).rejects.toMatchObject({ cause: { code: '23001' } });
    await expect(testDb.db.execute(sql`TRUNCATE bonus_month_closures`)).rejects.toMatchObject({
      cause: { code: '23001' },
    });
    await expect(
      testDb.db.insert(bonusMonthClosures).values({ ...row, id: randomUUID() }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
    await expect(
      testDb.db
        .insert(bonusMonthClosures)
        .values({ ...row, id: randomUUID(), month: '2026-06', employeePoints: null }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
  });

  it('rejects legacy monthly award writers at commit without a closure from their transaction', async () => {
    const employeeId = best[0]!;
    const legacy = () =>
      testDb.db.transaction(async (tx) => {
        await tx.insert(bonusPointAwards).values({
          employeeId,
          orgUnitId: otherUnit,
          month: '2026-07',
          kind: 'UNIT_OF_MONTH',
          points: 1,
        });
      });
    await expect(legacy()).rejects.toMatchObject({ code: '23514' });
    await service.closeMonth(siteId, '2026-07', NOW);
    await expect(legacy()).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects legacy monthly cards even when no monthly award is payable', async () => {
    const employeeId = best[0]!;
    const legacy = () =>
      testDb.db.transaction(async (tx) => {
        await new NotificationsService().enqueue(tx, {
          recipientType: 'EMPLOYEE',
          recipientId: employeeId,
          template: 'BONUS_MONTH_CARD',
          payload: { text: 'Legacy card' },
          dedupeKey: `bonus-month-card:${MONTH}:${employeeId}`,
        });
      });
    await expect(legacy()).rejects.toMatchObject({ code: '23514' });
    expect(await testDb.db.select().from(notificationOutbox)).toHaveLength(0);
  });

  it('cannot bypass immutable history by shadowing guard tables in the temporary schema', async () => {
    await service.closeMonth(siteId, MONTH, NOW);
    await expect(
      testDb.db.transaction(async (tx) => {
        await tx.execute(sql`CREATE TEMP TABLE bonus_month_closures (id uuid) ON COMMIT DROP`);
        await tx.execute(sql`TRUNCATE public.bonus_month_closures`);
      }),
    ).rejects.toMatchObject({ cause: { code: '23001' } });
    expect(await testDb.db.select().from(bonusMonthClosures)).toHaveLength(1);
  });

  it('refuses the migration guard when historical monthly awards or cards already exist', async () => {
    const migration = await readFile(
      new URL('../../../../packages/db/drizzle/0026_bonus_month_closures.sql', import.meta.url),
      'utf8',
    );
    const guard = migration.split('--> statement-breakpoint')[1];
    if (!guard) throw new Error('Expected migration guard');
    await service.closeMonth(siteId, MONTH, NOW);
    await expect(testDb.db.execute(sql.raw(guard))).rejects.toMatchObject({
      cause: { code: 'P0001' },
    });
  });
});
