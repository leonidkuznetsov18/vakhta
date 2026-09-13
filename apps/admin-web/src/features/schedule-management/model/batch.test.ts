import { describe, expect, it } from 'vitest';
import { copyPeriod, moveAssignment } from './batch';
import { gridFromItems, gridToItems } from './grid';

const item = (
  employeeId: string,
  businessDate: string,
  templateId = 'day',
  zoneId: string | undefined = 'z1',
) => ({
  employeeId,
  businessDate,
  templateId,
  kind: 'REGULAR' as const,
  ...(zoneId ? { zoneId } : {}),
});

describe('copy period (SC-26)', () => {
  const source = gridFromItems([
    item('a', '2026-09-01'),
    item('a', '2026-09-02', 'night'),
    item('b', '2026-09-02', 'day', 'gone'),
    item('c', '2026-09-03'),
    item('d', '2026-09-03', 'old'),
  ]);
  const active = {
    activeEmployees: new Set(['a', 'b', 'd', 'e']),
    activeZones: new Set(['z1']),
    activeTemplates: new Set(['day', 'night']),
  };
  it('maps dates by position, skips inactive references and keeps occupied dates in fill mode', () => {
    const grid = gridFromItems([item('a', '2026-09-08', 'night'), item('e', '2026-09-09')]);
    const result = copyPeriod({
      grid,
      source,
      sourceDates: ['2026-09-01', '2026-09-02', '2026-09-03'],
      targetDates: ['2026-09-08', '2026-09-09', '2026-09-10'],
      mode: 'fill',
      ...active,
    });
    expect(gridToItems(result.grid)).toEqual(
      expect.arrayContaining([
        item('a', '2026-09-08', 'night'),
        item('a', '2026-09-09', 'night'),
        item('e', '2026-09-09'),
      ]),
    );
    expect(gridToItems(result.grid)).toHaveLength(3);
    expect(result.changes).toHaveLength(1);
    expect(result.skipped).toEqual([
      expect.objectContaining({ employeeId: 'a', targetDate: '2026-09-08', reason: 'OCCUPIED' }),
      expect.objectContaining({ employeeId: 'b', reason: 'INACTIVE_ZONE' }),
      expect.objectContaining({ employeeId: 'c', reason: 'INACTIVE_EMPLOYEE' }),
      expect.objectContaining({ employeeId: 'd', reason: 'INACTIVE_TEMPLATE' }),
    ]);
    expect(gridToItems(grid)).toHaveLength(2);
  });
  it('replaces the copied people only and limits copying to selected workers', () => {
    const grid = gridFromItems([item('a', '2026-09-08', 'night'), item('e', '2026-09-09')]);
    const result = copyPeriod({
      grid,
      source,
      sourceDates: ['2026-09-01', '2026-09-02'],
      targetDates: ['2026-09-08', '2026-09-09'],
      mode: 'replace',
      employeeIds: ['a'],
      ...active,
    });
    expect(gridToItems(result.grid)).toEqual(
      expect.arrayContaining([
        item('a', '2026-09-08'),
        item('a', '2026-09-09', 'night'),
        item('e', '2026-09-09'),
      ]),
    );
    expect(gridToItems(result.grid)).toHaveLength(3);
    expect(result.skipped).toEqual([]);
  });
});

describe('move assignment (SC-31)', () => {
  const grid = gridFromItems([
    item('a', '2026-09-05', 'day', 'z1'),
    { ...item('b', '2026-09-06', 'night', 'z1'), kind: 'EXTRA' as const, teamId: 'team' },
  ]);
  const b = gridToItems(grid)[1]!;
  it('moves date, person or zone with metadata and refuses same, occupied and other-month targets', () => {
    const moved = moveAssignment(grid, b, { businessDate: '2026-09-07' }, '2026-09');
    expect('grid' in moved && gridToItems(moved.grid)).toEqual(
      expect.arrayContaining([
        item('a', '2026-09-05'),
        { ...item('b', '2026-09-07', 'night'), kind: 'EXTRA', teamId: 'team' },
      ]),
    );
    const rezoned = moveAssignment(grid, b, { zoneId: 'z2' }, '2026-09');
    expect(
      'grid' in rezoned && gridToItems(rezoned.grid).find((x) => x.employeeId === 'b')?.zoneId,
    ).toBe('z2');
    const reassigned = moveAssignment(grid, b, { employeeId: 'c' }, '2026-09');
    expect(
      'grid' in reassigned &&
        gridToItems(reassigned.grid)
          .map((x) => x.employeeId)
          .sort(),
    ).toEqual(['a', 'c']);
    expect(moveAssignment(grid, b, {}, '2026-09')).toEqual({ failure: 'SAME' });
    expect(
      moveAssignment(grid, b, { employeeId: 'a', businessDate: '2026-09-05' }, '2026-09'),
    ).toEqual({ failure: 'OCCUPIED' });
    expect(moveAssignment(grid, b, { businessDate: '2026-10-01' }, '2026-09')).toEqual({
      failure: 'OUTSIDE_MONTH',
    });
    expect(gridToItems(grid)).toHaveLength(2);
  });
});
