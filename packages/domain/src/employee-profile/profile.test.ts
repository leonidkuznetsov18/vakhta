import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { compensationHistory, effectiveCompensation } from './compensation.js';
import { profileFieldAccess } from './field-access.js';
import { unitMasterState } from './master-state.js';
import { profileZone } from './zone.js';
import type { WebRole } from '../access/roles.js';

describe('employee profile rules', () => {
  it.each<WebRole>([
    'ADMIN',
    'HR',
    'ACCOUNTANT',
    'PRODUCTION_HEAD',
    'PLANNER',
    'SHIFT_MASTER',
    'CLEANLINESS_CONTROLLER',
    'AUDITOR',
  ])('restricts fields for %s', (role) => {
    const access = profileFieldAccess([role]);
    const editor = role === 'ADMIN' || role === 'HR';
    expect(access.maritalStatus).toBe(editor);
    expect(access.personalEdit).toBe(editor);
    expect(access.compensation).toBe(editor ? 'WRITE' : role === 'ACCOUNTANT' ? 'READ' : 'NONE');
    expect(access.birthDate).toBe(editor || role === 'ACCOUNTANT' ? 'FULL' : 'DAY_MONTH');
  });
  const entries = [
    { id: 'a', effectiveFrom: '2026-01-01', correctsEntryId: null, createdAt: '2026-01-01' },
    { id: 'b', effectiveFrom: '2026-01-01', correctsEntryId: 'a', createdAt: '2026-02-01' },
    { id: 'c', effectiveFrom: '2026-06-01', correctsEntryId: null, createdAt: '2026-02-02' },
    { id: 'd', effectiveFrom: '2026-01-01', correctsEntryId: 'b', createdAt: '2026-03-01' },
  ];
  it('resolves dates and corrections regardless of input order', () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray(entries, { minLength: entries.length, maxLength: entries.length }),
        (rows) => {
          expect(effectiveCompensation(rows, '2025-12-31')).toBeNull();
          expect(effectiveCompensation(rows, '2026-04-01')?.id).toBe('d');
          expect(effectiveCompensation(rows, '2026-07-01')?.id).toBe('c');
          expect(
            compensationHistory(rows, '2026-04-01')
              .filter((entry) => entry.state === 'CORRECTED')
              .map((entry) => entry.id),
          ).toEqual(['b', 'a']);
        },
      ),
    );
  });
  it('shows master state and self assignment explicitly', () => {
    const base = {
      masterId: 'a',
      masterStatus: 'ACTIVE',
      masterGrantCoversUnit: true,
      employeeId: 'a',
    };
    expect(unitMasterState(base)).toEqual({ state: 'ASSIGNED', isSelf: true });
    expect(unitMasterState({ ...base, masterId: null }).state).toBe('MISSING');
    expect(unitMasterState({ ...base, masterStatus: 'BLOCKED' }).state).toBe('INACTIVE');
    expect(unitMasterState({ ...base, masterGrantCoversUnit: false }).state).toBe(
      'NO_PANEL_ACCESS',
    );
  });
  it('keeps an open shift without a zone distinct from the next scheduled zone', () => {
    const zone = { id: 'a', name: 'Zone A', available: true };
    expect(
      profileZone({ openShift: { zone: null }, nextShift: { zone }, monthZones: [zone, zone] }),
    ).toEqual({ current: null, source: 'CURRENT_SHIFT', monthZones: [zone] });
    expect(profileZone({ openShift: null, nextShift: { zone }, monthZones: [] }).current).toEqual(
      zone,
    );
  });
});
