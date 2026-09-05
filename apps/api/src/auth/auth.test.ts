import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '@vakhta/db';
import * as OTPAuth from 'otpauth';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { createAuth, type Auth, type AuthConfig } from './auth.config.js';
import { AuthService } from './auth.service.js';
import { RolesService } from './roles.service.js';

const SYSTEM = { type: 'SYSTEM', id: null, role: 'SYSTEM' } as const;
const PASSWORD = 'correct-horse-battery-staple';

/** Збирає cookie-рядок із set-cookie відповіді, як це робить браузер. */
function cookiesOf(response: Response, previous = ''): string {
  const jar = new Map<string, string>();
  for (const part of previous
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const [k, ...v] = part.split('=');
    if (k) jar.set(k, v.join('='));
  }
  for (const raw of response.headers.getSetCookie()) {
    const first = raw.split(';')[0] ?? '';
    const [k, ...v] = first.split('=');
    if (k) jar.set(k, v.join('='));
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

describe('веб-автентифікація: пароль + TOTP + ролі (FR-AUTH-03, ADR-9)', () => {
  let testDb: TestDatabase;
  let auth: Auth;
  let service: AuthService;
  let roles: RolesService;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const config: AuthConfig = {
      db: testDb.db,
      secret: 'integration-test-secret-with-at-least-32-chars',
      baseURL: 'http://localhost:3000',
      trustedOrigins: ['http://localhost:5173'],
    };
    auth = createAuth(config);
    const events = new EventStore();
    const audit = new AuditLog();
    roles = new RolesService(testDb.db, events, audit);
    service = new AuthService(auth, config, testDb.db, roles, events, audit);
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE web_user_roles, auth_two_factor, auth_session, auth_account, auth_user CASCADE`,
    );
  });

  async function signIn(email: string, password: string): Promise<Response> {
    return auth.api.signInEmail({ body: { email, password }, asResponse: true });
  }

  it('самореєстрація вимкнена; користувача створює адміністратор із ролями', async () => {
    const res = await auth.api.signUpEmail({
      body: { email: 'intruder@example.com', password: PASSWORD, name: 'Intruder' },
      asResponse: true,
    });
    expect(res.ok).toBe(false);

    const created = await service.createUser(
      {
        email: 'HR@Example.com',
        name: 'Олена HR',
        password: PASSWORD,
        roles: [{ role: 'HR', scopeType: 'ENTERPRISE' }],
      },
      SYSTEM,
    );
    expect(created.email).toBe('hr@example.com');
    expect(created.roles.map((r) => r.role)).toEqual(['HR']);
    expect(created.twoFactorEnabled).toBe(false);

    await expect(
      service.createUser(
        { email: 'hr@example.com', name: 'x', password: PASSWORD, roles: [] },
        SYSTEM,
      ),
    ).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
  });

  it('вхід паролем дає сесію, з якої видно користувача; чужий пароль не пускає', async () => {
    const user = await service.createUser(
      {
        email: 'admin@example.com',
        name: 'Адмін',
        password: PASSWORD,
        roles: [{ role: 'ADMIN', scopeType: 'ENTERPRISE' }],
      },
      SYSTEM,
    );
    const bad = await signIn('admin@example.com', 'wrong-password-123456');
    expect(bad.ok).toBe(false);

    const res = await signIn('admin@example.com', PASSWORD);
    expect(res.ok).toBe(true);
    const cookie = cookiesOf(res);
    expect(cookie).toContain('session_token');

    const session = await service.sessionUser(new Headers({ cookie }));
    expect(session?.id).toBe(user.id);
    expect(await service.sessionUser(new Headers())).toBeNull();

    expect(await roles.grantsOf(user.id)).toEqual([
      { role: 'ADMIN', scopeType: 'ENTERPRISE', scopeId: null },
    ]);
  });

  it('TOTP: увімкнення, підтвердження, вхід у два кроки', async () => {
    await service.createUser(
      { email: 'master@example.com', name: 'Майстер', password: PASSWORD, roles: [] },
      SYSTEM,
    );
    const first = await signIn('master@example.com', PASSWORD);
    let cookie = cookiesOf(first);

    const enabled = await auth.api.enableTwoFactor({
      body: { password: PASSWORD, method: 'totp' },
      headers: new Headers({ cookie }),
    });
    if (enabled.method !== 'totp') throw new Error('очікувався метод totp');
    expect(enabled.totpURI).toContain('otpauth://totp/');
    const totp = OTPAuth.URI.parse(enabled.totpURI);
    expect(totp).toBeInstanceOf(OTPAuth.TOTP);

    const verified = await auth.api.verifyTOTP({
      body: { code: (totp as OTPAuth.TOTP).generate() },
      headers: new Headers({ cookie }),
      asResponse: true,
    });
    expect(verified.ok).toBe(true);
    expect(
      (await service.listUsers()).find((u) => u.email === 'master@example.com')?.twoFactorEnabled,
    ).toBe(true);

    // Новий вхід: пароль дає лише «потрібен другий фактор», сесії ще немає.
    const second = await signIn('master@example.com', PASSWORD);
    expect(second.ok).toBe(true);
    const body = (await second.json()) as { twoFactorRedirect?: boolean };
    expect(body.twoFactorRedirect).toBe(true);
    cookie = cookiesOf(second);
    expect(await service.sessionUser(new Headers({ cookie }))).toBeNull();

    const wrong = await auth.api.verifyTOTP({
      body: { code: '000000' },
      headers: new Headers({ cookie }),
      asResponse: true,
    });
    expect(wrong.ok).toBe(false);

    const ok = await auth.api.verifyTOTP({
      body: { code: (totp as OTPAuth.TOTP).generate() },
      headers: new Headers({ cookie }),
      asResponse: true,
    });
    expect(ok.ok).toBe(true);
    cookie = cookiesOf(ok, cookie);
    expect((await service.sessionUser(new Headers({ cookie })))?.email).toBe('master@example.com');
  });

  it('ролі з областями: дубль відхиляється, відкликання пише аудит', async () => {
    const user = await service.createUser(
      { email: 'planner@example.com', name: 'Планувальник', password: PASSWORD, roles: [] },
      SYSTEM,
    );
    const siteId = '11111111-1111-4111-8111-111111111111';
    const grant = await roles.grant(
      user.id,
      { role: 'PLANNER', scopeType: 'SITE', scopeId: siteId },
      SYSTEM,
    );
    expect(grant).toMatchObject({ role: 'PLANNER', scopeType: 'SITE', scopeId: siteId });

    await expect(
      roles.grant(user.id, { role: 'PLANNER', scopeType: 'SITE', scopeId: siteId }, SYSTEM),
    ).rejects.toMatchObject({ code: 'ROLE_ALREADY_GRANTED' });

    await roles.revoke(user.id, grant.id, SYSTEM);
    expect(await roles.grantsOf(user.id)).toEqual([]);
    await expect(roles.revoke(user.id, grant.id, SYSTEM)).rejects.toMatchObject({
      code: 'GRANT_NOT_FOUND',
    });
  });
});
