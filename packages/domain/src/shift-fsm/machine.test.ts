import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { SHIFT_ACTIONS, type ShiftAction } from './actions.js';
import {
  INITIAL_SNAPSHOT,
  allowedActions,
  isConsistentSnapshot,
  transition,
  type ShiftSnapshot,
  type TransitionContext,
} from './machine.js';
import {
  applyTransitionToIntervals,
  checkIntervalInvariants,
  type ActivityInterval,
} from './intervals.js';
import {
  RESUMABLE_STATES,
  SHIFT_STATES,
  TEMPORARY_STATES,
  TERMINAL_STATES,
  isTemporary,
  isTerminal,
  type ResumableState,
} from './states.js';

const FULL_CTX: TransitionContext = {
  presenceConfirmed: true,
  zoneAccepted: true,
  handoverComplete: true,
  reasonCode: 'BREAKDOWN',
};

/** Прогнати ланцюжок дій; кидає, якщо будь-який крок відхилено. */
function run(
  steps: readonly [ShiftAction, TransitionContext?][],
  start = INITIAL_SNAPSHOT,
): ShiftSnapshot {
  let snap = start;
  for (const [action, ctx] of steps) {
    const r = transition(snap, action, ctx ?? FULL_CTX);
    if (!r.ok) throw new Error(`${action} з ${snap.state} відхилено: ${r.error}`);
    snap = r.next;
  }
  return snap;
}

function at(
  state: ShiftSnapshot['state'],
  resumeState: ResumableState | null = null,
): ShiftSnapshot {
  return { state, resumeState };
}

describe('основний цикл зміни (ТЗ 4.2, AC-04)', () => {
  it('проходить від NOT_STARTED до SHIFT_CLOSED без розривів', () => {
    const end = run([
      ['START_SHIFT'],
      ['START_WORK'],
      ['START_BREAK'],
      ['RESUME'],
      ['START_CLEANING'],
      ['CLEANING_DONE'],
      ['SUBMIT_HANDOVER'],
      ['CLOSE_SHIFT'],
    ]);
    expect(end).toEqual(at('SHIFT_CLOSED'));
  });

  it('«Почати зміну» відкриває PREPARATION, «Почати роботу» переводить у WORKING (FR-TIME-02/03)', () => {
    const r1 = transition(INITIAL_SNAPSHOT, 'START_SHIFT', { presenceConfirmed: true });
    expect(r1.ok && r1.next.state).toBe('PREPARATION');
    const r2 = transition(at('PREPARATION'), 'START_WORK', { zoneAccepted: true });
    expect(r2.ok && r2.next.state).toBe('WORKING');
  });

  it('CLEANING_DONE відкриває чернетку передачі, SUBMIT_HANDOVER позначає звіт відправленим', () => {
    const r1 = transition(at('CLEANING'), 'CLEANING_DONE');
    expect(r1.ok && r1.effects).toContain('OPEN_HANDOVER_DRAFT');
    const r2 = transition(at('HANDOVER'), 'SUBMIT_HANDOVER', { handoverComplete: true });
    expect(r2.ok && r2.effects).toContain('MARK_HANDOVER_SUBMITTED');
  });
});

describe('охоронні умови', () => {
  it('T-06: почати зміну без приходу заборонено, резервне рішення майстра дозволяє', () => {
    const blocked = transition(INITIAL_SNAPSHOT, 'START_SHIFT', {});
    expect(blocked).toMatchObject({ ok: false, error: 'PRESENCE_REQUIRED' });
    const override = transition(INITIAL_SNAPSHOT, 'START_SHIFT', { masterOverride: true });
    expect(override.ok).toBe(true);
  });

  it('T-07: повторне «Почати зміну» відхиляється як ALREADY_STARTED', () => {
    const r = transition(at('PREPARATION'), 'START_SHIFT', FULL_CTX);
    expect(r).toMatchObject({ ok: false, error: 'ALREADY_STARTED' });
  });

  it('роботу не почати без прийнятої зони (ТЗ 4.4, FR-HND-03)', () => {
    expect(transition(at('PREPARATION'), 'START_WORK', {})).toMatchObject({
      ok: false,
      error: 'ZONE_NOT_ACCEPTED',
    });
  });

  it('простій вимагає причини (FR-DWN-01)', () => {
    expect(transition(at('WORKING'), 'START_DOWNTIME', {})).toMatchObject({
      ok: false,
      error: 'REASON_REQUIRED',
    });
    expect(transition(at('WORKING'), 'START_DOWNTIME', { reasonCode: '   ' })).toMatchObject({
      ok: false,
      error: 'REASON_REQUIRED',
    });
  });

  it('передачу не відправити без заповненого звіту або винятку (FR-TIME-04)', () => {
    expect(transition(at('HANDOVER'), 'SUBMIT_HANDOVER', {})).toMatchObject({
      ok: false,
      error: 'HANDOVER_INCOMPLETE',
    });
    expect(transition(at('HANDOVER'), 'SUBMIT_HANDOVER', { masterOverride: true }).ok).toBe(true);
  });
});

