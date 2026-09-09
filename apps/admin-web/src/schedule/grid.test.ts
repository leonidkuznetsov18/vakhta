import { describe, expect, it } from 'vitest';
import type { ScheduleVersionDetail } from '@vakhta/contracts';
import {
  addRow,
  applyPattern,
  countChanges,
  countShifts,
  gridFromDetail,
  gridToItems,
  removeRow,
  setCell,
  setZone,
  type GridState,
} from './grid.ts';

const EMP = '11111111-1111-4111-8111-111111111111';
const TPL_DAY = '22222222-2222-4222-8222-222222222222';
const TPL_NIGHT = '33333333-3333-4333-8333-333333333333';
const ZONE = '44444444-4444-4444-8444-444444444444';
const OTHER = '66666666-6666-4666-8666-666666666666';

function assignment(over: Partial<ScheduleVersionDetail['assignments'][number]>) {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    scheduleVersionId: 'v',
    employeeId: EMP,
    templateId: TPL_DAY,
    templateCode: 'DAY',
    businessDate: '2026-09-07',
    planStartAt: '2026-09-07T05:00:00.000Z',
    planEndAt: '2026-09-07T17:00:00.000Z',
    positionId: null,
    orgUnitId: 'u',
    teamId: null,
    zoneId: ZONE,
    kind: 'REGULAR' as const,
    status: 'PLANNED' as const,
    acknowledgedAt: null,
    ...over,
  };
}

describe('grid', () => {
  it('builds rows from assignments and returns them into the PUT command without loss', () => {
    const detail = {
      version: {} as ScheduleVersionDetail['version'],
      assignments: [
        assignment({}),
        assignment({ id: 'b', businessDate: '2026-09-09', templateId: TPL_NIGHT }),
        assignment({ id: 'c', businessDate: '2026-09-10', status: 'CANCELLED' }),
      ],
      issues: [],
    };
    const grid = gridFromDetail(detail);
    expect(grid.rows).toHaveLength(1);
    expect(grid.rows[0]?.zoneId).toBe(ZONE);
    expect(countShifts(grid)).toBe(2);
    expect(gridToItems(grid)).toEqual([
      {
        employeeId: EMP,
        templateId: TPL_DAY,
        businessDate: '2026-09-07',
        kind: 'REGULAR',
        zoneId: ZONE,
      },
      {
        employeeId: EMP,
        templateId: TPL_NIGHT,
        businessDate: '2026-09-09',
        kind: 'REGULAR',
        zoneId: ZONE,
      },
    ]);
  });

  it('edits cells and zones immutably; an empty cell removes the assignment', () => {
    const g0 = addRow({ rows: [] }, EMP);
    const g1 = setCell(g0, EMP, '2026-09-01', TPL_DAY);
    const g2 = setZone(g1, EMP, ZONE);
    const g3 = setCell(g2, EMP, '2026-09-01', '');
    expect(g0.rows[0]?.cells).toEqual({});
    expect(g1.rows[0]?.cells).toEqual({ '2026-09-01': TPL_DAY });
    expect(g2.rows[0]?.zoneId).toBe(ZONE);
    expect(gridToItems(g3)).toEqual([]);
    expect(addRow(g3, EMP).rows).toHaveLength(1);
    expect(removeRow(g3, EMP).rows).toHaveLength(0);
  });
});

describe('countChanges', () => {
  const base: GridState = {
    rows: [
      { employeeId: EMP, zoneId: ZONE, cells: { '2026-09-01': TPL_DAY, '2026-09-02': TPL_DAY } },
    ],
  };

  it('is zero for the same grid', () => {
    expect(countChanges(base, base)).toBe(0);
  });

  it('counts added, removed and re-templated shifts', () => {
    const next = setCell(
      setCell(setCell(base, EMP, '2026-09-01', TPL_NIGHT), EMP, '2026-09-02', ''),
      EMP,
      '2026-09-03',
      TPL_DAY,
    );
    expect(countChanges(base, next)).toBe(3);
  });

  it('counts every shift of a row whose zone changed or which was removed', () => {
    expect(countChanges(base, setZone(base, EMP, ''))).toBe(2);
    expect(countChanges(base, removeRow(base, EMP))).toBe(2);
  });

  // The count is what a save would write differently, and the save button is enabled by it: a row
  // standing in the grid with no shifts writes nothing, so it must not offer to be saved.
  it('a row without shifts is not a change, and becomes one as soon as it has a shift', () => {
    const added = addRow(base, OTHER);
    expect(countChanges(base, added)).toBe(0);
    expect(gridToItems(added)).toHaveLength(gridToItems(base).length);
    expect(countChanges(base, setZone(added, OTHER, ZONE))).toBe(0);
    expect(countChanges(base, setCell(added, OTHER, '2026-09-01', TPL_DAY))).toBe(1);
    expect(countChanges(added, base)).toBe(0);
  });

  it('an empty grid saved over a full one counts every shift it removes', () => {
    expect(countChanges(base, { rows: [] })).toBe(2);
    expect(countChanges({ rows: [] }, base)).toBe(2);
  });
});

describe('applyPattern 4/2', () => {
  const dates = Array.from({ length: 8 }, (_, i) => `2026-09-0${i + 1}`);

  it('fills four working days then two off, repeating', () => {
    const grid = applyPattern(
      { rows: [{ employeeId: EMP, zoneId: ZONE, cells: {} }] },
      EMP,
      dates,
      dates[0]!,
      'DAY_4_2',
      {
        day: TPL_DAY,
        night: TPL_NIGHT,
      },
    );
    const cells = grid.rows[0]!.cells;
    expect(dates.map((d) => cells[d] ?? '')).toEqual([
      TPL_DAY,
      TPL_DAY,
      TPL_DAY,
      TPL_DAY,
      '',
      '',
      TPL_DAY,
      TPL_DAY,
    ]);
  });

  it('NIGHT_4_2 uses the night template', () => {
    const grid = applyPattern(
      { rows: [{ employeeId: EMP, zoneId: ZONE, cells: {} }] },
      EMP,
      dates,
      dates[0]!,
      'NIGHT_4_2',
      {
        day: TPL_DAY,
        night: TPL_NIGHT,
      },
    );
    expect(grid.rows[0]!.cells[dates[0]!]).toBe(TPL_NIGHT);
    expect(grid.rows[0]!.cells[dates[4]!] ?? '').toBe('');
  });
});
