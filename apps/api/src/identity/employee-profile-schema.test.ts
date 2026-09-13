import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { employeeCompensationEntries, employees, orgUnits, sites, eq, sql } from '@vakhta/db';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';

describe('employee profile database invariants', () => {
  let test: TestDatabase;
  let employeeId: string;
  let unitId: string;
  const actor = randomUUID();
  beforeAll(async () => {
    test = await startTestDatabase();
    const [employee] = await test.db
      .insert(employees)
      .values({ personnelNumber: 'PROFILE', fullName: 'Synthetic employee' })
      .returning();
    const [site] = await test.db
      .insert(sites)
      .values({ code: 'PROFILE', name: 'Synthetic site', timezone: 'Europe/Kyiv' })
      .returning();
    if (!employee || !site) throw new Error('Fixture missing');
    employeeId = employee.id;
    const [unit] = await test.db
      .insert(orgUnits)
      .values({ siteId: site.id, name: 'Unit' })
      .returning();
    if (!unit) throw new Error('Unit missing');
    unitId = unit.id;
  }, 180_000);
  afterAll(async () => {
    await test?.stop();
  });
  const entry = () => ({
    employeeId,
    effectiveFrom: '2026-09-01',
    employmentRate: '1.00',
    hourlyRate: '100.00',
    createdBy: actor,
  });
  it('rejects invalid rates, amounts, currency and missing compensation', async () => {
    for (const override of [
      { employmentRate: '0' },
      { employmentRate: '0.001' },
      { hourlyRate: '1.001' },
      { monthlySalary: '5.999' },
      { employmentRate: '1.01' },
      { hourlyRate: '-1' },
      { hourlyRate: null, monthlySalary: null },
      { currency: 'USD' },
    ]) {
      await expect(
        test.db.insert(employeeCompensationEntries).values({ ...entry(), ...override }),
      ).rejects.toThrow();
    }
  });
  it('keeps corrections on the same employee and date and allows only one successor', async () => {
    const [original] = await test.db
      .insert(employeeCompensationEntries)
      .values(entry())
      .returning();
    if (!original) throw new Error('Entry missing');
    await expect(
      test.db
        .insert(employeeCompensationEntries)
        .values({ ...entry(), correctsEntryId: original.id }),
    ).rejects.toThrow();
    await expect(
      test.db.insert(employeeCompensationEntries).values({
        ...entry(),
        correctsEntryId: original.id,
        reason: 'Correct tariff',
        effectiveFrom: '2026-08-01',
      }),
    ).rejects.toThrow();
    const [other] = await test.db
      .insert(employees)
      .values({ personnelNumber: 'OTHER-PROFILE', fullName: 'Other synthetic employee' })
      .returning();
    if (!other) throw new Error('Other employee missing');
    await expect(
      test.db.insert(employeeCompensationEntries).values({
        ...entry(),
        employeeId: other.id,
        correctsEntryId: original.id,
        reason: 'Wrong employee',
      }),
    ).rejects.toThrow();
    const [correction] = await test.db
      .insert(employeeCompensationEntries)
      .values({
        ...entry(),
        hourlyRate: '110',
        correctsEntryId: original.id,
        reason: 'Correct tariff',
      })
      .returning();
    expect(correction?.correctsEntryId).toBe(original.id);
    await expect(
      test.db
        .insert(employeeCompensationEntries)
        .values({ ...entry(), correctsEntryId: original.id, reason: 'Duplicate correction' }),
    ).rejects.toThrow();
    await expect(
      test.db
        .update(employeeCompensationEntries)
        .set({ hourlyRate: '200' })
        .where(eq(employeeCompensationEntries.id, original.id)),
    ).rejects.toThrow();
    await expect(
      test.db
        .delete(employeeCompensationEntries)
        .where(eq(employeeCompensationEntries.id, original.id)),
    ).rejects.toThrow();
    const rows = await test.db.select().from(employeeCompensationEntries);
    expect(rows).toHaveLength(2);
  });
  it('enforces employee and avatar references', async () => {
    await expect(
      test.db
        .update(orgUnits)
        .set({ masterEmployeeId: randomUUID() })
        .where(eq(orgUnits.id, unitId)),
    ).rejects.toThrow();
    await expect(
      test.db.execute(
        sql`UPDATE employees SET avatar_media_id = ${randomUUID()} WHERE id = ${employeeId}`,
      ),
    ).rejects.toThrow();
    await test.db
      .update(orgUnits)
      .set({ masterEmployeeId: employeeId })
      .where(eq(orgUnits.id, unitId));
  });
});
