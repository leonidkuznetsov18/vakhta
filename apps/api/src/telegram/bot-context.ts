import type { Context } from 'grammy';
import type { EmployeeAccess, Locale } from '@vakhta/domain';
import type { Messages } from '@vakhta/i18n';
import type { EmployeeRecord } from '../identity/employees.service.js';

/** What the middleware adds to every update: who writes, whether they have access, and their language (FR-AUTH-01). */
export interface BotContextFlavor {
  employee: EmployeeRecord | null;
  access: EmployeeAccess;
  /** Employee's saved choice, otherwise the Telegram client language, otherwise the default. */
  locale: Locale;
  /** Catalog for `locale`; every screen and toast is rendered through it. */
  t: Messages;
}

export type BotContext = Context & BotContextFlavor;