describe('тимчасові стани і resume_state (FR-BRK-01, ТЗ 4.4)', () => {
  it("перерва запам'ятовує стан і повертає в нього", () => {
    const inBreak = run([['START_BREAK']], at('WORKING'));
    expect(inBreak).toEqual(at('BREAK', 'WORKING'));
    expect(run([['RESUME']], inBreak)).toEqual(at('WORKING'));
  });

  it('T-08: у перерві не відкрити простій чи обід', () => {
    expect(transition(at('BREAK', 'WORKING'), 'START_DOWNTIME', FULL_CTX)).toMatchObject({
      ok: false,
      error: 'TEMPORARY_STATE_OPEN',
    });
    expect(transition(at('BREAK', 'WORKING'), 'START_MEAL', FULL_CTX)).toMatchObject({
      ok: false,
      error: 'TEMPORARY_STATE_OPEN',
    });
  });

  it('T-12: із відкритим простоєм зміну не закрити', () => {
    expect(transition(at('DOWNTIME', 'WORKING'), 'CLOSE_SHIFT', FULL_CTX)).toMatchObject({
      ok: false,
      error: 'TEMPORARY_STATE_OPEN',
    });
  });

  it('T-13: простій під час прибирання повертає в CLEANING', () => {
    const end = run([['START_DOWNTIME'], ['RESUME']], at('CLEANING'));
    expect(end).toEqual(at('CLEANING'));
  });

  it('FR-DWN-06: обід під час простою зберігає resume_state, повернення може йти в DOWNTIME', () => {
    const inDowntime = run([['START_DOWNTIME']], at('WORKING'));
    expect(inDowntime).toEqual(at('DOWNTIME', 'WORKING'));

    const inMeal = run([['START_MEAL']], inDowntime);
    expect(inMeal).toEqual(at('MEAL', 'WORKING'));

    const backToDowntime = transition(inMeal, 'RESUME', { resumeIntoDowntime: true });
    expect(backToDowntime.ok && backToDowntime.next).toEqual(at('DOWNTIME', 'WORKING'));
    expect(backToDowntime.ok && backToDowntime.effects).toContain('SCHEDULE_DOWNTIME_ESCALATION');

    const backToWork = transition(inMeal, 'RESUME', {});
    expect(backToWork.ok && backToWork.next).toEqual(at('WORKING'));
  });

  it('resumeIntoDowntime ігнорується, коли повертаємось із самого DOWNTIME', () => {
    const r = transition(at('DOWNTIME', 'WORKING'), 'RESUME', { resumeIntoDowntime: true });
    expect(r.ok && r.next).toEqual(at('WORKING'));
  });

  it('пошкоджений знімок (тимчасовий стан без resume_state) не повертає мовчки', () => {
    expect(transition(at('BREAK', null), 'RESUME')).toMatchObject({
      ok: false,
      error: 'RESUME_STATE_MISSING',
    });
  });
});

describe('завершення і передача', () => {
  it('«Продовжити роботу» з READY_TO_CLOSE повертає у WORKING і знецінює звіт (FR-HND-07)', () => {
    const r = transition(at('READY_TO_CLOSE'), 'CONTINUE_WORK');
    expect(r.ok && r.next).toEqual(at('WORKING'));
    expect(r.ok && r.effects).toContain('SUPERSEDE_HANDOVER');
  });

  it('з HANDOVER можна повернутись до прибирання', () => {
    expect(run([['BACK_TO_CLEANING']], at('HANDOVER'))).toEqual(at('CLEANING'));
  });

  it('після закриття жодна дія не проходить', () => {
    for (const action of SHIFT_ACTIONS) {
      expect(transition(at('SHIFT_CLOSED'), action, FULL_CTX)).toMatchObject({
        ok: false,
        error: 'SHIFT_NOT_ACTIVE',
      });
    }
  });
});

describe('екстрений вихід (ТЗ 4.4, 6.4)', () => {
  it('доступний з будь-якого активного стану, вимагає причини, сповіщає майстра', () => {
    for (const state of SHIFT_STATES) {
      if (state === 'NOT_STARTED' || isTerminal(state)) continue;
      const snap = at(state, isTemporary(state) ? 'WORKING' : null);
      expect(transition(snap, 'EMERGENCY_EXIT', {})).toMatchObject({
        ok: false,
        error: 'REASON_REQUIRED',
      });
      const r = transition(snap, 'EMERGENCY_EXIT', { reasonCode: 'MEDICAL' });
      expect(r.ok && r.next).toEqual(at('EMERGENCY_EXIT'));
      expect(r.ok && r.effects).toEqual(
        expect.arrayContaining(['NOTIFY_MASTER', 'FLAG_FOR_REVIEW']),
      );
    }
  });
});

