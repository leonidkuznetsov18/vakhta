import { describe, expect, it } from 'vitest';
import type { RoleGrant } from '../access/roles.js';
import { scheduleZoneScope, zoneScopeViolations } from './authority.js';

const target = { siteId: 'site', orgUnitId: 'unit' };
const unitZones = ['z1', 'z2'];
const grant = (
  role: RoleGrant['role'],
  scopeType: RoleGrant['scopeType'],
  scopeId: string | null,
) => ({ role, scopeType, scopeId }) as const;

describe('schedule editing authority (D-01)', () => {
  it('gives administrators, planners and unit masters the whole unit', () => {
    expect(scheduleZoneScope([grant('ADMIN', 'ENTERPRISE', null)], target, unitZones)).toBeNull();
    expect(scheduleZoneScope([grant('PLANNER', 'SITE', 'site')], target, unitZones)).toBeNull();
    expect(
      scheduleZoneScope([grant('SHIFT_MASTER', 'ORG_UNIT', 'unit')], target, unitZones),
    ).toBeNull();
  });
  it('limits a zone master to the zones of that unit and denies everyone else', () => {
    expect(
      scheduleZoneScope(
        [grant('SHIFT_MASTER', 'ZONE', 'z2'), grant('SHIFT_MASTER', 'ZONE', 'other')],
        target,
        unitZones,
      ),
    ).toEqual(new Set(['z2']));
    expect(
      scheduleZoneScope([grant('SHIFT_MASTER', 'ORG_UNIT', 'elsewhere')], target, unitZones),
    ).toEqual(new Set());
    expect(
      scheduleZoneScope([grant('PRODUCTION_HEAD', 'ENTERPRISE', null)], target, unitZones),
    ).toEqual(new Set());
    expect(scheduleZoneScope([grant('SHIFT_MASTER', 'TEAM', 't1')], target, unitZones)).toEqual(
      new Set(),
    );
  });
  it('reports only changes that touch zones outside the scope', () => {
    const current = [
      { employeeId: 'a', businessDate: '2026-09-01', templateId: 'day', zoneId: 'z1' },
      { employeeId: 'b', businessDate: '2026-09-01', templateId: 'day', zoneId: 'z2' },
      { employeeId: 'c', businessDate: '2026-09-02', templateId: 'day', zoneId: 'z2' },
    ];
    const proposed = [
      current[0]!,
      { ...current[1]!, templateId: 'night' },
      { employeeId: 'd', businessDate: '2026-09-03', templateId: 'day', zoneId: 'z2' },
      { employeeId: 'e', businessDate: '2026-09-03', templateId: 'day', zoneId: 'z1' },
      { employeeId: 'f', businessDate: '2026-09-03', templateId: 'day' },
    ];
    expect(zoneScopeViolations(current, proposed, new Set(['z2']))).toEqual([
      'e:2026-09-03',
      'f:2026-09-03',
    ]);
    expect(zoneScopeViolations(current, current, new Set(['z2']))).toEqual([]);
    expect(zoneScopeViolations(current, [current[0]!, current[2]!], new Set(['z2']))).toEqual([]);
    expect(zoneScopeViolations(current, [current[1]!, current[2]!], new Set(['z2']))).toEqual([
      'a:2026-09-01',
    ]);
    expect(
      zoneScopeViolations(
        current,
        [{ ...current[0]!, zoneId: 'z2' }, current[1]!, current[2]!],
        new Set(['z2']),
      ),
    ).toEqual(['a:2026-09-01']);
  });
});
