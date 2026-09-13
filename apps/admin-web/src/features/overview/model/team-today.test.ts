import { describe, expect, it } from 'vitest';
import type { ScheduleAttentionView } from '@vakhta/contracts';
import { buildTeamToday } from './team-today';

const id = (n: number) => `a0000000-0000-4000-8000-00000000000${n}`;
const sick = (employee: number, answer: 'GOOD' | 'SAME' | 'WORSE' | null, to = '2026-09-16') => ({
  requestId: id(9),
  employeeId: id(employee),
  type: 'SICK',
  status: 'APPROVED' as const,
  from: '2026-09-12',
  to,
  lastCheckin: answer
    ? { businessDate: '2026-09-13', answer, answeredAt: '2026-09-13T07:00:00Z' }
    : null,
});
const need = (assignment: number, date: string) => ({
  assignmentId: id(assignment),
  employeeId: id(1),
  businessDate: date,
  zoneId: null,
  orgUnitId: id(8),
  requestId: id(9),
  type: 'SICK',
});

describe('people and schedule today', () => {
  it('puts the worse and unanswered first, groups unfilled shifts by date and merges sites', () => {
    const a: ScheduleAttentionView = {
      today: '2026-09-13',
      holiday: null,
      birthdaysToday: [id(5)],
      onSickLeave: [sick(1, 'GOOD'), sick(2, 'WORSE')],
      replacements: [need(3, '2026-09-15'), need(4, '2026-09-14')],
    };
    const b: ScheduleAttentionView = {
      today: '2026-09-13',
      holiday: 'INDEPENDENCE_DAY',
      birthdaysToday: [id(5), id(6)],
      onSickLeave: [sick(3, null), sick(1, 'GOOD')],
      replacements: [need(4, '2026-09-14'), need(7, '2026-09-14')],
    };
    const team = buildTeamToday([a, b]);
    expect(team.holiday).toBe('INDEPENDENCE_DAY');
    expect(team.sick.map((s) => s.employeeId)).toEqual([id(3), id(2), id(1)]);
    expect(team.replacements.map((d) => `${d.date}:${d.shifts.length}`)).toEqual([
      '2026-09-14:2',
      '2026-09-15:1',
    ]);
    expect(team.replacementCount).toBe(3);
    expect(team.birthdays).toEqual([id(5), id(6)]);
  });
});
