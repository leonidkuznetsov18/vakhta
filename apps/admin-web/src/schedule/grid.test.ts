import { describe, expect, it } from 'vitest';
import type { ScheduleVersionDetail } from '@vakhta/contracts';
import {
  addRow,
  countShifts,
  gridFromDetail,
  gridToItems,
  removeRow,
  setCell,
  setZone,
} from './grid.ts';

const EMP = '11111111-1111-4111-8111-111111111111';
const TPL_DAY = '22222222-2222-4222-8222-222222222222';
const TPL_NIGHT = '33333333-3333-4333-8333-333333333333';
const ZONE = '44444444-4444-4444-8444-444444444444';

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
  it('будує рядки з призначень і повертає їх назад у команду PUT без втрат', () => {
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

  it('редагує комірки і зони імутабельно, порожня комірка прибирає призначення', () => {
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
