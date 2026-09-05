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
  'SUBMIT_HANDOVER',
  'CONTINUE_WORK',
  'CLOSE_SHIFT',
  'EMERGENCY_EXIT',
] as const;

export type ShiftAction = (typeof SHIFT_ACTIONS)[number];
