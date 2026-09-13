import { describe, expect, it } from 'vitest';
import {
  coverage,
  qualifiedFor,
  requiredQualifications,
  zoneHasRequirement,
  type StaffingRequirementRule,
} from './coverage.js';

const rules: StaffingRequirementRule[] = [
  {
    id: 'r-op',
    zoneId: 'z1',
    templateId: 'day',
    requiredCount: 4,
    qualificationId: 'operator',
    effectiveFrom: '2026-09-01',
    effectiveTo: null,
  },
  {
    id: 'r-night',
    zoneId: 'z1',
    templateId: 'night',
    requiredCount: 2,
    qualificationId: null,
    effectiveFrom: '2026-09-01',
    effectiveTo: '2026-09-15',
  },
];
const holdings = [
  { employeeId: 'a', qualificationId: 'operator', validFrom: '2026-01-01', validUntil: null },
  {
    employeeId: 'b',
    qualificationId: 'operator',
    validFrom: '2026-01-01',
    validUntil: '2026-09-10',
  },
  { employeeId: 'c', qualificationId: 'operator', validFrom: '2026-01-01', validUntil: null },
];
const assign = (employeeId: string, businessDate: string, templateId = 'day', zoneId = 'z1') => ({
  employeeId,
  businessDate,
  templateId,
  zoneId,
});

describe('staffing coverage (SC-01, SC-04)', () => {
  it('shows one vacancy for four required and three eligible people and unknown without a rule', () => {
    const cells = coverage({
      rules,
      holdings,
      assignments: [
        assign('a', '2026-09-05'),
        assign('b', '2026-09-05'),
        assign('c', '2026-09-05'),
        assign('d', '2026-09-05'),
      ],
      dates: ['2026-09-05'],
      zoneIds: ['z1', 'z2'],
    });
    expect(cells).toEqual([
      expect.objectContaining({
        zoneId: 'z1',
        templateId: 'day',
        required: 4,
        eligible: 3,
        missing: 1,
        status: 'SHORT',
      }),
      expect.objectContaining({ templateId: 'night', required: 2, eligible: 0, missing: 2 }),
    ]);
    expect(zoneHasRequirement(rules, 'z2', ['2026-09-05'])).toBe(false);
    expect(zoneHasRequirement(rules, 'z1', ['2026-09-20'])).toBe(true);
  });
  it('treats an expired qualification as missing and respects the effective window', () => {
    const cells = coverage({
      rules,
      holdings,
      assignments: [
        assign('a', '2026-09-12'),
        assign('b', '2026-09-12'),
        assign('c', '2026-09-12'),
        assign('c', '2026-09-20', 'night'),
      ],
      dates: ['2026-09-12', '2026-09-20'],
      zoneIds: ['z1'],
    });
    expect(
      cells.find((cell) => cell.businessDate === '2026-09-12' && cell.templateId === 'day'),
    ).toMatchObject({ eligible: 2, missing: 2 });
    expect(
      cells.find((cell) => cell.businessDate === '2026-09-12' && cell.templateId === 'night'),
    ).toMatchObject({ eligible: 0, missing: 2 });
    expect(
      cells.some((cell) => cell.businessDate === '2026-09-20' && cell.templateId === 'night'),
    ).toBe(false);
  });
  it('counts one person for one role only and does not count a partial interval', () => {
    const mixed: StaffingRequirementRule[] = [
      { ...rules[0]!, requiredCount: 1 },
      {
        id: 'r-any',
        zoneId: 'z1',
        templateId: 'day',
        requiredCount: 2,
        qualificationId: null,
        effectiveFrom: '2026-09-01',
        effectiveTo: null,
      },
    ];
    const cells = coverage({
      rules: mixed,
      holdings,
      assignments: [
        { ...assign('a', '2026-09-05'), startMs: 0, endMs: 100 },
        { ...assign('d', '2026-09-05'), startMs: 0, endMs: 100 },
        { ...assign('e', '2026-09-05'), startMs: 0, endMs: 40 },
      ],
      dates: ['2026-09-05'],
      zoneIds: ['z1'],
      interval: () => ({
        zoneId: 'z1',
        templateId: 'day',
        businessDate: '2026-09-05',
        startMs: 0,
        endMs: 100,
      }),
    });
    expect(cells).toEqual([
      expect.objectContaining({
        requirementId: 'r-op',
        eligible: 1,
        missing: 0,
        status: 'COVERED',
      }),
      expect.objectContaining({ requirementId: 'r-any', eligible: 1, missing: 1, status: 'SHORT' }),
    ]);
  });
  it('requires a qualification only when every row of the zone demands one', () => {
    expect(requiredQualifications(rules, 'z1', 'day', '2026-09-05')).toEqual(['operator']);
    expect(requiredQualifications(rules, 'z1', 'night', '2026-09-05')).toEqual([]);
    expect(requiredQualifications(rules, 'z9', 'day', '2026-09-05')).toEqual([]);
    expect(qualifiedFor(rules, holdings, assign('a', '2026-09-05'))).toBe(true);
    expect(qualifiedFor(rules, holdings, assign('b', '2026-09-12'))).toBe(false);
    expect(qualifiedFor(rules, holdings, assign('d', '2026-09-05'))).toBe(false);
    expect(qualifiedFor(rules, holdings, assign('d', '2026-09-05', 'night'))).toBe(true);
    expect(qualifiedFor(rules, holdings, { ...assign('d', '2026-09-05'), zoneId: null })).toBe(
      true,
    );
  });
});
