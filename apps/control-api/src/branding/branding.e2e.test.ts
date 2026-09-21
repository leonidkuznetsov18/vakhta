import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import sharp from 'sharp';
import { OperatorRole, TenantStatus, TenantSurface } from '@vakhta/domain';
import {
  createRegistry,
  eq,
  migrateRegistry,
  generateSecretKeyHex,
  SecretCipher,
  tenantSecrets,
  tenants,
  tenantDomains,
  controlAuditLog,
  type RegistryTenantSource,
} from '@vakhta/registry';
import type { TenantBrandingView } from '@vakhta/contracts';
import { ControlErrorFilter } from '../common/domain-error.js';
import { ensureDockerHost } from '../../test/docker.js';
import { AUTH } from '../auth/auth.module.js';
import { REGISTRY, TENANT_SOURCE } from '../infra/registry.module.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { BrandingService } from './branding.service.js';
import { LogoStorage } from './logo-storage.js';
import { normalizeLogo } from './logo.js';

const operator = {
  id: 'b0000000-0000-4000-8000-000000000001',
  email: 'ops@vakhta.test',
  name: 'Ops',
  role: OperatorRole.PLATFORM_ADMIN,
};
describe('tenant branding', () => {
  let postgres: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let service: BrandingService;
  let alpha: string;
  let beta: string;
  let image: string;
  const objects = new Map<string, Uint8Array>();
  const put = vi.fn(async (key: string, bytes: Uint8Array) => {
    objects.set(key, bytes);
  });

  beforeAll(async () => {
    ensureDockerHost();
    postgres = await new PostgreSqlContainer('postgres:16-alpine').withDatabase('control').start();
    const handle = createRegistry(postgres.getConnectionUri());
    await migrateRegistry(handle.db);
    await handle.client.end();
    const cipherKey = generateSecretKeyHex();
    Object.assign(process.env, {
      NODE_ENV: 'test',
      CONTROL_DATABASE_URL: postgres.getConnectionUri(),
      CONTROL_ENCRYPTION_KEY: cipherKey,
      CONTROL_AUTH_SECRET: 'branding-test-secret-at-least-32-characters',
      PANEL_HOST_PATTERN: '{slug}.vakhta.xyz',
      KIOSK_HOST_PATTERN: '{slug}-kiosk.vakhta.xyz',
      API_HOST_PATTERN: '{slug}-api.vakhta.xyz',
      CONTROL_PUBLIC_BASE_URL: 'http://localhost:3100',
      PLATFORM_SCHEME: 'http',
    });
    const { AppModule } = await import('../app.module.js');
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
      logger: false,
    });
    app.useGlobalFilters(new ControlErrorFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    service = app.get(BrandingService);
    const storage = app.get(LogoStorage);
    vi.spyOn(storage, 'put').mockImplementation(put);
    vi.spyOn(storage, 'get').mockImplementation(async (key) => {
      const bytes = objects.get(key);
      if (!bytes) throw new Error('Logo not stored');
      return bytes;
    });
    const create = async (slug: string) =>
      app.get(TenantsService).create(
        {
          name: slug,
          slug,
          defaultLocale: 'en',
          timezone: 'Europe/Kyiv',
          modules: ['ADMIN_PANEL'],
          adminEmail: 'admin@example.test',
          adminName: 'Admin',
          provision: false,
        },
        operator,
      );
    alpha = (await create('alpha')).id;
    beta = (await create('beta')).id;
    const db = app.get<ReturnType<typeof createRegistry>['db']>(REGISTRY);
    const cipher = new SecretCipher(cipherKey);
    await db.insert(tenantSecrets).values({
      tenantId: alpha,
      kind: 'DATABASE_URL',
      fingerprint: cipher.fingerprint(postgres.getConnectionUri()),
      ...cipher.encrypt(postgres.getConnectionUri()),
    });
    await db.update(tenants).set({ status: TenantStatus.ACTIVE }).where(eq(tenants.id, alpha));
    await db
      .update(tenantDomains)
      .set({ status: 'VERIFIED' })
      .where(eq(tenantDomains.tenantId, alpha));
    image = (
      await sharp({ create: { width: 800, height: 200, channels: 4, background: '#2563eb' } })
        .png()
        .toBuffer()
    ).toString('base64');
  });
  afterAll(async () => {
    await app.close();
    await postgres.stop();
  });

  it('rejects anonymous and viewer writes through the HTTP guard', async () => {
    const view = await service.get(alpha);
    const payload = { displayName: 'Alpha', accentColor: null, expectedVersion: view.updatedAt };
    expect(
      (await app.inject({ method: 'PUT', url: `/control/tenants/${alpha}/branding`, payload }))
        .statusCode,
    ).toBe(401);
    const auth = app.get<{ api: { getSession: () => Promise<unknown> } }>(AUTH);
    const session = vi.spyOn(auth.api, 'getSession').mockResolvedValue({
      session: { mfaVerified: true },
      user: {
        ...operator,
        role: OperatorRole.PLATFORM_VIEWER,
        status: 'ACTIVE',
        twoFactorEnabled: true,
      },
    });
    expect(
      (await app.inject({ method: 'PUT', url: `/control/tenants/${alpha}/branding`, payload }))
        .statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: 'GET', url: `/control/tenants/${alpha}/branding` })).statusCode,
    ).toBe(200);
    session.mockRestore();
  });

  it('normalizes, saves and publishes only the owning tenant logo, with an audit trail', async () => {
    const before = await service.get(alpha);
    const other = await service.get(beta);
    const auth = app.get<{ api: { getSession: () => Promise<unknown> } }>(AUTH);
    const session = vi.spyOn(auth.api, 'getSession').mockResolvedValue({
      session: { mfaVerified: true },
      user: { ...operator, status: 'ACTIVE', twoFactorEnabled: true },
    });
    const response = await app.inject({
      method: 'PUT',
      url: `/control/tenants/${alpha}/branding`,
      payload: {
        displayName: 'Alpha Works',
        accentColor: '#2563eb',
        logo: image,
        expectedVersion: before.updatedAt,
      },
    });
    session.mockRestore();
    expect(response.statusCode).toBe(200);
    const saved = response.json<TenantBrandingView>();
    expect(saved.displayName).toBe('Alpha Works');
    expect(await service.get(beta)).toEqual(other);
    expect(saved.logoUrl).toMatch(new RegExp(`/public/tenant-logo/${alpha}/[a-f0-9]{64}$`));
    if (!saved.logoUrl) throw new Error('Logo missing');
    const path = new URL(saved.logoUrl).pathname;
    const logo = await app.inject({ method: 'GET', url: path });
    expect(logo.statusCode).toBe(200);
    expect(logo.headers['content-type']).toContain('image/webp');
    expect(logo.headers['x-content-type-options']).toBe('nosniff');
    expect(await sharp(logo.rawPayload).metadata()).toMatchObject({
      width: 512,
      height: 128,
      format: 'webp',
    });
    expect((await app.inject({ method: 'GET', url: path.replace(alpha, beta) })).statusCode).toBe(
      404,
    );
    await app.get<RegistryTenantSource>(TENANT_SOURCE).reload();
    const config = await app.inject({
      method: 'GET',
      url: '/public/tenant-config?host=alpha.vakhta.xyz',
    });
    expect(config.json()).toMatchObject({
      displayName: 'Alpha Works',
      logoUrl: saved.logoUrl,
      accentColor: '#2563eb',
      surface: TenantSurface.PANEL,
    });
    const audits = await app
      .get<ReturnType<typeof createRegistry>['db']>(REGISTRY)
      .select()
      .from(controlAuditLog)
      .where(eq(controlAuditLog.action, 'tenant.branding.update'));
    expect(audits).toHaveLength(1);
    expect(audits[0]?.before).toMatchObject({ displayName: 'alpha', logoUrl: null });
    expect(JSON.stringify(audits)).not.toContain(image);
  });

  it('rejects stale changes without losing the saved brand', async () => {
    const before = await service.get(alpha);
    const next = await service.update(
      alpha,
      { displayName: 'Updated Alpha', accentColor: null, expectedVersion: before.updatedAt },
      operator,
    );
    await expect(
      service.update(
        alpha,
        { displayName: 'Stale Alpha', accentColor: '#ffffff', expectedVersion: before.updatedAt },
        operator,
      ),
    ).rejects.toMatchObject({ code: 'BRANDING_VERSION_CONFLICT' });
    expect(await service.get(alpha)).toEqual(next);
    expect(next.logoUrl).toEqual(before.logoUrl);
  });

  it('removes a logo and resets the accent without affecting another tenant', async () => {
    const before = await service.get(alpha);
    const other = await service.get(beta);
    const next = await service.update(
      alpha,
      {
        displayName: before.displayName,
        accentColor: null,
        logo: null,
        expectedVersion: before.updatedAt,
      },
      operator,
    );
    expect(next.logoUrl).toBeNull();
    expect(await service.get(beta)).toEqual(other);
    if (!before.logoUrl) throw new Error('Previous logo missing');
    expect(
      (await app.inject({ method: 'GET', url: new URL(before.logoUrl).pathname })).statusCode,
    ).toBe(404);
  });

  it('keeps the previous brand when storage fails and permits a safe retry', async () => {
    const before = await service.get(beta);
    const command = {
      displayName: 'Beta Works',
      accentColor: '#ff00ff',
      logo: image,
      expectedVersion: before.updatedAt,
    };
    put.mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(service.update(beta, command, operator)).rejects.toThrow('Storage unavailable');
    expect(await service.get(beta)).toEqual(before);
    const next = await service.update(beta, command, operator);
    expect(next.logoUrl).toContain(beta);
  });

  it('rejects SVG, oversized, corrupt and excessive-pixel uploads', async () => {
    await expect(
      normalizeLogo(Buffer.from('<svg onload="alert(1)"/>').toString('base64')),
    ).rejects.toMatchObject({ code: 'BRANDING_LOGO_INVALID' });
    await expect(
      normalizeLogo(Buffer.alloc(512 * 1024 + 1).toString('base64')),
    ).rejects.toMatchObject({ code: 'BRANDING_LOGO_TOO_LARGE' });
    await expect(
      normalizeLogo(Buffer.from([255, 216, 255, 0, 0]).toString('base64')),
    ).rejects.toMatchObject({ code: 'BRANDING_LOGO_INVALID' });
    const huge = await sharp({
      create: { width: 4096, height: 4096, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    await expect(normalizeLogo(huge.toString('base64'))).rejects.toMatchObject({
      code: 'BRANDING_LOGO_INVALID',
    });
  });
});
