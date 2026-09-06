import type { Locale, ShiftAction, ShiftState, TransitionErrorCode } from '@vakhta/domain';
import { DEFAULT_LOCALE } from '@vakhta/domain';
import { en } from './en.js';
import type { Messages } from './messages.js';
import { ru } from './ru.js';
import { uk } from './uk.js';

export type { GuideKey, Messages, SectionGuide } from './messages.js';
export { en } from './en.js';
export { ru } from './ru.js';
export { uk } from './uk.js';
export { DEFAULT_LOCALE, LOCALES, isLocale, resolveLocale, type Locale } from '@vakhta/domain';

export const catalogs: Readonly<Record<Locale, Messages>> = { uk, en, ru };

export function messages(locale: Locale = DEFAULT_LOCALE): Messages {
  return catalogs[locale];
}

export function actionLabel(action: ShiftAction, locale: Locale = DEFAULT_LOCALE): string {
  return catalogs[locale].actions[action];
}

export function stateLabel(state: ShiftState, locale: Locale = DEFAULT_LOCALE): string {
  return catalogs[locale].states[state];
}

export function errorMessage(code: TransitionErrorCode, locale: Locale = DEFAULT_LOCALE): string {
  return catalogs[locale].errors[code];
}

/** Substitutes {key} placeholders. Unknown keys are left as is so the gap is visible in the text. */
export function format(
  template: string,
  params: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}
