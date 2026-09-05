import { describe, expect, it } from 'vitest';
import { hasAnyRole, primaryRole, type RoleGrant } from './roles.js';

const grants: RoleGrant[] = [
  { role: 'SHIFT_MASTER', scopeType: 'ORG_UNIT', scopeId: '11111111-1111-4111-8111-111111111111' },
  { role: 'HR', scopeType: 'ENTERPRISE', scopeId: null },
];

describe('веб-ролі (FR-AUTH-03)', () => {
  it('hasAnyRole перевіряє наявність хоча б однієї з ролей', () => {
    expect(hasAnyRole(grants, ['ADMIN', 'HR'])).toBe(true);
    expect(hasAnyRole(grants, ['ADMIN'])).toBe(false);
    expect(hasAnyRole([], ['AUDITOR'])).toBe(false);
  });

  it('primaryRole бере найстаршу роль за порядком ТЗ', () => {
    expect(primaryRole(grants)).toBe('HR');
    expect(primaryRole([{ role: 'AUDITOR', scopeType: 'ENTERPRISE', scopeId: null }])).toBe(
      'AUDITOR',
    );
    expect(primaryRole([])).toBeNull();
  });
});
