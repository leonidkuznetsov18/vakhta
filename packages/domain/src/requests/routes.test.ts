import { describe, expect, it } from 'vitest';
import { applyDecision, canDecideStep, routeFor, stepDeadline } from './routes.js';

describe('маршрути звернень (ТЗ 2.1, FR-REQ-01/03)', () => {
  it('обмін змінами: другий працівник → майстер → керівник; відпустка: керівник + HR', () => {
    expect(routeFor('SWAP').map((s) => s.key)).toEqual(['COUNTERPART', 'MASTER', 'HEAD']);
    expect(routeFor('VACATION').map((s) => s.key)).toEqual(['HEAD', 'HR']);
    expect(routeFor('SICK').map((s) => s.key)).toEqual(['HR']);
  });

  it('схвалення веде по кроках до APPROVED, відмова закриває одразу, закрите не вирішується', () => {
    const p = { currentStep: 0, status: 'SUBMITTED' as const };
    let r = applyDecision('SWAP', p, 'APPROVED');
    expect(r).toEqual({ currentStep: 1, status: 'IN_REVIEW' });
    r = applyDecision('SWAP', r, 'APPROVED');
    expect(r).toEqual({ currentStep: 2, status: 'IN_REVIEW' });
    r = applyDecision('SWAP', r, 'APPROVED');
    expect(r).toEqual({ currentStep: 2, status: 'APPROVED' });
    expect(applyDecision('SICK', p, 'REJECTED').status).toBe('REJECTED');
    expect(() =>
      applyDecision('SICK', { currentStep: 0, status: 'APPROVED' }, 'APPROVED'),
    ).toThrow();
    void p;
  });

  it('крок вирішує лише відповідна роль або другий працівник для обміну', () => {
    const [counterpart, master] = routeFor('SWAP');
    expect(canDecideStep(counterpart!, { roles: ['ADMIN'], employeeId: 'x' }, 'y')).toBe(false);
    expect(canDecideStep(counterpart!, { roles: [], employeeId: 'y' }, 'y')).toBe(true);
    expect(canDecideStep(master!, { roles: ['SHIFT_MASTER'] }, null)).toBe(true);
    expect(canDecideStep(master!, { roles: ['HR'] }, null)).toBe(false);
    expect(stepDeadline(master!, new Date('2026-09-07T10:00:00Z')).toISOString()).toBe(
      '2026-09-08T10:00:00.000Z',
    );
  });
});
