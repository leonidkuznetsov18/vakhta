import { randomUUID } from 'node:crypto';
import { singleTenantRegistry } from '../../test/tenants.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  authUser,
  employees,
  telegramAccounts,
  webUserRoles,
  communications,
  communicationParts,
  communicationRecipients,
  communicationAttachments,
  eq,
} from '@vakhta/db';
import { CreateCommunication, type SaveQuestionnaire } from '@vakhta/contracts';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { AuditLog } from '../events/audit-log.js';
import type { WebUser } from '../auth/web-auth.guard.js';
import { CommunicationsService } from './communications.service.js';
import { QuestionnaireService } from './questionnaire.service.js';
import { CommunicationMediaService } from './media.service.js';
let test: TestDatabase;
let service: CommunicationsService;
let questionnaires: QuestionnaireService;
beforeAll(async () => {
  test = await startTestDatabase();
  service = new CommunicationsService(test.db, new AuditLog());
  questionnaires = new QuestionnaireService(test.db, new AuditLog());
});
afterAll(async () => {
  await test?.stop();
});
async function fixture() {
  const id = randomUUID();
  const user: WebUser = {
    id,
    email: `${id}@example.test`,
    name: 'Test sender',
    twoFactorEnabled: false,
    grants: [],
  };
  await test.db.insert(authUser).values(user);
  await test.db.insert(webUserRoles).values({ userId: id, role: 'ADMIN', scopeType: 'ENTERPRISE' });
  const employeeId = randomUUID();
  await test.db.insert(employees).values({
    id: employeeId,
    personnelNumber: employeeId,
    fullName: 'Synthetic employee',
    locale: 'uk',
  });
  const telegramId = Math.floor(Math.random() * 1e12) + 1;
  const accountId = randomUUID();
  await test.db
    .insert(telegramAccounts)
    .values({ id: accountId, employeeId, telegramUserId: telegramId });
  const questionId = randomUUID();
  const command = CreateCommunication.parse({
    requestId: randomUUID(),
    recipientIds: [employeeId],
    text: 'Shift feedback',
    attachmentIds: [],
    questionnaire: {
      title: 'Shift feedback',
      questions: [{ id: questionId, kind: 'TEXT', prompt: 'What should improve?', required: true }],
    },
  });
  return { user, employeeId, telegramId, accountId, command, questionId };
}
describe('communication audience', () => {
  async function person(
    fullName: string,
    options: { status?: 'ACTIVE' | 'BLOCKED'; link?: 'ACTIVE' | 'REVOKED' },
  ) {
    const id = randomUUID();
    await test.db.insert(employees).values({
      id,
      personnelNumber: id,
      fullName,
      locale: 'uk',
      status: options.status ?? 'ACTIVE',
    });
    if (options.link)
      await test.db.insert(telegramAccounts).values({
        id: randomUUID(),
        employeeId: id,
        telegramUserId: Math.floor(Math.random() * 1e12) + 1,
        status: options.link,
      });
    return id;
  }
  it('lets a sender write to every active employee whose Telegram is linked, and only to them', async () => {
    const { user } = await fixture();
    const tag = randomUUID();
    const linked = await person(`${tag} A linked`, { link: 'ACTIVE' });
    const unlinked = await person(`${tag} B unlinked`, {});
    const revoked = await person(`${tag} C revoked`, { link: 'REVOKED' });
    const blocked = await person(`${tag} D blocked`, { status: 'BLOCKED', link: 'ACTIVE' });
    const page = await service.audience(user, { search: tag, page: 1 });
    expect(page.items.map(({ id, eligible, reason }) => ({ id, eligible, reason }))).toEqual([
      { id: linked, eligible: true, reason: null },
      { id: unlinked, eligible: false, reason: 'UNLINKED' },
      { id: revoked, eligible: false, reason: 'UNLINKED' },
      { id: blocked, eligible: false, reason: 'INACTIVE' },
    ]);
    const all = await service.audience(user, { search: tag, page: 1 }, true);
    expect(all.items.map((item) => item.id)).toEqual([linked]);
    expect(all.total).toBe(1);
  });
});
describe('communication transactions and authorization', () => {
  it('commits one campaign and one ordered batch for concurrent identical requests', async () => {
    const f = await fixture();
    const [a, b] = await Promise.all([
      service.create(f.user, f.command),
      service.create(f.user, f.command),
    ]);
    expect(a).toEqual(b);
    const detail = await service.detail(f.user, a.id);
    expect(detail.recipients).toHaveLength(1);
    expect(detail.recipients[0]?.parts.map((p) => p.ordinal)).toEqual([0, 1]);
    await expect(
      service.create(f.user, { ...f.command, text: 'Different content' }),
    ).rejects.toMatchObject({ code: 'COMMUNICATION_REQUEST_CONFLICT' });
  });
  it('rejects the entire audience without recording a partial campaign', async () => {
    const f = await fixture();
    await expect(
      service.create(f.user, { ...f.command, recipientIds: [f.employeeId, randomUUID()] }),
    ).rejects.toMatchObject({ code: 'COMMUNICATION_AUDIENCE_CHANGED' });
    expect(
      await test.db.select().from(communications).where(eq(communications.senderId, f.user.id)),
    ).toHaveLength(0);
  });
  it('does not disclose history or answers to another sender or after role revocation', async () => {
    const f = await fixture();
    const other = await fixture();
    const created = await service.create(f.user, f.command);
    await expect(service.detail(other.user, created.id)).rejects.toMatchObject({
      code: 'COMMUNICATION_NOT_FOUND',
    });
    await test.db.delete(webUserRoles).where(eq(webUserRoles.userId, f.user.id));
    expect((await service.history(f.user, 1)).total).toBe(0);
    await expect(service.detail(f.user, created.id)).rejects.toMatchObject({
      code: 'COMMUNICATION_NOT_FOUND',
    });
  });
  it('adopts only owned ready attachments and preserves adopted objects during cleanup', async () => {
    const f = await fixture();
    const other = await fixture();
    const id = randomUUID();
    await test.db.insert(communicationAttachments).values({
      id,
      ownerId: f.user.id,
      storageKey: id,
      filename: 'brief.pdf',
      contentType: 'application/pdf',
      sizeBytes: 20,
      sha256: 'a'.repeat(64),
      status: 'READY',
      expiresAt: new Date(Date.now() + 60000),
    });
    await expect(
      service.create(other.user, { ...other.command, attachmentIds: [id] }),
    ).rejects.toMatchObject({ code: 'COMMUNICATION_ATTACHMENT_INVALID' });
    const result = await service.create(f.user, { ...f.command, attachmentIds: [id] });
    const remove = vi.fn(async () => {});
    const media = new CommunicationMediaService(
      test.db,
      { presignGet: async () => 'https://example.test/file', delete: remove },
      service,
      singleTenantRegistry(),
    );
    await test.db
      .update(communicationAttachments)
      .set({ expiresAt: new Date(0) })
      .where(eq(communicationAttachments.id, id));
    await media.cleanup();
    expect(remove).not.toHaveBeenCalled();
    expect((await service.detail(f.user, result.id)).attachments).toHaveLength(1);
  });
  it('retries only a failed part belonging to the visible campaign', async () => {
    const f = await fixture();
    const created = await service.create(f.user, f.command);
    const detail = await service.detail(f.user, created.id);
    const part = detail.recipients[0]?.parts[0];
    if (!part) throw new Error('Missing part');
    await expect(service.retry(f.user, created.id, part.id)).rejects.toMatchObject({
      code: 'COMMUNICATION_RETRY_UNAVAILABLE',
    });
    await test.db
      .update(communicationParts)
      .set({ status: 'UNKNOWN' })
      .where(eq(communicationParts.id, part.id));
    await service.retry(f.user, created.id, part.id);
    expect((await service.detail(f.user, created.id)).recipients[0]?.parts[0]?.status).toBe(
      'PENDING',
    );
  });
});
describe('named questionnaire answers', () => {
  it('resumes a saved draft, rejects stale edits, submits once and preserves final answers after close', async () => {
    const f = await fixture();
    const { id } = await service.create(f.user, f.command);
    const command: SaveQuestionnaire = {
      expectedVersion: 0,
      answers: { [f.questionId]: { kind: 'TEXT', text: 'More handover time' } },
      questionIndex: 1,
      submit: false,
    };
    const saved = await questionnaires.save(id, f.telegramId, command);
    expect(saved.version).toBe(1);
    expect(saved.locale).toBe('uk');
    expect((await questionnaires.save(id, f.telegramId, command)).version).toBe(1);
    await expect(
      questionnaires.save(id, f.telegramId, { ...command, answers: {} }),
    ).rejects.toMatchObject({ code: 'QUESTIONNAIRE_VERSION_CONFLICT' });
    const final = { ...command, expectedVersion: 1, submit: true };
    const submitted = await questionnaires.save(id, f.telegramId, final);
    expect(submitted.submittedAt).not.toBeNull();
    await service.close(f.user, id);
    expect((await questionnaires.save(id, f.telegramId, final)).submittedAt).toBe(
      submitted.submittedAt,
    );
    await expect(
      questionnaires.save(id, f.telegramId, { ...final, answers: {} }),
    ).rejects.toMatchObject({ code: 'QUESTIONNAIRE_VERSION_CONFLICT' });
    expect((await service.detail(f.user, id)).submittedCount).toBe(1);
  });
  it('rejects missing required answers, foreign identities and revoked bindings', async () => {
    const f = await fixture();
    const { id } = await service.create(f.user, f.command);
    await expect(
      questionnaires.save(id, f.telegramId, {
        expectedVersion: 0,
        answers: {},
        questionIndex: 1,
        submit: true,
      }),
    ).rejects.toMatchObject({ code: 'QUESTIONNAIRE_ANSWER_INVALID' });
    await expect(questionnaires.read(id, f.telegramId + 1)).rejects.toMatchObject({
      code: 'QUESTIONNAIRE_NOT_FOUND',
    });
    await test.db
      .update(telegramAccounts)
      .set({ status: 'REVOKED' })
      .where(eq(telegramAccounts.id, f.accountId));
    await expect(questionnaires.read(id, f.telegramId)).rejects.toMatchObject({
      code: 'QUESTIONNAIRE_NOT_FOUND',
    });
  });
  it('serializes close with a concurrent final submission', async () => {
    const f = await fixture();
    const { id } = await service.create(f.user, f.command);
    const results = await Promise.allSettled([
      service.close(f.user, id),
      questionnaires.save(id, f.telegramId, {
        expectedVersion: 0,
        answers: { [f.questionId]: { kind: 'TEXT', text: 'Good' } },
        questionIndex: 1,
        submit: true,
      }),
    ]);
    expect(results[0]?.status).toBe('fulfilled');
    const read = await questionnaires.read(id, f.telegramId);
    expect(read.closed).toBe(true);
    if (results[1]?.status === 'fulfilled') expect(read.submittedAt).not.toBeNull();
    else {
      expect(read.submittedAt).toBeNull();
      expect(results[1]).toMatchObject({ reason: { code: 'QUESTIONNAIRE_CLOSED' } });
    }
    const rows = await test.db
      .select()
      .from(communicationRecipients)
      .where(eq(communicationRecipients.communicationId, id));
    expect(rows).toHaveLength(1);
  });
});
