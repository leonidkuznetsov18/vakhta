import { randomUUID } from 'node:crypto';
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
    expect(result).toEqual({ sent: 1, skipped: 1, failed: 0, retried: 0, deferred: 0 });
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
      deferred: 0,
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
      deferred: 0,
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
  describe('acknowledgement reminder delivery eligibility', () => {
    async function queuedAcknowledgement(manual = false) {
      const now = new Date('2026-10-01T08:00:00Z');
      const [site] = await testDb.db
        .insert(sites)
        .values({ code: 'ACK', name: 'Ack', timezone: 'Europe/Kyiv' })
        .returning();
      if (!site) throw new Error('Site fixture missing');
      const [unit] = await testDb.db
        .insert(orgUnits)
        .values({ siteId: site.id, name: 'Unit' })
        .returning();
      const [template] = await testDb.db
        .insert(shiftTemplates)
        .values({
          siteId: site.id,
          code: 'DAY',
          name: 'Day',
          localStart: '08:00',
          localEnd: '20:00',
          isNight: false,
        })
        .returning();
      if (!unit || !template) throw new Error('Schedule fixtures missing');
      const [version] = await testDb.db
        .insert(scheduleVersions)
        .values({
          siteId: site.id,
          orgUnitId: unit.id,
          periodMonth: '2026-10',
          versionNo: 1,
          status: 'PUBLISHED',
        })
        .returning();
      if (!version) throw new Error('Version fixture missing');
      const [assignment] = await testDb.db
        .insert(shiftAssignments)
        .values({
          scheduleVersionId: version.id,
          employeeId: linkedEmployeeId,
          templateId: template.id,
          orgUnitId: unit.id,
          businessDate: '2026-10-02',
          planStartAt: new Date('2026-10-02T05:00:00Z'),
          planEndAt: new Date('2026-10-02T17:00:00Z'),
        })
        .returning();
      if (!assignment) throw new Error('Assignment fixture missing');
      expect(
        await handleAckReminder(
          testDb.db,
          { versionId: version.id, employeeId: linkedEmployeeId, fireAt: now.toISOString() },
          now,
        ),
      ).toBe('queued');
      const key = manual
        ? `ack-reminder:manual:${version.id}:${linkedEmployeeId}:2026-10-01`
        : `ack-reminder:${version.id}:${linkedEmployeeId}`;
      await testDb.db.update(notificationOutbox).set({ dedupeKey: key, nextAttemptAt: now });
      return { now, version, assignment, sender: new FakeSender() };
    }
    async function acknowledge(assignmentId: string, versionId: string) {
      await testDb.db
        .insert(assignmentAcknowledgements)
        .values({
          assignmentId,
          employeeId: linkedEmployeeId,
          scheduleVersionId: versionId,
          source: 'TELEGRAM',
        });
    }

    it.each([false, true])(
      'delivers a live reminder with the exact current version button (manual=%s)',
      async (manual) => {
        const { now, version, sender } = await queuedAcknowledgement(manual);
        // The stored text/button is not authority for which publication can be acknowledged.
        await testDb.db
          .update(notificationOutbox)
          .set({
            payload: {
              text: 'old text',
              buttons: [[{ text: 'old action', callbackData: `ack:${randomUUID()}` }]],
            },
          });
        expect(await relayOnce(testDb.db, sender, { now: () => now })).toMatchObject({ sent: 1 });
        expect(sender.sent).toHaveLength(1);
        expect(sender.sent[0]?.chatId).toBe(777);
        expect(sender.sent[0]?.payload.buttons?.[0]?.[0]?.callbackData).toBe(`ack:${version.id}`);
        const [row] = await testDb.db.select().from(notificationOutbox);
        expect(row).toMatchObject({ status: 'SENT', attempts: 1 });
        expect(await relayOnce(testDb.db, sender, { now: () => now })).toMatchObject({ sent: 0 });
      },
    );

    it.each([false, true])(
      'skips a queued reminder after publication is superseded (manual=%s)',
      async (manual) => {
        const { now, sender, version } = await queuedAcknowledgement(manual);
        await testDb.db
          .update(scheduleVersions)
          .set({ status: 'SUPERSEDED' })
          .where(eq(scheduleVersions.id, version.id));
        expect(await relayOnce(testDb.db, sender, { now: () => now })).toMatchObject({
          skipped: 1,
          sent: 0,
        });
        expect(sender.sent).toHaveLength(0);
        const [row] = await testDb.db.select().from(notificationOutbox);
        expect(row).toMatchObject({
          status: 'SKIPPED',
          attempts: 0,
          lastError: 'Acknowledgement reminder is no longer applicable',
        });
      },
    );

    it('skips a queued reminder after its employee acknowledges the assignments', async () => {
      const { now, sender, assignment, version } = await queuedAcknowledgement();
      await acknowledge(assignment.id, version.id);
      expect(await relayOnce(testDb.db, sender, { now: () => now })).toMatchObject({
        skipped: 1,
        sent: 0,
      });
      expect(sender.sent).toHaveLength(0);
    });

    it('rechecks acknowledgement after a Telegram retry without resending or consuming another attempt', async () => {
      const { now, sender, assignment, version } = await queuedAcknowledgement();
      sender.behaviour = 'retry';
      expect(await relayOnce(testDb.db, sender, { now: () => now })).toMatchObject({ retried: 1 });
      await acknowledge(assignment.id, version.id);
      sender.behaviour = 'ok';
      expect(
        await relayOnce(testDb.db, sender, { now: () => new Date(now.getTime() + 60_000) }),
      ).toMatchObject({ skipped: 1, sent: 0 });
      expect(sender.sent).toHaveLength(0);
      const [row] = await testDb.db.select().from(notificationOutbox);
      expect(row).toMatchObject({ status: 'SKIPPED', attempts: 1 });
    });

    it('retains delivery when another future assignment of the same employee remains unacknowledged', async () => {
      const { now, sender, assignment, version } = await queuedAcknowledgement();
      await acknowledge(assignment.id, version.id);
      await testDb.db
        .insert(shiftAssignments)
        .values({
          scheduleVersionId: version.id,
          employeeId: linkedEmployeeId,
          templateId: assignment.templateId,
          orgUnitId: assignment.orgUnitId,
          businessDate: '2026-10-03',
          planStartAt: new Date('2026-10-03T05:00:00Z'),
          planEndAt: new Date('2026-10-03T17:00:00Z'),
        });
      expect(await relayOnce(testDb.db, sender, { now: () => now })).toMatchObject({
        sent: 1,
        skipped: 0,
      });
    });

    it.each(['CANCELLED', 'REPLACED'] as const)(
      'skips a reminder when its last assignment becomes %s',
      async (status) => {
        const { now, sender, assignment } = await queuedAcknowledgement();
        await testDb.db
          .update(shiftAssignments)
          .set({ status })
          .where(eq(shiftAssignments.id, assignment.id));
        expect(await relayOnce(testDb.db, sender, { now: () => now })).toMatchObject({
          skipped: 1,
        });
        expect(sender.sent).toHaveLength(0);
      },
    );

    it('skips at the future-assignment boundary even when the reminder was previously queued', async () => {
      const { sender, assignment } = await queuedAcknowledgement();
      expect(
        await relayOnce(testDb.db, sender, { now: () => assignment.planStartAt }),
      ).toMatchObject({ skipped: 1 });
      expect(sender.sent).toHaveLength(0);
    });

    it.each(['invalid', 'recipient-mismatch', 'invalid-manual-date'] as const)(
      'skips %s reminder provenance',
      async (kind) => {
        const { now, sender, version } = await queuedAcknowledgement();
        const dedupeKey =
          kind === 'invalid'
            ? 'ack-reminder:invalid'
            : kind === 'recipient-mismatch'
              ? `ack-reminder:${version.id}:${unlinkedEmployeeId}`
              : `ack-reminder:manual:${version.id}:${linkedEmployeeId}:2026-99-99`;
        await testDb.db.update(notificationOutbox).set({ dedupeKey });
        expect(await relayOnce(testDb.db, sender, { now: () => now })).toMatchObject({
          skipped: 1,
        });
        expect(sender.sent).toHaveLength(0);
      },
    );
  });
});
