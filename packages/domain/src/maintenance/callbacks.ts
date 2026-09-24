/**
 * Telegram callback data of the mechanic's maintenance screens. Notifications (API and worker) and
 * the bot handlers build and parse the same strings; each stays within Telegram's 64-byte limit.
 */
export const MaintenanceCallbackAction = {
  LIST: 'l',
  OPEN: 'o',
  MANUAL: 'd',
  READY: 'y',
  MISSING: 'n',
  START: 's',
  ANSWER: 'a',
  PAUSE: 'p',
  RESUME: 'r',
  SUBMIT: 'u',
  ACCEPT: 'c',
  DECLINE: 'x',
  FINISH: 'f',
} as const;
export type MaintenanceCallbackAction =
  (typeof MaintenanceCallbackAction)[keyof typeof MaintenanceCallbackAction];

export const MAINTENANCE_CALLBACK_PREFIX = 'mw';

/** Answer codes on an operation button: done, not done, not applicable. */
export const AnswerCode = { DONE: 'd', NOT_DONE: 'n', NOT_APPLICABLE: 'a' } as const;
export type AnswerCode = (typeof AnswerCode)[keyof typeof AnswerCode];

export interface MaintenanceCallback {
  readonly action: MaintenanceCallbackAction;
  readonly workOrderId: string | null;
  /** Operation ordinal and answer code for ANSWER; wait reason index for PAUSE. */
  readonly arg: string | null;
}

export function maintenanceCallback(
  action: MaintenanceCallbackAction,
  workOrderId?: string,
  arg?: string,
): string {
  return [MAINTENANCE_CALLBACK_PREFIX, action, workOrderId, arg].filter(Boolean).join(':');
}

const ACTIONS = new Set<string>(Object.values(MaintenanceCallbackAction));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Parses callback data of these screens; null for anything else or a malformed value. */
export function parseMaintenanceCallback(data: string): MaintenanceCallback | null {
  const [prefix, action, workOrderId, arg] = data.split(':');
  if (prefix !== MAINTENANCE_CALLBACK_PREFIX || !action || !ACTIONS.has(action)) return null;
  if (workOrderId !== undefined && !UUID.test(workOrderId)) return null;
  if (arg !== undefined && !/^[0-9a-z.]{1,12}$/.test(arg)) return null;
  return {
    action: action as MaintenanceCallbackAction,
    workOrderId: workOrderId ?? null,
    arg: arg ?? null,
  };
}