describe('allowedActions (FR-UI-01)', () => {
  it('у WORKING пропонує лише сумісні дії', () => {
    const actions = allowedActions(at('WORKING'), FULL_CTX);
    expect(actions).toEqual(
      expect.arrayContaining([
        'START_BREAK',
        'START_MEAL',
        'START_SERVICE_TIME',
        'START_DOWNTIME',
        'START_CLEANING',
        'EMERGENCY_EXIT',
      ]),
    );
    expect(actions).not.toContain('START_SHIFT');
    expect(actions).not.toContain('CLOSE_SHIFT');
    expect(actions).not.toContain('RESUME');
  });

  it('до початку зміни без приходу немає жодної дії', () => {
    expect(allowedActions(INITIAL_SNAPSHOT, {})).toEqual([]);
    expect(allowedActions(INITIAL_SNAPSHOT, { presenceConfirmed: true })).toEqual(['START_SHIFT']);
  });
});

/* ------------------------------------------------------------------ */
/* Property-тести інваріантів ТЗ 4.5                                    */
/* ------------------------------------------------------------------ */

const actionArb = fc.constantFrom(...SHIFT_ACTIONS);

const ctxArb: fc.Arbitrary<TransitionContext> = fc.record(
  {
    presenceConfirmed: fc.boolean(),
    masterOverride: fc.boolean(),
    zoneAccepted: fc.boolean(),
    handoverComplete: fc.boolean(),
    reasonCode: fc.constantFrom('BREAKDOWN', 'NO_MATERIAL', 'OTHER', ''),
    resumeIntoDowntime: fc.boolean(),
  },
  { requiredKeys: [] },
);

const stepArb = fc.tuple(actionArb, ctxArb, fc.integer({ min: 1, max: 3 * 60 * 60 * 1000 }));

describe('інваріанти FSM (property-based, ТЗ 4.5)', () => {
  it('будь-яка послідовність дій зберігає узгодженість знімка і безрозривність інтервалів', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 80 }), (steps) => {
        let snap: ShiftSnapshot = INITIAL_SNAPSHOT;
        let intervals: ActivityInterval[] = [];
        let now = 1_700_000_000_000;
        let shiftStartedAt: number | null = null;
        let shiftEndedAt: number | null = null;
        let terminalReached = false;

        for (const [action, ctx, dt] of steps) {
          now += dt;
          const r = transition(snap, action, ctx);

          if (terminalReached) {
            expect(r.ok).toBe(false);
            continue;
          }
          if (!r.ok) continue;

          if (action === 'START_SHIFT') shiftStartedAt = now;
          snap = r.next;
          intervals = applyTransitionToIntervals(intervals, snap, now);
          if (isTerminal(snap.state)) {
            shiftEndedAt = now;
            terminalReached = true;
          }

          expect(SHIFT_STATES).toContain(snap.state);
          expect(isConsistentSnapshot(snap)).toBe(true);
          if (snap.resumeState !== null) expect(RESUMABLE_STATES).toContain(snap.resumeState);

          const openCount = intervals.filter((i) => i.endedAt === null).length;
          expect(openCount).toBe(isTerminal(snap.state) ? 0 : 1);

          if (shiftStartedAt !== null) {
            const violations = checkIntervalInvariants(intervals, {
              shiftStartedAt,
              shiftEndedAt,
              now,
              toleranceMs: 0,
            });
            expect(violations).toEqual([]);
          }
        }
      }),
      { numRuns: 500 },
    );
  });

  it('з термінального стану немає виходу за жодних фактів', () => {
    fc.assert(
      fc.property(fc.constantFrom(...TERMINAL_STATES), actionArb, ctxArb, (state, action, ctx) => {
        expect(transition(at(state), action, ctx).ok).toBe(false);
      }),
    );
  });

  it("вхід у тимчасовий стан із робочого завжди запам'ятовує саме цей робочий стан", () => {
    const entries = ['START_BREAK', 'START_MEAL', 'START_SERVICE_TIME', 'START_DOWNTIME'] as const;
    fc.assert(
      fc.property(
        fc.constantFrom(...RESUMABLE_STATES),
        fc.constantFrom(...entries),
        (from, action) => {
          const r = transition(at(from), action, { reasonCode: 'BREAKDOWN' });
          expect(r.ok).toBe(true);
          if (r.ok) {
            expect(TEMPORARY_STATES).toContain(r.next.state);
            expect(r.next.resumeState).toBe(from);
          }
        },
      ),
    );
  });

  it('повернення з тимчасового стану без прапорця простою відновлює resume_state', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TEMPORARY_STATES),
        fc.constantFrom(...RESUMABLE_STATES),
        (temp, resume) => {
          const r = transition(at(temp, resume), 'RESUME', {});
          expect(r.ok && r.next).toEqual(at(resume));
        },
      ),
    );
  });
});
