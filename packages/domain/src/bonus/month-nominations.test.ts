import { describe, expect, it } from 'vitest';
import { masterNominee, nominateMonth } from './month-nominations.js';

describe('monthly nominations', () => {
  it('uses score, name and stable ID independently of database row order', () => {
    const staff = [
      { id: 'b', name: 'Alex', points: 3 },
      { id: 'a', name: 'Alex', points: 3 },
    ];
    const units = [
      { id: 'z', name: 'Beta', points: 5 },
      { id: 'x', name: 'Alpha', points: 5 },
    ];
    expect(nominateMonth(staff, units, [])).toEqual(
      nominateMonth([...staff].reverse(), [...units].reverse(), []),
    );
    expect(nominateMonth(staff, units, []).employeeOfMonth?.id).toBe('a');
    expect(nominateMonth(staff, units, []).unitOfMonth?.id).toBe('x');
  });

  it('keeps all distinct masters of the winning department, even without an employee card', () => {
    const master = { userId: 'u', name: 'One', employeeIds: [], orgUnitId: 'unit' };
    const result = nominateMonth(
      [],
      [{ id: 'unit', name: 'Unit', points: 5 }],
      [
        master,
        master,
        { userId: 'v', name: 'Two', employeeIds: ['e'], orgUnitId: 'unit' },
        { userId: 'other', name: 'Other', employeeIds: [], orgUnitId: 'elsewhere' },
      ],
    );
    expect(result.masters).toHaveLength(2);
    expect(masterNominee(result)).toEqual({ id: 'unit', name: 'One, Two', points: 5 });
  });

  it('does not nominate anyone without positive points', () => {
    const result = nominateMonth([{ id: 'e', name: 'Employee', points: 0 }], [], []);
    expect(result).toEqual({ employeeOfMonth: null, unitOfMonth: null, masters: [] });
    expect(masterNominee(result)).toBeNull();
  });
});
