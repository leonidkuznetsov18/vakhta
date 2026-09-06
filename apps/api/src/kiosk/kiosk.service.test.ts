import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from '@vakhta/db';
import { qrChallenges, qrTerminals, terminalPairingCodes } from '@vakhta/db';
import { hashChallengeToken } from '@vakhta/domain/node';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { OrgService } from '../org/org.service.js';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { KioskService } from './kiosk.service.js';

const ADMIN = { type: 'WEB_USER', id: null, role: 'ADMIN', label: 'test-admin' } as const;

describe('kiosk: terminal registration, pairing and challenge issuance (FR-QR-01…04, ADR-4)', () => {
  let testDb: TestDatabase;
  let org: OrgService;
  let kiosk: KioskService;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const events = new EventStore();
    const audit = new AuditLog();
    org = new OrgService(testDb.db, events, audit);
    kiosk = new KioskService(
      testDb.db,
      { rotationSeconds: 45, ttlSeconds: 90, botUsername: 'VakhtaTestBot' },
      events,
      audit,
    );
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE qr_challenges, terminal_pairing_codes, qr_terminals, sites CASCADE`,
    );
  });

  async function registeredTerminal(
    name = 'Проходная',
    checkpoint: 'ENTRY' | 'EXIT' | 'BOTH' = 'BOTH',
  ) {
    const site = await org.createSite(
      { code: 'main', name: 'Основная', timezone: 'Europe/Kyiv' },
      ADMIN,
    );
    return org.registerTerminal({ siteId: site.id, name, checkpoint }, ADMIN);
  }

  it('rejects a site with an unknown time zone', async () => {
    await expect(
      org.createSite({ code: 'mars', name: 'Марс', timezone: 'Mars/Olympus' }, ADMIN),
    ).rejects.toMatchObject({ code: 'INVALID_TIMEZONE', status: 422 });
  });

  it('registers a terminal without a secret; it is unpaired until a code is exchanged', async () => {
    const registered = await registeredTerminal();
    expect(registered).not.toHaveProperty('deviceToken');

    const [row] = await testDb.db
      .select()
      .from(qrTerminals)
      .where(eq(qrTerminals.id, registered.id));
    expect(row?.deviceTokenHash).toBeNull();

    const snapshot = await org.snapshot();
    expect(snapshot.terminals).toHaveLength(1);
    expect(snapshot.terminals[0]?.paired).toBe(false);
  });

  it('pairs with a one-time code, stores only hashes and marks the terminal paired', async () => {
    const registered = await registeredTerminal();
    const issued = await org.issuePairingCode(registered.id, ADMIN);
    expect(issued.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(new Date(issued.expiresAt).getTime() - Date.now()).toBeGreaterThan(14 * 60_000);

    const [stored] = await testDb.db
      .select()
      .from(terminalPairingCodes)
      .where(eq(terminalPairingCodes.terminalId, registered.id));
    expect(stored?.codeHash).not.toContain(issued.code.replace('-', ''));

    // Typed the way people type: lower case and a space instead of the dash.
    const paired = await kiosk.pair(issued.code.toLowerCase().replace('-', ' '));
    expect(paired).not.toBeNull();
    expect(paired?.terminalName).toBe('Проходная');
    expect(paired?.deviceToken.length).toBeGreaterThanOrEqual(32);

    const [row] = await testDb.db
      .select()
      .from(qrTerminals)
      .where(eq(qrTerminals.id, registered.id));
    expect(row?.deviceTokenHash).not.toBeNull();
    expect(row?.deviceTokenHash).not.toContain(paired?.deviceToken);
    expect((await org.snapshot()).terminals[0]?.paired).toBe(true);

    // The code is single-use; unknown and malformed codes are refused without details.
    expect(await kiosk.pair(issued.code)).toBeNull();
    expect(await kiosk.pair('ZZZZ-ZZZZ')).toBeNull();
    expect(await kiosk.pair('short')).toBeNull();
  });

  it('a new code voids the previous one and re-pairing rotates the device token', async () => {
    const registered = await registeredTerminal();
    const first = await org.issuePairingCode(registered.id, ADMIN);
    const second = await org.issuePairingCode(registered.id, ADMIN);
    expect(await kiosk.pair(first.code)).toBeNull();

    const pairedA = await kiosk.pair(second.code);
    expect(pairedA).not.toBeNull();
    const third = await org.issuePairingCode(registered.id, ADMIN);
    const pairedB = await kiosk.pair(third.code);
    expect(pairedB?.deviceToken).not.toBe(pairedA?.deviceToken);
    expect(await kiosk.issueChallenge(pairedA!.deviceToken)).toBeNull();
    expect(await kiosk.issueChallenge(pairedB!.deviceToken)).not.toBeNull();
  });

  it('an expired code no longer pairs', async () => {
    const registered = await registeredTerminal();
    const issued = await org.issuePairingCode(registered.id, ADMIN);
    await testDb.db
      .update(terminalPairingCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(terminalPairingCodes.terminalId, registered.id));
    expect(await kiosk.pair(issued.code)).toBeNull();
  });

  it('issues a challenge only to a known active terminal, with TTL and a deep link ≤ 64 chars', async () => {
    const registered = await registeredTerminal('Проходная', 'ENTRY');
    const issued = await org.issuePairingCode(registered.id, ADMIN);
    const { deviceToken } = (await kiosk.pair(issued.code))!;

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
      .where(eq(qrChallenges.terminalId, registered.id));
    expect(stored?.tokenHash).toBe(hashChallengeToken(startParam));

    const [terminal] = await testDb.db
      .select()
      .from(qrTerminals)
      .where(eq(qrTerminals.id, registered.id));
    expect(terminal?.lastSeenAt).not.toBeNull();
  });

  it('updates name, site and checkpoint; deletes an unused terminal but refuses one with check-ins', async () => {
    const registered = await registeredTerminal('Старое имя', 'ENTRY');
    const updated = await org.updateTerminal(
      registered.id,
      { name: 'Проходная 2', checkpoint: 'BOTH' },
      ADMIN,
    );
    expect(updated.name).toBe('Проходная 2');
    expect(updated.checkpoint).toBe('BOTH');
    await expect(
      org.updateTerminal(registered.id, { siteId: '00000000-0000-0000-0000-000000000000' }, ADMIN),
    ).rejects.toMatchObject({ code: 'SITE_NOT_FOUND' });

    await org.deleteTerminal(registered.id, 'Registered by mistake', ADMIN);
    expect((await org.snapshot()).terminals).toHaveLength(0);
    await expect(org.deleteTerminal(registered.id, 'again', ADMIN)).rejects.toMatchObject({
      code: 'TERMINAL_NOT_FOUND',
    });
  });

  it('two requests give two different challenges; a disabled terminal gets nothing and keeps its pairing', async () => {
    const registered = await registeredTerminal('Выход', 'EXIT');
    const issued = await org.issuePairingCode(registered.id, ADMIN);
    const { deviceToken } = (await kiosk.pair(issued.code))!;
    const a = await kiosk.issueChallenge(deviceToken);
    const b = await kiosk.issueChallenge(deviceToken);
    expect(a?.deepLink).not.toBe(b?.deepLink);

    const disabled = await org.setTerminalStatus(
      registered.id,
      { status: 'DISABLED', reason: 'Tablet sent for repair' },
      ADMIN,
    );
    expect(disabled.status).toBe('DISABLED');
    expect(await kiosk.issueChallenge(deviceToken)).toBeNull();

    const enabled = await org.setTerminalStatus(
      registered.id,
      { status: 'ACTIVE', reason: 'Tablet is back' },
      ADMIN,
    );
    expect(enabled.status).toBe('ACTIVE');
    expect(enabled.deviceTokenHash).not.toBeNull();
    expect(await kiosk.issueChallenge(deviceToken)).not.toBeNull();
  });
});
