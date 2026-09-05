import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  domainEvents,
  employees,
  eq,
  orgUnits,
  presenceSessions,
  qrChallengeUses,
  qrChallenges,
  qrTerminals,
  scheduleVersions,
  shiftAssignments,
  shiftTemplates,
  sites,
  sql,
} from '@vakhta/db';
import { DEFAULT_ATTENDANCE_WINDOW } from '@vakhta/domain';
import { generateChallengeToken, hashChallengeToken, hashDeviceToken } from '@vakhta/domain/node';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { AttendanceService } from './attendance.service.js';

const MASTER = { type: 'WEB_USER', id: null, role: 'SHIFT_MASTER', label: 'master' } as const;

describe('attendance: прихід і відхід за QR (FR-QR-03..06, FR-TIME-01/05)', () => {
  let testDb: TestDatabase;
  let service: AttendanceService;
  let terminalId: string;
  let ivanov: string;
  let petrova: string;
  let nobody: string;
  let assignmentId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    service = new AttendanceService(testDb.db, new EventStore(), new AuditLog(), {
      window: DEFAULT_ATTENDANCE_WINDOW,
    });
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE qr_challenge_uses, presence_sessions, qr_challenges, qr_terminals, shift_assignments, schedule_versions, shift_templates, employees, org_units, sites CASCADE`,
    );
    const [site] = await testDb.db
      .insert(sites)
      .values({ code: 'main', name: 'Основная', timezone: 'Europe/Kyiv' })
      .returning();
    const [unit] = await testDb.db
      .insert(orgUnits)
      .values({ siteId: site!.id, name: 'Цех' })
      .returning();
    const [terminal] = await testDb.db
      .insert(qrTerminals)
      .values({
        siteId: site!.id,
        name: 'Проходная',
        deviceTokenHash: hashDeviceToken('device-token-0123456789'),
      })
      .returning();
    terminalId = terminal!.id;
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
      .values([
        { personnelNumber: '1', fullName: 'Иванов Иван' },
        { personnelNumber: '2', fullName: 'Петрова Ольга' },
        { personnelNumber: '3', fullName: 'Никто Никитович' },
      ])
      .returning();
    ivanov = people[0]!.id;
    petrova = people[1]!.id;
    nobody = people[2]!.id;
    const start = new Date(Date.now() + 60 * 60_000);
    const inserted = await testDb.db
      .insert(shiftAssignments)
      .values(
        [ivanov, petrova].map((employeeId) => ({
          scheduleVersionId: version!.id,
          employeeId,
          templateId: tpl!.id,
          businessDate: '2026-10-01',
          planStartAt: start,
          planEndAt: new Date(start.getTime() + 12 * 3_600_000),
          orgUnitId: unit!.id,
        })),
      )
      .returning();
    assignmentId = inserted.find((a) => a.employeeId === ivanov)!.id;
  });

  async function issueChallenge(ttlSeconds = 90): Promise<string> {
    const token = generateChallengeToken();
    await testDb.db.insert(qrChallenges).values({
      terminalId,
      tokenHash: hashChallengeToken(token),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    });
    return token;
  }

  it('AC-04: «Я на роботі» відкриває присутність за призначеною зміною, робочий час не починає', async () => {
    const token = await issueChallenge();
    expect(await service.intent(ivanov)).toBe('ARRIVE');
    const result = await service.checkInByQr(ivanov, token, 'ARRIVE');
    expect(result).toMatchObject({
      ok: true,
      action: 'ARRIVE',
      alreadyRecorded: false,
      terminalName: 'Проходная',
    });
    if (!result.ok) return;
    expect(result.presence).toMatchObject({
      assignmentId,
      arrivalMethod: 'QR',
      status: 'OPEN',
      departedAt: null,
    });
    expect(await service.intent(ivanov)).toBe('DEPART');

    const events = await testDb.db
      .select({ type: domainEvents.type })
      .from(domainEvents)
      .where(eq(domainEvents.employeeId, ivanov));
    expect(events.map((e) => e.type)).toEqual(['PRESENCE_ARRIVED']);
    expect(await testDb.db.select().from(qrChallengeUses)).toHaveLength(1);
  });

  it('T-02 і T-03: один QR обслуговує двох, а повтор того самого працівника повертає перший результат', async () => {
    const token = await issueChallenge();
    const first = await service.checkInByQr(ivanov, token, 'ARRIVE');
    const second = await service.checkInByQr(petrova, token, 'ARRIVE');
    expect(first.ok && second.ok).toBe(true);

    const repeat = await service.checkInByQr(ivanov, token, 'ARRIVE');
    expect(repeat).toMatchObject({ ok: false, reason: 'ALREADY_ARRIVED' });

    // Після відходу повторний прихід за тією ж зміною повертає першу відмітку, а не нову.
    await service.checkInByQr(ivanov, await issueChallenge(), 'DEPART');
    const again = await service.checkInByQr(ivanov, await issueChallenge(), 'ARRIVE');
    expect(again).toMatchObject({ ok: true, alreadyRecorded: true });
    if (again.ok && first.ok) expect(again.presence.id).toBe(first.presence.id);
    expect(
      await testDb.db
        .select()
        .from(presenceSessions)
        .where(eq(presenceSessions.employeeId, ivanov)),
    ).toHaveLength(1);
  });

  it('T-04 і T-05: прострочений QR відхиляється, підмінений створює подію безпеки', async () => {
    const expired = await issueChallenge(-1);
    expect(await service.checkInByQr(ivanov, expired, 'ARRIVE')).toMatchObject({
      ok: false,
      reason: 'CHALLENGE_EXPIRED',
    });

    const tampered = generateChallengeToken();
    expect(await service.checkInByQr(ivanov, tampered, 'ARRIVE')).toMatchObject({
      ok: false,
      reason: 'CHALLENGE_INVALID',
    });
    const events = await testDb.db
      .select({ type: domainEvents.type })
      .from(domainEvents)
      .where(eq(domainEvents.employeeId, ivanov));
    expect(events.map((e) => e.type)).toContain('QR_CHALLENGE_REJECTED');
    expect(await testDb.db.select().from(presenceSessions)).toHaveLength(0);
  });

  it('FR-QR-05: без призначеної зміни присутність не відкривається, вимкнений термінал відхиляє', async () => {
    expect(await service.checkInByQr(nobody, await issueChallenge(), 'ARRIVE')).toMatchObject({
      ok: false,
      reason: 'NO_ASSIGNMENT',
    });

    await testDb.db
      .update(qrTerminals)
      .set({ status: 'DISABLED' })
      .where(eq(qrTerminals.id, terminalId));
    expect(await service.checkInByQr(ivanov, await issueChallenge(), 'ARRIVE')).toMatchObject({
      ok: false,
      reason: 'TERMINAL_DISABLED',
    });
  });

  it('FR-TIME-05: «Я пішов» закриває присутність; без приходу відходу немає', async () => {
    expect(await service.checkInByQr(ivanov, await issueChallenge(), 'DEPART')).toMatchObject({
      ok: false,
      reason: 'NOT_ARRIVED',
    });
    await service.checkInByQr(ivanov, await issueChallenge(), 'ARRIVE');
    const departed = await service.checkInByQr(ivanov, await issueChallenge(), 'DEPART');
    expect(departed).toMatchObject({ ok: true, action: 'DEPART' });
    if (departed.ok)
      expect(departed.presence).toMatchObject({ status: 'CLOSED', departureMethod: 'QR' });
    expect(await service.listOpen()).toEqual([]);
  });

  it('FR-QR-06: резервна відмітка майстром зберігає спосіб, підставу і підтверджувача', async () => {
    const at = new Date(Date.now() - 10 * 60_000).toISOString();
    const result = await service.reserveCheckIn(
      {
        employeeId: nobody,
        action: 'ARRIVE',
        at,
        reasonCode: 'NO_CONNECTION',
        comment: 'бот був недоступний',
      },
      { ...MASTER, id: null },
    );
    expect(result).toMatchObject({ ok: true, terminalName: null });
    if (!result.ok) return;
    expect(result.presence).toMatchObject({
      assignmentId: null,
      arrivalMethod: 'MASTER',
      arrivedAt: at,
    });
    const open = await service.listOpen();
    expect(open.map((p) => p.fullName)).toEqual(['Никто Никитович']);
  });
});
