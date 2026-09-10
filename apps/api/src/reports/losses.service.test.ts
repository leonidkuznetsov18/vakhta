import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import {
  activityIntervals,
  employeePositions,
  employees,
  orgUnits,
  positions,
  reasonCodes,
  eq,
  shiftSessions,
  sites,
  sql,
  type DbOrTx,
} from '@vakhta/db';
import { LossesQuery } from '@vakhta/contracts';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { AuditLog, type AuditEntry } from '../events/audit-log.js';
import { LossesService } from './losses.service.js';

const START = new Date('2026-08-10T08:00:00Z');
const CUTOFF = new Date('2026-08-10T10:00:00Z');
const QUERY = { from: '2026-08-10', to: '2026-08-10', category: 'DOWNTIME' };
const ACTOR = { type: 'SYSTEM', id: null, role: 'SYSTEM' } as const;

function first<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) throw new Error('Expected a fixture row');
  return row;
}

describe('LossesService report integrity', () => {
  let fixture: TestDatabase;
  let service: LossesService;
  let employeeId: string;
  let sessionId: string;
  let originalUnit: string;
  let nextUnit: string;
  let positionId: string;

  beforeAll(async () => {
    fixture = await startTestDatabase();
  }, 180_000);
  afterAll(async () => {
    await fixture?.stop();
  });
  beforeEach(async () => {
    await fixture.db.execute(sql`TRUNCATE sites, employees, positions, reason_codes CASCADE`);
    service = new LossesService(fixture.db, new AuditLog());
    const site = first(
      await fixture.db
        .insert(sites)
        .values({ code: 'TEST', name: 'Test', timezone: 'Europe/Kyiv' })
        .returning(),
    );
    originalUnit = first(
      await fixture.db.insert(orgUnits).values({ siteId: site.id, name: 'Original' }).returning(),
    ).id;
    nextUnit = first(
      await fixture.db.insert(orgUnits).values({ siteId: site.id, name: 'Next' }).returning(),
    ).id;
    positionId = first(
      await fixture.db.insert(positions).values({ code: 'OP', name: 'Operator' }).returning(),
    ).id;
    employeeId = first(
      await fixture.db
        .insert(employees)
        .values({ personnelNumber: '1', fullName: 'Worker' })
        .returning(),
    ).id;
    await fixture.db.insert(employeePositions).values({
      employeeId,
      orgUnitId: originalUnit,
      positionId,
      validFrom: new Date('2026-01-01Z'),
      validTo: new Date('2026-08-11Z'),
    });
    await fixture.db
      .insert(employeePositions)
      .values({ employeeId, orgUnitId: nextUnit, positionId, validFrom: new Date('2026-08-11Z') });
    sessionId = first(
      await fixture.db
        .insert(shiftSessions)
        .values({
          employeeId,
          businessDate: QUERY.from,
          startedAt: START,
          state: 'SHIFT_CLOSED',
          endedAt: CUTOFF,
        })
        .returning(),
    ).id;
    await fixture.db.insert(reasonCodes).values([
      { kind: 'DOWNTIME', code: 'SHARED', label: 'Equipment' },
      { kind: 'EMERGENCY', code: 'SHARED', label: 'Emergency' },
    ]);
  });

  async function interval(
    startedAt = START,
    endedAt: Date | null = CUTOFF,
    reasonCode: string | null = 'SHARED',
  ) {
    return first(
      await fixture.db
        .insert(activityIntervals)
        .values({ shiftSessionId: sessionId, state: 'DOWNTIME', startedAt, endedAt, reasonCode })
        .returning(),
    );
  }

  it('excludes estimated zero placeholders from counts but keeps positive sub-minute observations', async () => {
    await interval(START, START);
    await interval(START, new Date(START.getTime() + 10_000));
    await fixture.db
      .update(shiftSessions)
      .set({ autoCloseReason: 'LEFT_OPEN' })
      .where(eq(shiftSessions.id, sessionId));
    const report = await service.overview(QUERY, 'en', CUTOFF);
    expect(report.intervalsTotal).toBe(1);
    expect(report.intervals).toHaveLength(1);
    expect(report.intervals[0]).toMatchObject({ minutes: 0, estimatedEnd: true });
    expect(report.bars[0]?.intervals).toBe(1);
    const file = await service.export(QUERY, 'csv', ACTOR, 'en', CUTOFF);
    expect(file.body.toString('utf8')).toContain('Actual departure is unknown');
  });

  it('keeps historical minutes with the unit held when the shift started', async () => {
    await interval();
    const original = await service.overview({ ...QUERY, orgUnitId: originalUnit }, 'en', CUTOFF);
    expect(original.lostMinutes).toBe(120);
    expect(original.intervals.map((row) => row.orgUnitName)).toEqual(['Original']);
    expect(
      (await service.overview({ ...QUERY, orgUnitId: nextUnit }, 'en', CUTOFF)).lostMinutes,
    ).toBe(0);
  });

  it('does not multiply intervals for reason codes shared by different kinds or multiple comments', async () => {
    await interval();
    await fixture.db.execute(sql`
      WITH incident AS (
        INSERT INTO downtime_incidents (reason_code, opened_at, sla_due_at) VALUES ('SHARED', ${START.toISOString()}::timestamptz, ${CUTOFF.toISOString()}::timestamptz) RETURNING id
      )
      INSERT INTO downtime_reports (incident_id, shift_session_id, employee_id, reason_code, comment, reported_at)
      SELECT incident.id, ${sessionId}::uuid, ${employeeId}::uuid, 'SHARED', words.comment,
        ${START.toISOString()}::timestamptz + words.offset_minutes * interval '1 minute'
      FROM incident CROSS JOIN (VALUES ('First', 1), ('Second', 2), ('Boundary', 120)) AS words(comment, offset_minutes)
    `);
    const report = await service.overview(QUERY, 'en', CUTOFF);
    expect(report.intervals).toHaveLength(1);
    expect(report.intervals[0]).toMatchObject({
      reasonLabel: 'Equipment',
      comment: 'First\nSecond',
      minutes: 120,
    });
    expect(report.bars).toHaveLength(1);
    expect(report.bars[0]).toMatchObject({ minutes: 120, intervals: 1 });
  });

  it('sums the same rounded interval minutes in bars and CSV', async () => {
    await interval(START, new Date(START.getTime() + 31_000));
    await interval(new Date(START.getTime() + 31_000), new Date(START.getTime() + 62_000));
    const report = await service.overview(QUERY, 'en', CUTOFF);
    expect(report.intervals.map((row) => row.minutes)).toEqual([1, 1]);
    expect(report.lostMinutes).toBe(2);
    expect(report.bars[0]?.minutes).toBe(2);
    const file = await service.export({ ...QUERY, asOf: CUTOFF.toISOString() }, 'csv', ACTOR, 'en');
    const workbook = XLSX.read(file.body, { type: 'buffer', raw: true });
    const sheet = first(Object.values(workbook.Sheets));
    const exported = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);
    expect(exported.reduce((sum, row) => sum + Number(row['Minutes']), 0)).toBe(2);
    expect(exported[0]?.['Calculation cutoff']).toBe(CUTOFF.toISOString());
  });

  it('caps every duration at the requested cutoff including intervals closed afterwards', async () => {
    await interval(START, new Date('2026-08-10T12:00:00Z'));
    const report = await service.overview(
      { ...QUERY, asOf: CUTOFF.toISOString() },
      'en',
      new Date('2026-08-11Z'),
    );
    expect(report.lostMinutes).toBe(120);
    expect(report.intervals[0]).toMatchObject({ minutes: 120, endedAt: null });
    expect(report.asOf).toBe(CUTOFF.toISOString());
  });

  it('reports the real count when detail exceeds 500 rows', async () => {
    await seedMany(501);
    const report = await service.overview(QUERY, 'en', new Date('2026-08-11Z'));
    expect(report.intervals).toHaveLength(500);
    expect(report.intervalsTotal).toBe(501);
    expect(report.intervalsTruncated).toBe(true);
  });

  it('rejects oversized exports instead of silently dropping rows', async () => {
    await seedMany(20_001);
    let failure: unknown;
    try {
      await service.export(QUERY, 'csv', ACTOR, 'en');
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ code: 'REPORT_EXPORT_TOO_LARGE', status: 422 });
  });

  it('does not interpret the query string false as a request for unexplained intervals', async () => {
    expect(LossesQuery.parse({ ...QUERY, noReason: 'false' }).noReason).toBe(false);
  });

  it('uses PostgreSQL repeatable read for the overview', async () => {
    await interval();
    const realRows = service.rows.bind(service);
    let isolation: PromiseLike<unknown> | undefined;
    vi.spyOn(service, 'rows').mockImplementation((tx, query, at) => {
      isolation = Promise.resolve(
        tx.execute(sql`select current_setting('transaction_isolation') as isolation`),
      );
      return realRows(tx, query, at);
    });
    await service.overview(QUERY, 'en', CUTOFF);
    expect(await isolation).toEqual([{ isolation: 'repeatable read' }]);
  });

  it('keeps export reads on the same snapshot when history changes before audit completion', async () => {
    const recorded = await interval();
    class ConcurrentAudit extends AuditLog {
      override async record(tx: DbOrTx, entry: AuditEntry) {
        await fixture.db
          .update(activityIntervals)
          .set({ reasonCode: null })
          .where(eq(activityIntervals.id, recorded.id));
        const sameSnapshot = first(
          await tx.select().from(activityIntervals).where(eq(activityIntervals.id, recorded.id)),
        );
        expect(sameSnapshot.reasonCode).toBe('SHARED');
        await super.record(tx, entry);
      }
    }
    const exporting = new LossesService(fixture.db, new ConcurrentAudit());
    const file = await exporting.export(
      { ...QUERY, reason: 'SHARED' },
      'xlsx',
      ACTOR,
      'en',
      CUTOFF,
    );
    const workbook = XLSX.read(file.body, { type: 'buffer' });
    const exported = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      first(Object.values(workbook.Sheets)),
    );
    expect(exported).toHaveLength(1);
    expect(exported[0]).toMatchObject({
      Reason: 'Equipment',
      Minutes: 120,
      'Calculation cutoff': CUTOFF.toISOString(),
    });
    expect(first(await fixture.db.select().from(activityIntervals)).reasonCode).toBeNull();
  });

  it('resolves overlapping historical assignments once and honors the transfer boundary', async () => {
    await fixture.db
      .insert(employeePositions)
      .values({ employeeId, orgUnitId: nextUnit, positionId, validFrom: START });
    await interval();
    const report = await service.overview(QUERY, 'en', CUTOFF);
    expect(report.intervals).toHaveLength(1);
    expect(report.intervals[0]?.orgUnitName).toBe('Next');
    expect(report.lostMinutes).toBe(120);
  });

  it('does not assign missing employment history to the current unit', async () => {
    await fixture.db.delete(employeePositions).where(eq(employeePositions.orgUnitId, originalUnit));
    await interval();
    const report = await service.overview(QUERY, 'en', CUTOFF);
    expect(report.intervals[0]?.orgUnitName).toBeNull();
    expect(
      (await service.overview({ ...QUERY, orgUnitId: nextUnit }, 'en', CUTOFF)).intervalsTotal,
    ).toBe(0);
  });

  it('excludes an assignment whose validity ended exactly when the shift started', async () => {
    await fixture.db
      .update(employeePositions)
      .set({ validTo: START })
      .where(eq(employeePositions.orgUnitId, originalUnit));
    await interval();
    const report = await service.overview(QUERY, 'en', CUTOFF);
    expect(report.intervals[0]?.orgUnitName).toBeNull();
  });

  it('anchors a legacy shift with no start timestamp to its first recorded interval', async () => {
    await fixture.db
      .update(shiftSessions)
      .set({ startedAt: null })
      .where(eq(shiftSessions.id, sessionId));
    await interval();
    const report = await service.overview(QUERY, 'en', CUTOFF);
    expect(report.intervals[0]?.orgUnitName).toBe('Original');
  });

  it('uses the shared cutoff for open intervals and excludes intervals starting afterwards', async () => {
    await interval(START, CUTOFF, null);
    await interval(CUTOFF, null);
    const report = await service.overview(QUERY, 'en', new Date('2026-08-10T11:00:00Z'));
    expect(report.lostMinutes).toBe(180);
    const filtered = await service.overview({ ...QUERY, noReason: true }, 'en', CUTOFF);
    expect(filtered.intervalsTotal).toBe(1);
    expect(filtered.bars[0]?.minutes).toBe(120);
    const future = await service.overview({ ...QUERY, asOf: '2099-01-01T00:00:00Z' }, 'en', CUTOFF);
    expect(future.asOf).toBe(CUTOFF.toISOString());
    expect(future.intervalsTotal).toBe(1);
  });

  it('keeps the category total truthful at the top level and exports every row through 20000', async () => {
    await seedMany(20_000);
    const report = await service.overview(
      { from: QUERY.from, to: QUERY.to },
      'en',
      new Date('2026-08-11Z'),
    );
    expect(report.intervals).toEqual([]);
    expect(report.intervalsTotal).toBe(20_000);
    expect(report.intervalsTruncated).toBe(false);
    const file = await service.export(QUERY, 'csv', ACTOR, 'en');
    expect(file.body.toString('utf8').split('\n')).toHaveLength(20_001);
  });

  async function seedMany(count: number) {
    await fixture.db.execute(sql`
      INSERT INTO activity_intervals (shift_session_id, state, started_at, ended_at, reason_code)
      SELECT ${sessionId}::uuid, 'DOWNTIME',
        ${START.toISOString()}::timestamptz + n * interval '1 second',
        ${START.toISOString()}::timestamptz + (n + 1) * interval '1 second', 'SHARED'
      FROM generate_series(0, ${count - 1}) AS n
    `);
  }
});
