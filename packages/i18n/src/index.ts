import type { ShiftAction, ShiftState, TransitionErrorCode } from '@vakhta/domain';
import { ru } from './ru.js';
import type { Messages } from './messages.js';

export type { Messages } from './messages.js';
export { ru } from './ru.js';

export type Locale = 'ru';

const catalogs: Readonly<Record<Locale, Messages>> = { ru };

export function messages(locale: Locale = 'ru'): Messages {
  return catalogs[locale];
}

export function actionLabel(action: ShiftAction, locale: Locale = 'ru'): string {
  return catalogs[locale].actions[action];
}

export function stateLabel(state: ShiftState, locale: Locale = 'ru'): string {
  return catalogs[locale].states[state];
}

export function errorMessage(code: TransitionErrorCode, locale: Locale = 'ru'): string {
  return catalogs[locale].errors[code];
}
