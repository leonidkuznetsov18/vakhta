import type { Locale, ShiftAction, ShiftState, TransitionErrorCode } from '@vakhta/domain';
import { DEFAULT_LOCALE } from '@vakhta/domain';
import { en } from './en.js';
import type { Messages } from './messages.js';
import { ru } from './ru.js';
import { uk } from './uk.js';

export type { GuideKey, Messages, SectionGuide } from './messages.js';
export type { ControlMessages } from './control.js';
export { en } from './en.js';
export { ru } from './ru.js';
export { uk } from './uk.js';
export { DEFAULT_LOCALE, LOCALES, isLocale, resolveLocale, type Locale } from '@vakhta/domain';

export const catalogs: Readonly<Record<Locale, Messages>> = { uk, en, ru };

export function messages(locale: Locale = DEFAULT_LOCALE): Messages {
  return catalogs[locale];
}

/** Localizes a holiday code; unknown codes remain visible until the catalogs catch up. */
export function holidayLabel(code: string, locale: Locale = DEFAULT_LOCALE): string {
  const labels: Readonly<Partial<Record<`holiday${string}`, string>>> =
    catalogs[locale].scheduleWorkspace;
  return labels[`holiday${code}`] ?? code;
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

export { format } from './format.js';
export * from './maintenance-notices.js';

export { photoObjectVocabulary } from './photo-object-vocabulary.js';

export type { LandingMessages } from './landing.js';
