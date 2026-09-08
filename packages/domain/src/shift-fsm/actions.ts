/**
 * Дії користувача або майстра, що змінюють стан зміни (ТЗ 4.4).
 *
 * «Повідомити про проблему» тут навмисно відсутня: вона створює інцидент і не змінює стан
 * (ТЗ 5.5). Якщо робота зупинена, слідом іде START_DOWNTIME.
 */
export const SHIFT_ACTIONS = [
  'START_SHIFT',
  'START_WORK',
  'START_BREAK',
  'START_MEAL',
  'START_SERVICE_TIME',
  'START_DOWNTIME',
  'RESUME',
  'START_CLEANING',
  'CLEANING_DONE',
  'BACK_TO_CLEANING',
  'BACK_TO_WORK',
  'SUBMIT_HANDOVER',
  'CONTINUE_WORK',
  'CLOSE_SHIFT',
  'EMERGENCY_EXIT',
  // System-only: the end-of-day job closes a shift left open past its planned end. Never a button.
  'AUTO_CLOSE',
] as const;

export type ShiftAction = (typeof SHIFT_ACTIONS)[number];

/** Actions a person (employee or master) may invoke. AUTO_CLOSE is system-only, so it is excluded
 * from client commands and from the buttons shown on the shift screen. */
export const USER_SHIFT_ACTIONS = SHIFT_ACTIONS.filter(
  (a): a is Exclude<ShiftAction, 'AUTO_CLOSE'> => a !== 'AUTO_CLOSE',
);
export type UserShiftAction = (typeof USER_SHIFT_ACTIONS)[number];
