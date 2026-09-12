import { beforeEach, describe, expect, it } from 'vitest';
import type { AssignmentInput, ShiftTemplateView } from '@vakhta/contracts';
import {
  batchPreview,
  capabilities,
  EMPTY_GRID,
  periodDates,
  summarize,
  type BatchInput,
} from './planning';
import { gridFromItems, gridToItems, setAssignment, countChanges, restoreLegacyGrid } from './grid';
import { useScheduleDrafts } from './store';
const employeeId = 'b0000000-0000-4000-8000-000000000001';
const zoneId = 'a0000000-0000-4000-8000-000000000003';
const otherZone = 'a0000000-0000-4000-8000-000000000004';
const day: ShiftTemplateView = {
  id: 'c0000000-0000-4000-8000-000000000001',
  siteId: zoneId,
  code: 'DAY',
  name: 'Day',
  localStart: '08:00',
  localEnd: '20:00',
  isActive: true,
  isNight: false,
};
const night: ShiftTemplateView = {
  ...day,
  id: 'c0000000-0000-4000-8000-000000000002',
  code: 'NIGHT',
  localStart: '20:00',
  localEnd: '08:00',
  isNight: true,
};
const item: AssignmentInput = {
  employeeId,
  zoneId,
  templateId: day.id,
  businessDate: '2026-09-01',
  kind: 'SWAP',
  positionId: employeeId,
  teamId: zoneId,
};
const input: BatchInput = {
  employeeIds: [employeeId],
  zoneId,
  from: '2026-09-01',
  to: '2026-09-04',
  pattern: 'DAY_NIGHT_OFF_OFF',
  templateId: '',
  mode: 'fill',
};
describe('zone planning', () => {
  beforeEach(() => useScheduleDrafts.setState({ drafts: {}, baselines: {}, past: {}, future: {} }));
  it('moves one date between zones without losing assignment metadata or other dates', () => {
    const grid = gridFromItems([item, { ...item, businessDate: '2026-09-02' }]);
    const next = setAssignment(grid, { ...item, zoneId: otherZone });
    expect(gridToItems(next)).toEqual([
      { ...item, zoneId: otherZone },
      { ...item, businessDate: '2026-09-02' },
    ]);
    expect(countChanges(grid, next)).toBe(1);
  });
  it('fills only empty dates and previews the exact changes', () => {
    const grid = gridFromItems([item]);
    const result = batchPreview(grid, input, '2026-09', [day, night]);
    expect(result?.changes).toHaveLength(1);
    expect(gridToItems(result?.grid ?? EMPTY_GRID)).toEqual([
      item,
      { employeeId, zoneId, templateId: night.id, businessDate: '2026-09-02', kind: 'REGULAR' },
    ]);
  });
  it('limits replacement and off-day clearing to the chosen date range, with undo/redo', () => {
    const grid = gridFromItems([
      item,
      { ...item, businessDate: '2026-09-03' },
      { ...item, businessDate: '2026-09-10' },
    ]);
    const result = batchPreview(grid, { ...input, mode: 'replace', zoneId: otherZone }, '2026-09', [
      day,
      night,
    ]);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(gridToItems(result.grid)).toContainEqual({ ...item, businessDate: '2026-09-10' });
    expect(gridToItems(result.grid).some((value) => value.businessDate === '2026-09-03')).toBe(
      false,
    );
    useScheduleDrafts.getState().keep('v', result.grid, grid, 1);
    useScheduleDrafts.getState().undo('v');
    expect(useScheduleDrafts.getState().drafts.v).toEqual(grid);
    useScheduleDrafts.getState().redo('v');
    expect(useScheduleDrafts.getState().drafts.v).toEqual(result.grid);
    expect(
      batchPreview(result.grid, { ...input, mode: 'replace', zoneId: otherZone }, '2026-09', [
        day,
        night,
      ])?.changes,
    ).toHaveLength(0);
  });
  it('rejects missing night templates, invalid ranges and out-of-month dates', () => {
    expect(batchPreview(EMPTY_GRID, input, '2026-09', [day])).toBeNull();
    expect(
      batchPreview(EMPTY_GRID, { ...input, from: '2026-10-01' }, '2026-09', [day, night]),
    ).toBeNull();
    expect(
      batchPreview(EMPTY_GRID, { ...input, to: '2026-08-31' }, '2026-09', [day, night]),
    ).toBeNull();
    expect(
      batchPreview(EMPTY_GRID, { ...input, pattern: 'NIGHT_2_2' }, '2026-09', [night])?.changes,
    ).toHaveLength(2);
  });
  it('clips weeks to the month and counts people separately from assignments', () => {
    expect(periodDates('2026-09', '2026-09-01', 'week')).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ]);
    expect(
      summarize(
        [item, { ...item, templateId: night.id, businessDate: '2026-09-02' }],
        [day, night],
        'Europe/Kyiv',
      ),
    ).toEqual({ assignments: 2, workers: 1, day: 1, night: 1, minutes: 1440 });
  });
  it('requires a matching role and unit scope rather than merging unrelated grants', () => {
    expect(
      capabilities(
        [
          { role: 'PLANNER', scopeType: 'ORG_UNIT', scopeId: otherZone },
          { role: 'SHIFT_MASTER', scopeType: 'ORG_UNIT', scopeId: zoneId },
        ],
        employeeId,
        zoneId,
      ),
    ).toEqual({ edit: false, publish: false });
    expect(
      capabilities(
        [{ role: 'PRODUCTION_HEAD', scopeType: 'ORG_UNIT', scopeId: zoneId }],
        employeeId,
        zoneId,
      ),
    ).toEqual({ edit: false, publish: true });
  });
});

it('uses timezone-aware planned hours on DST nights', () => {
  expect(
    summarize(
      [{ ...item, businessDate: '2026-03-28', templateId: night.id }],
      [night],
      'Europe/Kyiv',
    ).minutes,
  ).toBe(660);
  expect(
    summarize(
      [{ ...item, businessDate: '2026-10-24', templateId: night.id }],
      [night],
      'Europe/Kyiv',
    ).minutes,
  ).toBe(780);
});

it('reconciles a legacy row without losing kind, position, team or per-date zones', () => {
  const baseline = gridFromItems([
    item,
    { ...item, businessDate: '2026-09-02', zoneId: otherZone },
  ]);
  const legacy = {
    rows: [{ employeeId, zoneId, cells: { '2026-09-01': night.id, '2026-09-02': day.id } }],
  };
  const restored = restoreLegacyGrid(legacy, baseline);
  expect(gridToItems(restored)).toEqual([
    { ...item, templateId: night.id },
    { ...item, businessDate: '2026-09-02', zoneId: otherZone },
  ]);
  expect(legacy.rows[0]?.cells['2026-09-01']).toBe(night.id);
  useScheduleDrafts.getState().restore('legacy', restored, baseline, 1);
  expect(useScheduleDrafts.getState().baselines.legacy).toEqual(baseline);
});
