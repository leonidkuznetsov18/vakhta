/**
 * Стани робочої зміни за ТЗ 4.3.
 *
 * NOT_STARTED існує лише як початкова точка машини: між «Я на роботі» (контур присутності)
 * і «Почати зміну». Терміналні стани закривають shift_session.
 */

/** Стани, у які можна повернутись після тимчасового стану (resume_state). */
export const RESUMABLE_STATES = ['PREPARATION', 'WORKING', 'CLEANING', 'HANDOVER'] as const;

/** Тимчасові особисті стани: рівно один може бути відкритий (FR-BRK-01, T-08). */
export const TEMPORARY_STATES = ['BREAK', 'MEAL', 'SERVICE_TIME', 'DOWNTIME'] as const;

/** Після цих станів shift_session закрита; переходів більше немає. */
export const TERMINAL_STATES = ['SHIFT_CLOSED', 'EMERGENCY_EXIT'] as const;

export const SHIFT_STATES = [
  'NOT_STARTED',
  ...RESUMABLE_STATES,
  ...TEMPORARY_STATES,
  'READY_TO_CLOSE',
  ...TERMINAL_STATES,
] as const;

export type ShiftState = (typeof SHIFT_STATES)[number];
export type ResumableState = (typeof RESUMABLE_STATES)[number];
export type TemporaryState = (typeof TEMPORARY_STATES)[number];
export type TerminalState = (typeof TERMINAL_STATES)[number];

/** Стани, у яких зміна відкрита і має рівно один активний інтервал (ТЗ 4.5). */
export const ACTIVE_STATES = SHIFT_STATES.filter(
  (s): s is Exclude<ShiftState, 'NOT_STARTED' | TerminalState> =>
    s !== 'NOT_STARTED' && !(TERMINAL_STATES as readonly string[]).includes(s),
);
export type ActiveState = (typeof ACTIVE_STATES)[number];

export function isResumable(state: ShiftState): state is ResumableState {
  return (RESUMABLE_STATES as readonly string[]).includes(state);
}

export function isTemporary(state: ShiftState): state is TemporaryState {
  return (TEMPORARY_STATES as readonly string[]).includes(state);
}

export function isTerminal(state: ShiftState): state is TerminalState {
  return (TERMINAL_STATES as readonly string[]).includes(state);
}

export function isActive(state: ShiftState): state is ActiveState {
  return (ACTIVE_STATES as readonly string[]).includes(state);
}

/** Категорія обліку часу за ТЗ 4.3 і 6.2. PREPARATION за політикою майданчика; за замовчуванням робочий час. */
export type TimeCategory =
  'WORK' | 'PREPARATION' | 'SERVICE' | 'BREAK' | 'MEAL' | 'DOWNTIME' | 'NONE';

export const STATE_TIME_CATEGORY: Readonly<Record<ShiftState, TimeCategory>> = {
  NOT_STARTED: 'NONE',
  PREPARATION: 'PREPARATION',
  WORKING: 'WORK',
  SERVICE_TIME: 'SERVICE',
  BREAK: 'BREAK',
  MEAL: 'MEAL',
  DOWNTIME: 'DOWNTIME',
  CLEANING: 'WORK',
  HANDOVER: 'WORK',
  READY_TO_CLOSE: 'WORK',
  SHIFT_CLOSED: 'NONE',
  EMERGENCY_EXIT: 'NONE',
};
