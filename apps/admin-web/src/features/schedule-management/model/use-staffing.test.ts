import { describe, expect, it } from 'vitest';
import { ShiftPeriod } from '@vakhta/domain';
import type { ShiftTemplateView, StaffingView } from '@vakhta/contracts';
import { gridFromItems } from './grid';
import { staffingCoverage } from './use-staffing';

const SITE = 'a0000000-0000-4000-8000-000000000001';
const ZONE = 'a0000000-0000-4000-8000-000000000003';
const OLD = 'c0000000-0000-4000-8000-0000000000a1';
const NEW = 'c0000000-0000-4000-8000-0000000000a2';
const DATE = '2026-10-05';

const version = (id: string, patch: Partial<ShiftTemplateView>): ShiftTemplateView => ({
  id,
  siteId: SITE,
  orgUnitId: 'a0000000-0000-4000-8000-000000000002',
  code: `U_${id.slice(-2)}`,
  name: 'Ранкова',
  localStart: '05:00',
  localEnd: '13:00',
  period: ShiftPeriod.DAY,
  isActive: true,
  revision: 1,
  retiredAt: null,
  replacedById: null,
  usedCount: 0,
  ...patch,
});

const staffing: StaffingView = {
  requirements: [
    {
      id: 'b0000000-0000-4000-8000-000000000001',
      zoneId: ZONE,
      templateId: NEW,
      requiredCount: 1,
      qualificationId: null,
      effectiveFrom: '2026-10-01',
      effectiveTo: null,
      note: null,
      updatedAt: '2026-10-01T00:00:00Z',
    },
  ],
  qualifications: [],
  holdings: [],
  rules: {
    siteId: SITE,
    minRestMinutes: 660,
    maxMonthMinutes: 12000,
    restSeverity: 'WARN',
    hoursSeverity: 'WARN',
    configured: false,
  },
  availability: [],
};

describe('staffing coverage across shift versions', () => {
  it('counts a shift planned on the retired version against demand moved to its successor', () => {
    const templates = [
      // A type-only edit of a used shift: same hours, new version.
      version(OLD, { isActive: false, retiredAt: '2026-10-01T00:00:00Z', replacedById: NEW }),
      version(NEW, { period: ShiftPeriod.NIGHT, localStart: '05:00', localEnd: '13:00' }),
    ];
    const grid = gridFromItems([
      {
        employeeId: 'e0000000-0000-4000-8000-000000000001',
        templateId: OLD,
        businessDate: DATE,
        zoneId: ZONE,
        kind: 'REGULAR',
      },
    ]);
    const model = staffingCoverage({
      staffing,
      grid,
      templates,
      timezone: 'Europe/Kyiv',
      dates: [DATE],
      zoneIds: [ZONE],
    });
    expect(model.cells).toEqual([expect.objectContaining({ templateId: NEW, missing: 0 })]);
  });
});
