import { InlineKeyboard } from 'grammy';
import { maskFullName, maskPersonnelNumber, type EmployeeAccess } from '@vakhta/domain';
import { format, messages } from '@vakhta/i18n';
import type { ActivationOutcome, ActivationPreview } from '../identity/activation.service.js';
import type { EmployeeRecord } from '../identity/employees.service.js';

export interface Screen {
  readonly text: string;
  readonly keyboard?: InlineKeyboard;
}

export const CALLBACK = {
  activationConfirm: 'act:ok',
  activationCancel: 'act:no',
} as const;

const t = messages('ru');

/** Головний екран для зареєстрованого працівника. Дії зʼявляться разом із графіком і зміною. */
export function homeScreen(employee: EmployeeRecord): Screen {
  return {
    text: [
      format(t.bot.home, {
        name: maskFullName(employee.fullName),
        personnelNumber: maskPersonnelNumber(employee.personnelNumber),
      }),
      '',
      t.bot.homeNoSchedule,
    ].join('\n'),
  };
}

export function welcomeScreen(): Screen {
  return { text: `${t.bot.welcome}\n\n${t.bot.askCode}` };
}

export function accessDeniedScreen(access: Exclude<EmployeeAccess, 'ALLOWED'>): Screen {
  return { text: t.bot.access[access] };
}

export function activationPreviewScreen(preview: Extract<ActivationPreview, { ok: true }>): Screen {
  const position = preview.position
    ? format(t.activation.positionLine, {
        position: preview.position.position,
        orgUnit: preview.position.orgUnit,
      })
    : t.activation.noPosition;
  return {
    text: format(t.activation.preview, {
      name: maskFullName(preview.employee.fullName),
      personnelNumber: maskPersonnelNumber(preview.employee.personnelNumber),
      position,
    }),
    keyboard: new InlineKeyboard()
      .text(t.activation.confirm, CALLBACK.activationConfirm)
      .row()
      .text(t.activation.cancel, CALLBACK.activationCancel),
  };
}

export function activationOutcomeScreen(outcome: ActivationOutcome): Screen {
  if (!outcome.ok) return { text: t.activation.failures[outcome.reason] };
  return { text: outcome.alreadyLinked ? t.activation.alreadyLinked : t.activation.success };
}

export function activationFailureText(
  reason: Extract<ActivationPreview, { ok: false }>['reason'],
): string {
  return t.activation.failures[reason];
}
