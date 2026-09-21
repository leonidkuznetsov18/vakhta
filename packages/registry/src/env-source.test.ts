import { describe, expect, it } from 'vitest';
import { ENV_TENANT_ID, primaryHost, tenantFromEnv, tenantOrigins } from './runtime-config.js';
import { EnvTenantSource } from './source.js';

describe('tenantFromEnv', () => {
  const tenant = tenantFromEnv({
    DATABASE_URL: 'postgres://vakhta:vakhta@localhost:5432/vakhta',
    PUBLIC_BASE_URL: 'https://api.vakhta.xyz',
    CORS_ORIGINS: ['https://panel.vakhta.xyz', 'https://kiosk.vakhta.xyz'],
    TELEGRAM_BOT_TOKEN: '1:x',
    TELEGRAM_BOT_USERNAME: 'vakhta_worker_bot',
    TELEGRAM_WEBHOOK_SECRET: 'secret-secret-secret',
  });

  it('builds the single active tenant from the existing variables', () => {
    expect(tenant.id).toBe(ENV_TENANT_ID);
    expect(tenant.status).toBe('ACTIVE');
    expect(tenant.redisPrefix).toBe('');
    expect(tenant.storagePrefix).toBe('');
    expect(primaryHost(tenant, 'API')).toBe('api.vakhta.xyz');
    expect(primaryHost(tenant, 'PANEL')).toBe('panel.vakhta.xyz');
    expect(primaryHost(tenant, 'KIOSK')).toBe('kiosk.vakhta.xyz');
    expect(tenantOrigins(tenant, 'https')).toEqual([
      'https://panel.vakhta.xyz',
      'https://kiosk.vakhta.xyz',
    ]);
    expect(tenant.modules).toEqual(['ADMIN_PANEL', 'WORKER_BOT', 'QR_KIOSK']);
  });

  it('answers every host with the same tenant and knows it by id and slug', () => {
    const source = new EnvTenantSource(tenant);
    expect(source.byHost('anything.example')).toBe(tenant);
    expect(source.byId(ENV_TENANT_ID)).toBe(tenant);
    expect(source.byId('00000000-0000-4000-8000-000000000002')).toBeNull();
    expect(source.bySlug('default')).toBe(tenant);
    expect(source.active()).toEqual([tenant]);
  });
});
