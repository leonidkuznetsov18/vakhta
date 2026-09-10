import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { domainEvents, downtimeIncidents, eq, inArray, sql } from '@vakhta/db';
import { startTestDatabase, type TestDatabase } from '../test/db.js';
import { handleIncidentSla } from './timers/incident-sla.js';

describe('worker: SLA інциденту (FR-DWN-03)', () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE incident_status_history, downtime_reports, downtime_incidents CASCADE`,
    );
  });

  async function incident(over: Partial<typeof downtimeIncidents.$inferInsert> = {}) {
    const openedAt = new Date(Date.now() - 90 * 60_000);
    const [row] = await testDb.db
      .insert(downtimeIncidents)
      .values({
        reasonCode: 'BREAKDOWN',
        severity: 'NORMAL',
        status: 'REPORTED',
        openedAt,
        slaDueAt: new Date(openedAt.getTime() + 60 * 60_000),
        reportsCount: 1,
        ...over,
      })
      .returning();
    return row!;
  }

  it('прострочений без реакції інцидент позначається ескальованим один раз', async () => {
    const row = await incident();
    const job = { incidentId: row.id, fireAt: row.slaDueAt.toISOString() };
    expect(await handleIncidentSla(testDb.db, job)).toBe('queued');
    expect(await handleIncidentSla(testDb.db, job)).toBe('duplicate');
    const [after] = await testDb.db
      .select()
      .from(downtimeIncidents)
      .where(eq(downtimeIncidents.id, row.id));
    expect(after?.escalatedAt).not.toBeNull();
    const events = await testDb.db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.incidentId, row.id));
    expect(events.map((e) => e.type)).toEqual(['INCIDENT_SLA_BREACHED']);
    expect(Number(events[0]?.payload['overdueMinutes'])).toBeGreaterThanOrEqual(29);
  });

  it('підтверджений або ще не прострочений інцидент пропускається', async () => {
    const acked = await incident({ acknowledgedAt: new Date() });
    expect(
      await handleIncidentSla(testDb.db, {
        incidentId: acked.id,
        fireAt: new Date().toISOString(),
      }),
    ).toBe('stale');
    const fresh = await incident({ slaDueAt: new Date(Date.now() + 30 * 60_000) });
    expect(
      await handleIncidentSla(testDb.db, {
        incidentId: fresh.id,
        fireAt: new Date().toISOString(),
      }),
    ).toBe('stale');
    const events = await testDb.db
      .select()
      .from(domainEvents)
      .where(inArray(domainEvents.incidentId, [acked.id, fresh.id]));
    expect(events).toHaveLength(0);
  });
  it('rolls back the SLA event when the projection fails, then retries atomically', async () => {
    const row = await incident();
    const job = { incidentId: row.id, fireAt: row.slaDueAt.toISOString() };
    await testDb.db.execute(
      sql`CREATE FUNCTION reject_sla_projection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected SLA projection failure'; END $$`,
    );
    await testDb.db.execute(
      sql`CREATE TRIGGER reject_sla_projection BEFORE UPDATE ON downtime_incidents FOR EACH ROW EXECUTE FUNCTION reject_sla_projection()`,
    );
    try {
      await expect(handleIncidentSla(testDb.db, job)).rejects.toThrow();
      expect(
        await testDb.db.select().from(domainEvents).where(eq(domainEvents.incidentId, row.id)),
      ).toHaveLength(0);
    } finally {
      await testDb.db.execute(sql`DROP TRIGGER reject_sla_projection ON downtime_incidents`);
      await testDb.db.execute(sql`DROP FUNCTION reject_sla_projection()`);
    }
    expect(await handleIncidentSla(testDb.db, job)).toBe('queued');
  });

  it('repairs legacy event-only escalation at its original time without changing acknowledgement', async () => {
    const row = await incident({ status: 'CLOSED', acknowledgedAt: new Date() });
    const occurredAt = new Date(Date.now() - 20 * 60_000);
    await testDb.db.insert(domainEvents).values({
      type: 'INCIDENT_SLA_BREACHED',
      source: 'SYSTEM',
      actingRole: 'SYSTEM',
      incidentId: row.id,
      occurredAt,
      idempotencyKey: `incident-sla:${row.id}`,
    });
    await handleIncidentSla(testDb.db, { incidentId: row.id, fireAt: row.slaDueAt.toISOString() });
    const [after] = await testDb.db
      .select()
      .from(downtimeIncidents)
      .where(eq(downtimeIncidents.id, row.id));
    expect(after?.escalatedAt).toEqual(occurredAt);
    expect(after?.status).toBe('CLOSED');
    expect(after?.acknowledgedAt).toEqual(row.acknowledgedAt);
    expect(
      await testDb.db.select().from(domainEvents).where(eq(domainEvents.incidentId, row.id)),
    ).toHaveLength(1);
  });
});
