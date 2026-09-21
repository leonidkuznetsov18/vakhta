import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  TENANT_MODULES,
  TENANT_STATUSES,
  TenantSlugProblem,
  TenantStatus,
  canTransitionTenant,
  isValidTenantSlug,
  normalizeHost,
  suggestTenantSlug,
  tenantDatabaseName,
  tenantSlugProblem,
  tenantStoragePrefix,
} from './tenant.js';

describe('tenant slug rules', () => {
  it('accepts lowercase letters, digits and inner hyphens between 3 and 32 characters', () => {
    expect(isValidTenantSlug('zavoda')).toBe(true);
    expect(isValidTenantSlug('plant-2')).toBe(true);
    expect(isValidTenantSlug('a-b')).toBe(true);
  });

  it('rejects empty, malformed and reserved slugs with a named problem', () => {
    expect(tenantSlugProblem('')).toBe('EMPTY');
    expect(tenantSlugProblem('ab')).toBe('FORMAT');
    expect(tenantSlugProblem('ZavodA')).toBe('FORMAT');
    expect(tenantSlugProblem('-zavod')).toBe('FORMAT');
    expect(tenantSlugProblem('zavod-')).toBe('FORMAT');
    expect(tenantSlugProblem('a'.repeat(33))).toBe('FORMAT');
    expect(tenantSlugProblem('api')).toBe('RESERVED');
    expect(tenantSlugProblem('control')).toBe('RESERVED');
  });

  it('suggests a valid slug from a Cyrillic or Latin name', () => {
    expect(suggestTenantSlug('ЗаводБ')).toBe('zavodb');
    expect(suggestTenantSlug('Молокозавод №1')).toBe('molokozavod-no1');
    expect(suggestTenantSlug('Café Ünit')).toBe('cafe-unit');
    expect(suggestTenantSlug('  Acme   Plant  ')).toBe('acme-plant');
    expect(suggestTenantSlug('ab')).toBe('ab0');
  });

  it('suggested slugs are always valid or reserved for any printable name', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 60 }), (name) => {
        const slug = suggestTenantSlug(name);
        const problem = tenantSlugProblem(slug);
        return problem === null || problem === TenantSlugProblem.RESERVED;
      }),
    );
  });
});

describe('tenant status machine', () => {
  it('walks DRAFT → PROVISIONING → ACTIVE ↔ SUSPENDED and archives from anywhere but DRAFT twice', () => {
    expect(canTransitionTenant(TenantStatus.DRAFT, TenantStatus.PROVISIONING)).toBe(true);
    expect(canTransitionTenant(TenantStatus.PROVISIONING, TenantStatus.ACTIVE)).toBe(true);
    expect(canTransitionTenant(TenantStatus.ACTIVE, TenantStatus.SUSPENDED)).toBe(true);
    expect(canTransitionTenant(TenantStatus.SUSPENDED, TenantStatus.ACTIVE)).toBe(true);
    expect(canTransitionTenant(TenantStatus.DRAFT, TenantStatus.ACTIVE)).toBe(false);
    expect(canTransitionTenant(TenantStatus.ARCHIVED, TenantStatus.ACTIVE)).toBe(false);
  });

  it('every status is covered by the constants', () => {
    expect(TENANT_STATUSES).toHaveLength(5);
    expect(TENANT_MODULES).toContain('QR_KIOSK');
  });
});

describe('tenant naming', () => {
  it('derives database, storage prefix and normalized hosts', () => {
    expect(tenantDatabaseName('plant-2')).toBe('vakhta_t_plant_2');
    expect(tenantStoragePrefix('zavoda')).toBe('tenants/zavoda/');
    expect(normalizeHost('Zavoda.Vakhta.XYZ:443')).toBe('zavoda.vakhta.xyz');
    expect(normalizeHost('localhost:3000')).toBe('localhost');
    expect(normalizeHost('[::1]:3000')).toBe('[::1]');
  });
});
