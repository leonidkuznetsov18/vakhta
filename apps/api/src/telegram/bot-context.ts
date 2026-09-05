import type { Context } from 'grammy';
import type { EmployeeAccess } from '@vakhta/domain';
import type { EmployeeRecord } from '../identity/employees.service.js';

/** Що middleware додає до кожного оновлення: хто пише і чи має доступ (FR-AUTH-01). */
export interface BotContextFlavor {
  employee: EmployeeRecord | null;
  access: EmployeeAccess;
}

export type BotContext = Context & BotContextFlavor;
