import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assignmentAcknowledgements,
  employees,
  eq,
  notificationOutbox,
  orgUnits,
  scheduleVersions,
  shiftAssignments,
  shiftTemplates,
  sites,
  sql,
  telegramAccounts,
} from '@vakhta/db';
import type { NotificationPayload } from '@vakhta/domain';
import { startTestDatabase, type TestDatabase } from '../test/db.js';
import { SendError, backoffSeconds, relayOnce, type OutboxSender } from './outbox/relay.js';
import { handleAckReminder, handleShiftReminder } from './timers/reminders.js';

class FakeSender implements OutboxSender {
  readonly sent: { chatId: number; payload: NotificationPayload }[] = [];
  behaviour: 'ok' | 'retry' | 'skip' | 'rate-limit' = 'ok';

  async send(chatId: number, payload: NotificationPayload): Promise<{ messageId: number | null }> {
    if (this.behaviour === 'retry') throw new SendError('RETRY', 'тимчасово недоступно');
    if (this.behaviour === 'skip') throw new SendError('SKIP', 'бот заблокований');
    if (this.behaviour === 'rate-limit') throw new SendError('RETRY', 'too many requests', 7);
    this.sent.push({ chatId, payload });
    return { messageId: 1000 + this.sent.length };
  }
}

describe('worker: релей аутбоксу і нагадування (ADR-8, ТЗ 10)', () => {
  let testDb: TestDatabase;
  let linkedEmployeeId: string;
  let unlinkedEmployeeId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE notification_outbox, assignment_acknowledgements, shift_assignments, schedule_versions, shift_templates, telegram_accounts, employees, org_units, sites CASCADE`,
    );
    const [linked] = await testDb.db
      .insert(employees)
      .values({ personnelNumber: '1', fullName: 'Иванов Иван' })
      .returning();
    const [unlinked] = await testDb.db
      .insert(employees)
      .values({ personnelNumber: '2', fullName: 'Петрова Ольга' })
      .returning();
    linkedEmployeeId = linked!.id;
    unlinkedEmployeeId = unlinked!.id;
    await testDb.db
      .insert(telegramAccounts)
      .values({ employeeId: linkedEmployeeId, telegramUserId: 777 });
  });

  /** nextAttemptAt задається явно: годинники Postgres у контейнері і хоста можуть розходитись. */
  async function enqueue(
    recipientId: string,
    dedupeKey: string,
    nextAttemptAt = new Date(Date.now() - 60_000),
  ) {
    const [row] = await testDb.db
      .insert(notificationOutbox)
      .values({
        recipientType: 'EMPLOYEE',
        recipientId,
        template: 'SCHEDULE_PUBLISHED',
        payload: {
          text: 'Опубликован график',
          buttons: [[{ text: 'Ознакомлен', callbackData: 'ack:x' }]],
        },
        dedupeKey,
        nextAttemptAt,
      })
      .returning();
    return row!;
  }

  it('надсилає PENDING у чат за активною привʼязкою і позначає SENT; без привʼязки SKIPPED', async () => {
    await enqueue(linkedEmployeeId, 'n1');
    await enqueue(unlinkedEmployeeId, 'n2');
    const sender = new FakeSender();
    const result = await relayOnce(testDb.db, sender);
    expect(result).toEqual({ sent: 1, skipped: 1, failed: 0, retried: 0 });
    expect(sender.sent[0]?.chatId).toBe(777);
    expect(sender.sent[0]?.payload.buttons?.[0]?.[0]?.callbackData).toBe('ack:x');

    const rows = await testDb.db.select().from(notificationOutbox);
    expect(rows.find((r) => r.dedupeKey === 'n1')).toMatchObject({
      status: 'SENT',
      telegramMessageId: 1001,
      attempts: 1,
    });
    expect(rows.find((r) => r.dedupeKey === 'n2')).toMatchObject({ status: 'SKIPPED' });

    // Повторний прохід нічого не шле вдруге.
    expect(await relayOnce(testDb.db, sender)).toEqual({
      sent: 0,
      skipped: 0,
      failed: 0,
      retried: 0,
    });
  });

  it('тимчасова помилка відкладає з експоненційною затримкою, після maxAttempts стає FAILED', async () => {
    const t0 = new Date('2026-09-05T10:00:00Z');
    await enqueue(linkedEmployeeId, 'n3', t0);
    const sender = new FakeSender();
    sender.behaviour = 'retry';
    expect(await relayOnce(testDb.db, sender, { maxAttempts: 2, now: () => t0 })).toMatchObject({
      retried: 1,
    });
    let [row] = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.dedupeKey, 'n3'));
    expect(row).toMatchObject({ status: 'PENDING', attempts: 1 });
    expect(row!.nextAttemptAt.getTime() - t0.getTime()).toBe(backoffSeconds(1) * 1000);

    // До настання nextAttemptAt рядок не береться.
    expect(await relayOnce(testDb.db, sender, { maxAttempts: 2, now: () => t0 })).toMatchObject({
      retried: 0,
    });
    const later = new Date(t0.getTime() + 3600_000);
    expect(await relayOnce(testDb.db, sender, { maxAttempts: 2, now: () => later })).toMatchObject({
      failed: 1,
    });
    [row] = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.dedupeKey, 'n3'));
    expect(row).toMatchObject({ status: 'FAILED', attempts: 2 });
  });

  it('429 чекає retry_after, 403 відкладає назавжди', async () => {
    const t0 = new Date('2026-09-05T10:00:00Z');
    await enqueue(linkedEmployeeId, 'n4', t0);
    const sender = new FakeSender();
    sender.behaviour = 'rate-limit';
    await relayOnce(testDb.db, sender, { now: () => t0 });
    let [row] = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.dedupeKey, 'n4'));
    expect(row!.nextAttemptAt.getTime() - t0.getTime()).toBe(7000);

    sender.behaviour = 'skip';
    await relayOnce(testDb.db, sender, { now: () => new Date(t0.getTime() + 10_000) });
    [row] = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.dedupeKey, 'n4'));
    expect(row).toMatchObject({ status: 'SKIPPED', lastError: 'бот заблокований' });
  });

  it('нагадування про зміну і ознайомлення ставляться один раз і лише поки актуальні', async () => {
    const [site] = await testDb.db
      .insert(sites)
      .values({ code: 'main', name: 'Основная', timezone: 'Europe/Kyiv' })
      .returning();
    const [unit] = await testDb.db
      .insert(orgUnits)
      .values({ siteId: site!.id, name: 'Цех' })
      .returning();
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
    const start = new Date(Date.now() + 3 * 3600_000);
    const [future] = await testDb.db
      .insert(shiftAssignments)
      .values({
        scheduleVersionId: version!.id,
        employeeId: linkedEmployeeId,
        templateId: tpl!.id,
        businessDate: '2026-10-01',
        planStartAt: start,
        planEndAt: new Date(start.getTime() + 12 * 3600_000),
        orgUnitId: unit!.id,
      })
      .returning();
    const [past] = await testDb.db
      .insert(shiftAssignments)
      .values({
        scheduleVersionId: version!.id,
        employeeId: linkedEmployeeId,
        templateId: tpl!.id,
        businessDate: '2026-10-02',
        planStartAt: new Date(Date.now() - 3600_000),
        planEndAt: new Date(Date.now() + 11 * 3600_000),
        orgUnitId: unit!.id,
      })
      .returning();

    const fireAt = new Date().toISOString();
    expect(await handleShiftReminder(testDb.db, { assignmentId: future!.id, fireAt })).toBe(
      'queued',
    );
    expect(await handleShiftReminder(testDb.db, { assignmentId: future!.id, fireAt })).toBe(
      'duplicate',
    );
    expect(await handleShiftReminder(testDb.db, { assignmentId: past!.id, fireAt })).toBe('stale');

    const [reminder] = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.dedupeKey, `shift-reminder:${future!.id}`));
    expect(reminder?.payload.text).toContain('дневная смена');

    expect(
      await handleAckReminder(testDb.db, {
        versionId: version!.id,
        employeeId: linkedEmployeeId,
        fireAt,
      }),
    ).toBe('queued');
    expect(
      await handleAckReminder(testDb.db, {
        versionId: version!.id,
        employeeId: linkedEmployeeId,
        fireAt,
      }),
    ).toBe('duplicate');

    await testDb.db.insert(assignmentAcknowledgements).values([
      {
        assignmentId: future!.id,
        employeeId: linkedEmployeeId,
        scheduleVersionId: version!.id,
        source: 'TELEGRAM',
      },
      {
        assignmentId: past!.id,
        employeeId: linkedEmployeeId,
        scheduleVersionId: version!.id,
        source: 'TELEGRAM',
      },
    ]);
    expect(
      await handleAckReminder(testDb.db, {
        versionId: version!.id,
        employeeId: linkedEmployeeId,
        fireAt,
      }),
    ).toBe('stale');
  });
});
