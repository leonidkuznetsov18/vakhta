import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from '@vakhta/db';
import { activationCodes, auditLog, domainEvents, employees, telegramAccounts } from '@vakhta/db';
import { UpdateEmployeeCommand } from '@vakhta/contracts';
import { codeFromDeepLink } from '@vakhta/domain';
import { isUniqueViolation } from '../common/pg-errors.js';
import { InMemoryShortTermStore } from '../infra/short-term-store.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { ActivationService } from './activation.service.js';
import { EmployeesService } from './employees.service.js';
import { IdentityError } from './identity.errors.js';

const HR = { type: 'WEB_USER', id: null, role: 'HR', label: 'test-hr' } as const;
const TG_IVANOV = 100_001;
const TG_PETROVA = 100_002;

describe('identity: активація і привʼязка Telegram (ТЗ 2.2, FR-AUTH-01/02)', () => {
  let testDb: TestDatabase;
  let employeesService: EmployeesService;
  let activation: ActivationService;
  let store: InMemoryShortTermStore;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const events = new EventStore();
    const audit = new AuditLog();
    employeesService = new EmployeesService(testDb.db, events, audit);
    store = new InMemoryShortTermStore();
    activation = new ActivationService(testDb.db, store, events, audit, employeesService, {
      pepper: 'integration-test-pepper-0123456789',
      ttlHours: 72,
      maxAttempts: 5,
      pendingTtlSeconds: 600,
      botUsername: 'VakhtaTestBot',
    });
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.db.execute(sql`TRUNCATE telegram_accounts, activation_codes, employees CASCADE`);
    store = new InMemoryShortTermStore();
    // Тести ділять один сервіс; підмінити сховище простіше, ніж перебудовувати граф.
    Object.assign(activation, { store });
  });

  async function createIvanov(status: 'ACTIVE' | 'BLOCKED' | 'TERMINATED' = 'ACTIVE') {
    return employeesService.create(
      { personnelNumber: '000123', fullName: 'Иванов Иван Иванович', status },
      HR,
    );
  }

  it('HR edits the card: number, name and contacts; an empty contact clears it; numbers stay unique', async () => {
    const ivanov = await createIvanov();
    await employeesService.create(
      { personnelNumber: '000124', fullName: 'Петров Пётр Петрович', status: 'ACTIVE' },
      HR,
    );
    // The controller parses the command first: the contract normalizes the contacts.
    const updated = await employeesService.update(
      ivanov.id,
      UpdateEmployeeCommand.parse({
        fullName: 'Иванов Иван',
        email: 'Ivan@Example.com',
        phone: '067 123 45 67',
      }),
      HR,
    );
    expect(updated).toMatchObject({
      personnelNumber: '000123',
      fullName: 'Иванов Иван',
      email: 'ivan@example.com',
      phone: '+380671234567',
      telegramUsername: null,
    });
    const cleared = await employeesService.update(
      ivanov.id,
      UpdateEmployeeCommand.parse({ email: '' }),
      HR,
    );
    expect(cleared.email).toBeNull();
    expect(cleared.phone).toBe('+380671234567');
    await expect(
      employeesService.update(ivanov.id, { personnelNumber: '000124' }, HR),
    ).rejects.toMatchObject({ code: 'PERSONNEL_NUMBER_TAKEN' });
    const view = await employeesService.viewOf(ivanov.id);
    expect(view).toMatchObject({ fullName: 'Иванов Иван', telegramLinked: false });
    const [audit] = await testDb.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'employee.update'))
      .limit(1);
    expect(audit?.before).toMatchObject({ fullName: 'Иванов Иван Иванович' });
  });

  it('a card without worked history is deleted with its codes and links', async () => {
    const ivanov = await createIvanov();
    await activation.issue(ivanov.id, HR);
    await employeesService.deleteEmployee(ivanov.id, { reason: 'created by mistake' }, HR);
    expect(await employeesService.getById(ivanov.id)).toBeNull();
    expect(await testDb.db.select().from(activationCodes)).toHaveLength(0);
    const [audit] = await testDb.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'employee.delete'))
      .limit(1);
    expect(audit?.reason).toBe('created by mistake');
    await expect(
      employeesService.deleteEmployee(ivanov.id, { reason: 'again' }, HR),
    ).rejects.toMatchObject({ code: 'EMPLOYEE_NOT_FOUND' });
  });

  it('повний цикл: картка → код → превʼю → підтвердження → активна привʼязка', async () => {
    const ivanov = await createIvanov();
    const issued = await activation.issue(ivanov.id, HR);
    expect(issued.code).toHaveLength(8);
    expect(issued.deepLink).toMatch(/^https:\/\/t\.me\/VakhtaTestBot\?start=act-/);

    const [stored] = await testDb.db
      .select()
      .from(activationCodes)
      .where(eq(activationCodes.employeeId, ivanov.id));
    expect(stored?.codeHash).not.toContain(issued.code);

    const codeFromLink = codeFromDeepLink(new URL(issued.deepLink).searchParams.get('start') ?? '');
    expect(codeFromLink).toBe(issued.code);

    const preview = await activation.preview(TG_IVANOV, codeFromLink ?? '');
    expect(preview.ok).toBe(true);
    if (preview.ok) expect(preview.employee.id).toBe(ivanov.id);

    const outcome = await activation.confirm(TG_IVANOV);
    expect(outcome).toMatchObject({ ok: true, alreadyLinked: false });

    const linked = await employeesService.findByTelegramUserId(TG_IVANOV);
    expect(linked?.employee.id).toBe(ivanov.id);
    expect(linked?.link.status).toBe('ACTIVE');

    const events = await testDb.db
      .select({ type: domainEvents.type })
      .from(domainEvents)
      .where(eq(domainEvents.employeeId, ivanov.id))
      .orderBy(domainEvents.receivedAt);
    expect(events.map((e) => e.type)).toEqual([
      'EMPLOYEE_CREATED',
      'ACTIVATION_CODE_ISSUED',
      'TELEGRAM_LINKED',
    ]);
  });

  it('використаний код не спрацьовує вдруге, а підтвердження без превʼю відхиляється', async () => {
    const ivanov = await createIvanov();
    const { code } = await activation.issue(ivanov.id, HR);
    await activation.preview(TG_IVANOV, code);
    await activation.confirm(TG_IVANOV);

    expect(await activation.preview(TG_PETROVA, code)).toEqual({ ok: false, reason: 'CODE_USED' });
    expect(await activation.confirm(TG_PETROVA)).toEqual({ ok: false, reason: 'NO_PENDING' });
  });

  it('прострочений код відхиляється', async () => {
    const ivanov = await createIvanov();
    const { code } = await activation.issue(ivanov.id, HR);
    await testDb.db
      .update(activationCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(activationCodes.employeeId, ivanov.id));
    expect(await activation.preview(TG_IVANOV, code)).toEqual({
      ok: false,
      reason: 'CODE_EXPIRED',
    });
  });

  it('нормалізація прощає регістр і дефіси, чужі символи дають INVALID_CODE', async () => {
    const ivanov = await createIvanov();
    const { code } = await activation.issue(ivanov.id, HR);
    const sloppy = `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`;
    expect((await activation.preview(TG_IVANOV, sloppy)).ok).toBe(true);
    expect(await activation.preview(TG_PETROVA, 'ZZZZ9999')).toEqual({
      ok: false,
      reason: 'INVALID_CODE',
    });
    expect(await activation.preview(TG_PETROVA, 'not a code')).toEqual({
      ok: false,
      reason: 'INVALID_CODE',
    });
  });

  it("після п'яти невдалих спроб шоста відхиляється навіть із правильним кодом", async () => {
    const ivanov = await createIvanov();
    const { code } = await activation.issue(ivanov.id, HR);
    for (let i = 0; i < 5; i += 1) {
      expect(await activation.preview(TG_IVANOV, 'AAAA2222')).toEqual({
        ok: false,
        reason: 'INVALID_CODE',
      });
    }
    expect(await activation.preview(TG_IVANOV, code)).toEqual({
      ok: false,
      reason: 'ATTEMPTS_EXCEEDED',
    });
  });

  it('FR-AUTH-01: заблокований і звільнений працівник не активується', async () => {
    const blocked = await createIvanov('BLOCKED');
    await expect(activation.issue(blocked.id, HR)).rejects.toBeInstanceOf(IdentityError);

    const active = await employeesService.create(
      { personnelNumber: '000777', fullName: 'Петрова Ольга', status: 'ACTIVE' },
      HR,
    );
    const { code } = await activation.issue(active.id, HR);
    await employeesService.changeStatus(
      active.id,
      { status: 'TERMINATED', reason: 'звільнення' },
      HR,
    );
    expect(await activation.preview(TG_PETROVA, code)).toEqual({
      ok: false,
      reason: 'EMPLOYEE_TERMINATED',
    });
  });

  it('один Telegram-акаунт не привʼязується до двох працівників; база теж відмовляє', async () => {
    const ivanov = await createIvanov();
    const petrova = await employeesService.create(
      { personnelNumber: '000777', fullName: 'Петрова Ольга', status: 'ACTIVE' },
      HR,
    );
    const first = await activation.issue(ivanov.id, HR);
    await activation.preview(TG_IVANOV, first.code);
    await activation.confirm(TG_IVANOV);

    const second = await activation.issue(petrova.id, HR);
    expect(await activation.preview(TG_IVANOV, second.code)).toEqual({
      ok: false,
      reason: 'TELEGRAM_ALREADY_LINKED',
    });

    await expect(
      testDb.db
        .insert(telegramAccounts)
        .values({ employeeId: petrova.id, telegramUserId: TG_IVANOV }),
    ).rejects.toSatisfy((error) => isUniqueViolation(error));
  });

  it('картка з активною привʼязкою не приймає інший Telegram-акаунт через код', async () => {
    const ivanov = await createIvanov();
    const first = await activation.issue(ivanov.id, HR);
    await activation.preview(TG_IVANOV, first.code);
    await activation.confirm(TG_IVANOV);

    const second = await activation.issue(ivanov.id, HR);
    expect(await activation.preview(TG_PETROVA, second.code)).toEqual({
      ok: false,
      reason: 'EMPLOYEE_ALREADY_LINKED',
    });
  });

  it('FR-AUTH-02: перепривʼязка HR відкликає стару привʼязку з причиною і пише аудит', async () => {
    const ivanov = await createIvanov();
    const { code } = await activation.issue(ivanov.id, HR);
    await activation.preview(TG_IVANOV, code);
    await activation.confirm(TG_IVANOV);

    const link = await employeesService.relinkTelegram(
      ivanov.id,
      { telegramUserId: TG_PETROVA, reason: 'загубив телефон' },
      { ...HR, id: null },
    );
    expect(link.telegramUserId).toBe(TG_PETROVA);

    const links = await testDb.db
      .select()
      .from(telegramAccounts)
      .where(eq(telegramAccounts.employeeId, ivanov.id))
      .orderBy(telegramAccounts.linkedAt);
    expect(links.map((l) => [l.telegramUserId, l.status, l.revokeReason])).toEqual([
      [TG_IVANOV, 'REVOKED', 'загубив телефон'],
      [TG_PETROVA, 'ACTIVE', null],
    ]);

    expect(await employeesService.findByTelegramUserId(TG_IVANOV)).toBeNull();
    expect((await employeesService.findByTelegramUserId(TG_PETROVA))?.employee.id).toBe(ivanov.id);

    const audit = await testDb.db
      .select({ action: auditLog.action, reason: auditLog.reason })
      .from(auditLog)
      .where(eq(auditLog.objectId, ivanov.id));
    expect(audit.map((a) => a.action)).toContain('employee.telegram.relink');
    expect(audit.find((a) => a.action === 'employee.telegram.relink')?.reason).toBe(
      'загубив телефон',
    );

    await expect(
      employeesService.relinkTelegram(
        ivanov.id,
        { telegramUserId: TG_PETROVA, reason: 'повтор' },
        HR,
      ),
    ).rejects.toMatchObject({ code: 'SAME_TELEGRAM_USER' });
  });

  it('issues codes for several employees at once and skips inactive ones', async () => {
    const ivanov = await createIvanov();
    const blocked = await employeesService.create(
      { personnelNumber: '000777', fullName: 'Заблокированный', status: 'BLOCKED' },
      HR,
    );
    const issued = await activation.issueMany([ivanov.id, blocked.id, ivanov.id], HR);
    expect(issued).toHaveLength(1);
    expect(issued[0]?.employeeId).toBe(ivanov.id);
    expect(issued[0]?.code).toHaveLength(8);
  });

  it('CSV import creates new cards and reports duplicates without failing the batch', async () => {
    await createIvanov();
    const result = await employeesService.importMany(
      {
        items: [
          { personnelNumber: '000123', fullName: 'Иванов Иван' },
          { personnelNumber: '0002', fullName: 'Петрова Анна' },
          { personnelNumber: '0002', fullName: 'Петрова Анна (дубль)' },
          { personnelNumber: '0003', fullName: 'Сидоров Пётр' },
        ],
      },
      HR,
    );
    expect(result.created).toBe(2);
    expect(result.skipped).toEqual([
      { personnelNumber: '000123', reason: 'DUPLICATE' },
      { personnelNumber: '0002', reason: 'DUPLICATE' },
    ]);
    const rows = await testDb.db.select({ id: employees.id }).from(employees);
    expect(rows).toHaveLength(3);
  });

  it('повторний табельний номер дає PERSONNEL_NUMBER_TAKEN, а не 500', async () => {
    await createIvanov();
    await expect(createIvanov()).rejects.toMatchObject({ code: 'PERSONNEL_NUMBER_TAKEN' });
    const count = await testDb.db.select({ id: employees.id }).from(employees);
    expect(count).toHaveLength(1);
  });
});
