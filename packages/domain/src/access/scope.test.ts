import { describe, expect, it } from 'vitest';
import type { RoleGrant } from './roles.js';
import { canActOn, grantCovers } from './scope.js';

const SITE = '11111111-1111-4111-8111-111111111111';
const UNIT = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';

describe('області доступу (FR-AUTH-03, ADR-9)', () => {
  it('ENTERPRISE покриває все, SITE лише свій майданчик, ORG_UNIT лише свій підрозділ', () => {
    const enterprise: RoleGrant = { role: 'ADMIN', scopeType: 'ENTERPRISE', scopeId: null };
    const site: RoleGrant = { role: 'PLANNER', scopeType: 'SITE', scopeId: SITE };
    const unit: RoleGrant = { role: 'SHIFT_MASTER', scopeType: 'ORG_UNIT', scopeId: UNIT };
    expect(grantCovers(enterprise, { siteId: OTHER })).toBe(true);
    expect(grantCovers(site, { siteId: SITE, orgUnitId: OTHER })).toBe(true);
    expect(grantCovers(site, { siteId: OTHER })).toBe(false);
    expect(grantCovers(unit, { orgUnitId: UNIT })).toBe(true);
    expect(grantCovers(unit, { orgUnitId: OTHER })).toBe(false);
    expect(grantCovers(unit, { siteId: SITE })).toBe(false);
  });

  it('canActOn вимагає і роль, і область одночасно', () => {
    const grants: RoleGrant[] = [
      { role: 'PLANNER', scopeType: 'ORG_UNIT', scopeId: UNIT },
      { role: 'AUDITOR', scopeType: 'ENTERPRISE', scopeId: null },
    ];
    expect(canActOn(grants, ['PLANNER'], { orgUnitId: UNIT })).toBe(true);
    expect(canActOn(grants, ['PLANNER'], { orgUnitId: OTHER })).toBe(false);
    expect(canActOn(grants, ['ADMIN', 'PLANNER'], { orgUnitId: OTHER })).toBe(false);
    expect(canActOn(grants, ['AUDITOR'], { orgUnitId: OTHER })).toBe(true);
  });
});
