import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '@vakhta/db';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { InMemoryShortTermStore } from '../infra/short-term-store.js';
import { ActivationService } from '../identity/activation.service.js';
import { EmployeesService } from '../identity/employees.service.js';
import { TelegramContactsService } from '../identity/telegram-contacts.service.js';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { ActivationDeliveryService } from './activation-delivery.service.js';
import type { MailMessage } from './mail.js';

const HR = { type: 'WEB_USER', id: null, role: 'HR', label: 'test-hr' } as const;

function config(): ConfigService<Env, true> {
  const values: Record<string, unknown> = {
    DEFAULT_SITE_TIMEZONE: 'Europe/Kyiv',
    TELEGRAM_BOT_USERNAME: 'VakhtaTestBot',
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
}

describe('activation delivery: the card goes by e-mail or to the Telegram chat of the employee', () => {
  let testDb: TestDatabase;
  let employees: EmployeesService;
  let activation: ActivationService;
  let contacts: TelegramContactsService;
  const mails: MailMessage[] = [];
  const photos: { chatId: number; caption: string; url: string; bytes: number }[] = [];
  let delivery: ActivationDeliveryService;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const events = new EventStore();
    const audit = new AuditLog();
    employees = new EmployeesService(testDb.db, events, audit);
    activation = new ActivationService(
      testDb.db,
      new InMemoryShortTermStore(),
      events,
      audit,
      employees,
      {
        pepper: 'integration-test-pepper-0123456789',
        ttlHours: 72,
        maxAttempts: 5,
        pendingTtlSeconds: 600,
        botUsername: 'VakhtaTestBot',
      },
    );
    contacts = new TelegramContactsService(testDb.db, new InMemoryShortTermStore());
    delivery = new ActivationDeliveryService(
      testDb.db,
      config(),
      employees,
      activation,
      contacts,
      audit,
      {
        send: async (m) => {
          mails.push(m);
        },
      },
      {
        enabled: true,
        sendActivationCard: async (chatId, card) => {
          photos.push({ chatId, caption: card.caption, url: card.url, bytes: card.png.length });
        },
      },
    );
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE telegram_contacts, telegram_accounts, activation_codes, employees CASCADE`,
    );
    mails.length = 0;
    photos.length = 0;
  });

  it('e-mail: a fresh code, the deep link and the QR inline; the address is masked in the answer', async () => {
    const emp = await employees.create(
      {
        personnelNumber: '000123',
        fullName: 'Іваненко Іван',
        status: 'ACTIVE',
        email: 'ivan.ivanenko@example.com',
      },
      HR,
    );
    const sent = await delivery.send(emp.id, 'EMAIL', HR);
    expect(sent.channel).toBe('EMAIL');
    expect(sent.sentTo).toBe('iv…@example.com');
    expect(sent.issued.code).toHaveLength(8);
    expect(mails).toHaveLength(1);
    const mail = mails[0]!;
    expect(mail.to).toBe('ivan.ivanenko@example.com');
    expect(mail.subject).toContain('Вахта');
    expect(mail.text).toContain(sent.issued.code);
    expect(mail.text).toContain(sent.issued.deepLink);
    expect(mail.html).toContain('cid:activation-qr');
    expect(mail.attachments?.[0]).toMatchObject({ cid: 'activation-qr', contentType: 'image/png' });
    expect(mail.attachments?.[0]?.content.length).toBeGreaterThan(100);

    const noMail = await employees.create(
      { personnelNumber: '000124', fullName: 'Петренко Петро', status: 'ACTIVE' },
      HR,
    );
    await expect(delivery.send(noMail.id, 'EMAIL', HR)).rejects.toMatchObject({
      code: 'EMPLOYEE_NO_EMAIL',
    });
  });

  it('Telegram: refused until the employee has opened the bot, then a photo with the button', async () => {
    const emp = await employees.create(
      {
        personnelNumber: '000125',
        fullName: 'Сидоренко Ольга',
        status: 'ACTIVE',
        telegramUsername: 'Olha_Sydorenko',
      },
      HR,
    );
    await expect(delivery.send(emp.id, 'TELEGRAM', HR)).rejects.toMatchObject({
      code: 'TELEGRAM_NOT_STARTED',
    });
    expect(photos).toHaveLength(0);

    // the bot saw her /start: username is matched case-insensitively
    await contacts.remember(
      { id: 500_001, username: 'olha_sydorenko', first_name: 'Olha', language_code: 'uk' },
      500_001,
    );
    const sent = await delivery.send(emp.id, 'TELEGRAM', HR);
    expect(sent.sentTo).toBe('@Olha_Sydorenko');
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({ chatId: 500_001, url: sent.issued.deepLink });
    expect(photos[0]!.caption).toContain(sent.issued.code);
    expect(photos[0]!.bytes).toBeGreaterThan(100);
  });
});
