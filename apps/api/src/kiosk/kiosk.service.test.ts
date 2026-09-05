import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from '@vakhta/db';
import { qrChallenges, qrTerminals } from '@vakhta/db';
import { hashChallengeToken } from '@vakhta/domain/node';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { OrgService } from '../org/org.service.js';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { KioskService } from './kiosk.service.js';

const ADMIN = { type: 'WEB_USER', id: null, role: 'ADMIN', label: 'test-admin' } as const;

describe('kiosk: реєстрація терміналу і видача challenge (FR-QR-01…04, ADR-4)', () => {
  let testDb: TestDatabase;
  let org: OrgService;
  let kiosk: KioskService;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    org = new OrgService(testDb.db, new EventStore(), new AuditLog());
    kiosk = new KioskService(testDb.db, {
      rotationSeconds: 45,
      ttlSeconds: 90,
      botUsername: 'VakhtaTestBot',
    });
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.db.execute(sql`TRUNCATE qr_challenges, qr_terminals, sites CASCADE`);
  });

  it('відхиляє майданчик із невідомим часовим поясом', async () => {
    await expect(
      org.createSite({ code: 'mars', name: 'Марс', timezone: 'Mars/Olympus' }, ADMIN),
    ).rejects.toMatchObject({ code: 'INVALID_TIMEZONE', status: 422 });
  });

  it('реєструє термінал, показує токен один раз і зберігає лише хеш', async () => {
    const site = await org.createSite(
      { code: 'main', name: 'Основная', timezone: 'Europe/Kyiv' },
      ADMIN,
    );
    const registered = await org.registerTerminal(
      { siteId: site.id, name: 'Проходная', checkpoint: 'BOTH' },
      ADMIN,
    );
    expect(registered.deviceToken.length).toBeGreaterThanOrEqual(32);

    const [row] = await testDb.db
      .select()
      .from(qrTerminals)
      .where(eq(qrTerminals.id, registered.id));
    expect(row?.deviceTokenHash).not.toContain(registered.deviceToken);

    const snapshot = await org.snapshot();
    expect(snapshot.terminals).toHaveLength(1);
    expect(JSON.stringify(snapshot)).not.toContain(registered.deviceToken);
  });

  it('видає challenge лише відомому активному терміналу, з TTL і deep link ≤ 64 символів', async () => {
    const site = await org.createSite(
      { code: 'main', name: 'Основная', timezone: 'Europe/Kyiv' },
      ADMIN,
    );
    const { deviceToken, id } = await org.registerTerminal(
      { siteId: site.id, name: 'Проходная', checkpoint: 'ENTRY' },
      ADMIN,
    );

    expect(await kiosk.issueChallenge('unknown-device-token-xxxxxxxx')).toBeNull();

    const before = Date.now();
    const challenge = await kiosk.issueChallenge(deviceToken);
    expect(challenge).not.toBeNull();
    if (!challenge) return;

    const startParam = new URL(challenge.deepLink).searchParams.get('start') ?? '';
    expect(startParam).toHaveLength(22);
    expect(challenge.rotationSeconds).toBe(45);
    expect(challenge.terminalName).toBe('Проходная');
    const ttlMs = new Date(challenge.expiresAt).getTime() - before;
    expect(ttlMs).toBeGreaterThan(85_000);
    expect(ttlMs).toBeLessThanOrEqual(90_500);

    const [stored] = await testDb.db
      .select()
      .from(qrChallenges)
      .where(eq(qrChallenges.terminalId, id));
    expect(stored?.tokenHash).toBe(hashChallengeToken(startParam));

    const [terminal] = await testDb.db.select().from(qrTerminals).where(eq(qrTerminals.id, id));
    expect(terminal?.lastSeenAt).not.toBeNull();
  });

  it('два запити дають два різних challenge, а вимкнений термінал нічого не отримує', async () => {
    const site = await org.createSite(
      { code: 'main', name: 'Основная', timezone: 'Europe/Kyiv' },
      ADMIN,
    );
    const { deviceToken, id } = await org.registerTerminal(
      { siteId: site.id, name: 'Выход', checkpoint: 'EXIT' },
      ADMIN,
    );
    const a = await kiosk.issueChallenge(deviceToken);
    const b = await kiosk.issueChallenge(deviceToken);
    expect(a?.deepLink).not.toBe(b?.deepLink);

    await testDb.db.update(qrTerminals).set({ status: 'DISABLED' }).where(eq(qrTerminals.id, id));
    expect(await kiosk.issueChallenge(deviceToken)).toBeNull();
  });
});
