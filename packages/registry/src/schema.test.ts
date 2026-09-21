import { describe, expect, it } from 'vitest';
import {
  LOCALES,
  TENANT_DOMAIN_STATUSES,
  TENANT_MODULES,
  TENANT_SECRET_KINDS,
  TENANT_STATUSES,
  TENANT_SURFACES,
} from '@vakhta/domain';
import {
  DOMAIN_STATUS_VALUES,
  SECRET_KIND_VALUES,
  TENANT_MODULE_VALUES,
  TENANT_STATUS_VALUES,
  TENANT_SURFACE_VALUES,
  registryLocale,
} from './schema/index.js';

describe('registry enums mirror the domain constants', () => {
  it('keeps every enum in sync with @vakhta/domain', () => {
    expect([...TENANT_STATUS_VALUES]).toEqual([...TENANT_STATUSES]);
    expect([...TENANT_MODULE_VALUES]).toEqual([...TENANT_MODULES]);
    expect([...TENANT_SURFACE_VALUES]).toEqual([...TENANT_SURFACES]);
    expect([...DOMAIN_STATUS_VALUES]).toEqual([...TENANT_DOMAIN_STATUSES]);
    expect([...SECRET_KIND_VALUES]).toEqual([...TENANT_SECRET_KINDS]);
    expect([...registryLocale.enumValues]).toEqual([...LOCALES]);
  });
});
