import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import {
  authUser,
  webUserRoles,
  employees,
  telegramAccounts,
  communications,
  communicationRecipients,
  communicationParts,
  communicationAttachments,
  eq,
  asc,
} from '@vakhta/db';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { dispatchCommunication } from './dispatch.js';
let test: TestDatabase;
beforeAll(async () => {
  test = await startTestDatabase();
});
afterAll(async () => {
  await test?.stop();
});
async function fixture(kind = 'TEXT') {
  const senderId = randomUUID(),
    employeeId = randomUUID(),
    accountId = randomUUID(),
    campaignId = randomUUID(),
    recipientId = randomUUID();
  const telegramUserId = Math.floor(Math.random() * 1e12) + 1;
  await test.db
    .insert(authUser)
    .values({ id: senderId, name: 'Synthetic sender', email: `${senderId}@example.test` });
  await test.db
    .insert(webUserRoles)
    .values({ userId: senderId, role: 'ADMIN', scopeType: 'ENTERPRISE' });
  await test.db.insert(employees).values({
    id: employeeId,
    personnelNumber: employeeId,
    fullName: 'Synthetic employee',
    locale: 'uk',
  });
  await test.db.insert(telegramAccounts).values({ id: accountId, employeeId, telegramUserId });
  await test.db.insert(communications).values({
    id: campaignId,
    senderId,
    requestId: randomUUID(),
    fingerprint: 'test',
    body: 'Shift briefing',
  });
  await test.db.insert(communicationRecipients).values({
    id: recipientId,
    communicationId: campaignId,
    employeeId,
    telegramAccountId: accountId,
    telegramUserId,
  });
  const fileId = randomUUID();
  if (kind === 'ATTACHMENT')
    await test.db.insert(communicationAttachments).values({
      id: fileId,
      ownerId: senderId,
      communicationId: campaignId,
      filename: 'brief.pdf',
      storageKey: fileId,
      contentType: 'application/pdf',
      sizeBytes: 10,
      sha256: 'test',
      status: 'READY',
      expiresAt: new Date(),
    });
  await test.db.insert(communicationParts).values([
    {
      recipientId,
      ordinal: 0,
      nextAttemptAt: new Date(0),
      kind,
      payload: kind === 'TEXT' ? { text: 'Shift briefing' } : { attachmentId: fileId },
    },
    {
      recipientId,
      ordinal: 1,
      nextAttemptAt: new Date(0),
      kind: 'QUESTIONNAIRE',
      payload: { title: 'Shift feedback', communicationId: campaignId },
    },
  ]);
  return {
    senderId,
    accountId,
    recipientId,
    telegramUserId,
    parts: () =>
      test.db
        .select()
        .from(communicationParts)
        .where(eq(communicationParts.recipientId, recipientId))
        .orderBy(asc(communicationParts.ordinal)),
  };
}
const web = 'https://panel.example.test';
it('sends ordered parts once and uses an inline private Mini App invitation', async () => {
  const f = await fixture();
  const send = vi.fn(async () => 123);
  await dispatchCommunication(test.db, { send }, null, web);
  await dispatchCommunication(test.db, { send }, null, web);
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1]).toEqual([
    f.telegramUserId,
    expect.objectContaining({
      kind: 'QUESTIONNAIRE',
      url: expect.stringContaining('?questionnaire='),
      button: expect.any(String),
    }),
  ]);
  expect((await f.parts()).map((p) => p.status)).toEqual(['SENT', 'SENT']);
  await dispatchCommunication(test.db, { send }, null, web);
  expect(send).toHaveBeenCalledTimes(2);
});
it('does not automatically resend after an uncertain network result', async () => {
  const f = await fixture();
  const send = vi.fn(async () => {
    throw new Error('Connection lost after send');
  });
  await dispatchCommunication(test.db, { send }, null, web);
  await dispatchCommunication(test.db, { send }, null, web);
  expect(send).toHaveBeenCalledTimes(1);
  expect((await f.parts()).map((p) => p.status)).toEqual(['UNKNOWN', 'PENDING']);
});
it('cancels all remaining parts after a relink during media preparation', async () => {
  const f = await fixture('ATTACHMENT');
  const send = vi.fn(async () => 123);
  const files = {
    read: async () => {
      await test.db
        .update(telegramAccounts)
        .set({ status: 'REVOKED' })
        .where(eq(telegramAccounts.id, f.accountId));
      return new Uint8Array(10);
    },
  };
  await dispatchCommunication(test.db, { send }, files, web);
  expect(send).not.toHaveBeenCalled();
  expect((await f.parts()).map((p) => p.status)).toEqual(['SKIPPED', 'SKIPPED']);
});
it('converts an expired claim into unknown without silently replaying', async () => {
  const f = await fixture();
  const [part] = await f.parts();
  if (!part) throw new Error('Missing part');
  await test.db
    .update(communicationParts)
    .set({ status: 'SENDING', claimId: randomUUID(), leaseUntil: new Date(0) })
    .where(eq(communicationParts.id, part.id));
  const send = vi.fn(async () => 123);
  await dispatchCommunication(test.db, { send }, null, web);
  expect(send).not.toHaveBeenCalled();
  expect((await f.parts())[0]?.status).toBe('UNKNOWN');
});
it('revalidates sender grants before delivery', async () => {
  const f = await fixture();
  await test.db.delete(webUserRoles).where(eq(webUserRoles.userId, f.senderId));
  const send = vi.fn(async () => 123);
  await dispatchCommunication(test.db, { send }, null, web);
  expect(send).not.toHaveBeenCalled();
  expect((await f.parts()).map((p) => p.status)).toEqual(['SKIPPED', 'SKIPPED']);
});
it('fences an expired attempt after media preparation before contacting Telegram', async () => {
  const f = await fixture('ATTACHMENT');
  const [part] = await f.parts();
  if (!part) throw new Error('Missing part');
  const send = vi.fn(async () => 123);
  const files = {
    read: async () => {
      await test.db
        .update(communicationParts)
        .set({ leaseUntil: new Date(0) })
        .where(eq(communicationParts.id, part.id));
      return new Uint8Array(10);
    },
  };
  await dispatchCommunication(test.db, { send }, files, web);
  expect(send).not.toHaveBeenCalled();
  await dispatchCommunication(test.db, { send }, files, web);
  expect((await f.parts())[0]?.status).toBe('UNKNOWN');
});
it('honors rate-limit delay and cancels dependent parts for a blocked chat', async () => {
  const { GrammyError } = await import('grammy');
  const f = await fixture();
  const send = vi.fn(async () => {
    throw new GrammyError(
      'sendMessage',
      { ok: false, error_code: 429, description: 'rate limit', parameters: { retry_after: 60 } },
      'sendMessage',
      {},
    );
  });
  await dispatchCommunication(test.db, { send }, null, web);
  expect((await f.parts())[0]?.status).toBe('PENDING');
  await dispatchCommunication(test.db, { send }, null, web);
  expect(send).toHaveBeenCalledTimes(1);
  const [part] = await f.parts();
  if (!part) throw new Error('Missing part');
  await test.db
    .update(communicationParts)
    .set({ nextAttemptAt: new Date(0) })
    .where(eq(communicationParts.id, part.id));
  send.mockImplementation(async () => {
    throw new GrammyError(
      'sendMessage',
      { ok: false, error_code: 403, description: 'blocked' },
      'sendMessage',
      {},
    );
  });
  await dispatchCommunication(test.db, { send }, null, web);
  expect((await f.parts()).map((p) => p.status)).toEqual(['SKIPPED', 'SKIPPED']);
});
