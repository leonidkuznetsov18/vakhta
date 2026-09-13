import { describe, expect, it } from 'vitest';
import { proposeAllocation, type ProposalSlot } from './proposal.js';
import type { EligibilityReason } from './eligibility.js';

const warn = (employeeId: string, businessDate: string): EligibilityReason => ({
  code: 'REST',
  severity: 'WARN',
  employeeId,
  businessDate,
  detail: {},
});
const slot = (id: string, date: string, start = 0): ProposalSlot => ({
  slotId: id,
  businessDate: date,
  templateId: 'day',
  zoneId: 'z',
  startMs: start,
  endMs: start + 720 * 60_000,
});

describe('allocation proposal', () => {
  it('filters blocked people before ranking, balances hours and keeps unresolved slots explicit', () => {
    const result = proposeAllocation({
      slots: [slot('s2', '2026-09-08'), slot('s1', '2026-09-07'), slot('s3', '2026-09-07', 1)],
      people: [
        { employeeId: 'anna', plannedMinutes: 1440, ownUnit: true },
        { employeeId: 'boris', plannedMinutes: 720, ownUnit: true },
        { employeeId: 'clara', plannedMinutes: 0, ownUnit: false },
      ],
      preferences: { preferOwnUnit: true, balanceHours: true },
      evaluate: (employeeId, current) => {
        if (employeeId === 'clara' && current.businessDate === '2026-09-08')
          return { blocked: true, reasons: [] };
        if (employeeId === 'anna' && current.businessDate === '2026-09-07')
          return { blocked: false, reasons: [warn(employeeId, current.businessDate)] };
        return { blocked: false, reasons: [] };
      },
    });
    // 07.09: boris (own unit, no warning) then clara (anna carries a warning); 08.09: boris again
    // is now heavier than anna, clara is blocked, so anna wins.
    expect(result.picks.map((pick) => [pick.slotId, pick.employeeId])).toEqual([
      ['s1', 'boris'],
      ['s3', 'clara'],
      ['s2', 'anna'],
    ]);
    expect(result.picks[2]?.alternatives).toBe(2);
    expect(result.unresolved).toEqual([]);
    expect(result.scope).toEqual({
      slots: 3,
      people: 3,
      dates: ['2026-09-07', '2026-09-08'],
      preferences: { preferOwnUnit: true, balanceHours: true },
    });
  });

  it('reports slots nobody can take and never invents a person', () => {
    const blocked = proposeAllocation({
      slots: [slot('s1', '2026-09-07')],
      people: [{ employeeId: 'anna', plannedMinutes: 0, ownUnit: true }],
      preferences: { preferOwnUnit: false, balanceHours: false },
      evaluate: () => ({ blocked: true, reasons: [] }),
    });
    expect(blocked.picks).toEqual([]);
    expect(blocked.unresolved).toEqual([{ slotId: 's1', reason: 'ALL_BLOCKED' }]);
    const empty = proposeAllocation({
      slots: [slot('s1', '2026-09-07')],
      people: [],
      preferences: { preferOwnUnit: false, balanceHours: false },
      evaluate: () => ({ blocked: false, reasons: [] }),
    });
    expect(empty.unresolved).toEqual([{ slotId: 's1', reason: 'NO_PEOPLE' }]);
  });
});
