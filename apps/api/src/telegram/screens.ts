import { InlineKeyboard } from 'grammy';
import {
  addMonths,
  businessDateOf,
  formatLocal,
  maskFullName,
  maskPersonnelNumber,
  type CheckAction,
  type EmployeeAccess,
} from '@vakhta/domain';
import type { CheckInResult, MyPlanView } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import type { ActivationOutcome, ActivationPreview } from '../identity/activation.service.js';
import type { EmployeeRecord } from '../identity/employees.service.js';
import type { NextShift } from '../scheduling/schedule.service.js';

export interface Screen {
  readonly text: string;
  readonly keyboard?: InlineKeyboard;
}

export const CALLBACK = {
  activationConfirm: 'act:ok',
  activationCancel: 'act:no',
  planPrefix: 'plan:',
  ackPrefix: 'ack:',
  ackAll: 'ack:all',
  arrivePrefix: 'arr:',
  departPrefix: 'dep:',
} as const;

const t = messages('ru');

function localTime(instant: Date, timezone: string): string {
  return formatLocal(instant, timezone).local.slice(11, 16);
}

function localDate(instant: Date, timezone: string): string {
  const d = formatLocal(instant, timezone).local.slice(0, 10);
  const [, m, day] = d.split('-');
  return `${day}.${m}`;
}

function weekdayShort(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return t.schedule.weekdaysShort[day === 0 ? 6 : day - 1] ?? '';
}

export interface HomeInput {
  readonly employee: EmployeeRecord;
  readonly next: NextShift | null;
  readonly unacknowledged: number;
  /** Відкрита присутність: коли працівник відмітив прихід. */
  readonly presenceSince: Date | null;
  readonly timezone: string;
}

/** Головний екран (ТЗ 5.1): присутність, найближча зміна, план, ознайомлення. */
export function homeScreen(input: HomeInput): Screen {
  const lines = [
    format(t.bot.home, {
      name: maskFullName(input.employee.fullName),
      personnelNumber: maskPersonnelNumber(input.employee.personnelNumber),
    }),
    '',
  ];
  if (input.presenceSince) {
    lines.push(
      format(t.attendance.presenceLine, { time: localTime(input.presenceSince, input.timezone) }),
    );
  }
  if (input.next) {
    const tz = input.next.timezone;
    lines.push(
      format(t.schedule.nextShift, {
        date: localDate(input.next.planStartAt, tz),
        weekday: weekdayShort(businessDateOf(input.next.planStartAt, tz)),
        kind: t.schedule.kindNames[input.next.isNight ? 'NIGHT' : 'DAY'],
        start: localTime(input.next.planStartAt, tz),
        end: localTime(input.next.planEndAt, tz),
        zone: input.next.zoneName ? ` · ${input.next.zoneName}` : '',
      }),
    );
  } else {
    lines.push(t.schedule.noNextShift);
  }
  if (input.unacknowledged > 0) lines.push('', t.schedule.ackRequired);

  const keyboard = new InlineKeyboard().text(t.schedule.myPlanButton, `${CALLBACK.planPrefix}cur`);
  if (input.unacknowledged > 0) keyboard.row().text(t.schedule.ackButton, CALLBACK.ackAll);
  return { text: lines.join('\n'), keyboard };
}

/** Після сканування QR: одна дія, що відповідає стану присутності (FR-UI-01). */
export function checkInPromptScreen(input: {
  readonly action: CheckAction;
  readonly terminalName: string;
  readonly token: string;
}): Screen {
  const arrive = input.action === 'ARRIVE';
  return {
    text: format(arrive ? t.attendance.promptArrive : t.attendance.promptDepart, {
      terminal: input.terminalName,
    }),
    keyboard: new InlineKeyboard().text(
      arrive ? t.attendance.arriveButton : t.attendance.departButton,
      `${arrive ? CALLBACK.arrivePrefix : CALLBACK.departPrefix}${input.token}`,
    ),
  };
}

/** Підтвердження з серверним часом і новим статусом (FR-UI-02). */
export function checkInResultScreen(result: CheckInResult, timezone: string): Screen {
  if (!result.ok) return { text: t.attendance.failures[result.reason] };
  const terminal = result.terminalName ?? '';
  if (result.action === 'ARRIVE') {
    const time = localTime(new Date(result.presence.arrivedAt), timezone);
    return {
      text: result.alreadyRecorded
        ? format(t.attendance.arrivedAlready, { time, terminal })
        : format(t.attendance.arrived, { time, terminal }),
    };
  }
  const time = localTime(new Date(result.presence.departedAt ?? result.serverTime), timezone);
  return {
    text: result.alreadyRecorded
      ? format(t.attendance.departedAlready, { time, terminal })
      : format(t.attendance.departed, { time, terminal }),
  };
}

/** «Мій план» за місяць (FR-SCH-01): компактний календар з підсумками й навігацією. */
export function planScreen(plan: MyPlanView): Screen {
  const [year, m] = plan.month.split('-');
  const monthName = t.schedule.months[Number(m) - 1] ?? plan.month;
  const lines = [format(t.schedule.planHeader, { month: monthName, year: year ?? '' }), ''];

  if (plan.totals.shifts === 0) {
    lines.push(format(t.schedule.planEmpty, { month: monthName, year: year ?? '' }));
  } else {
    for (const day of plan.days) {
      const dd = day.date.slice(8, 10);
      const wd = t.schedule.weekdaysShort[day.weekday - 1] ?? '';
      if (!day.assignment) {
        lines.push(`${dd} ${wd}  ${t.schedule.dayKinds.OFF}`);
        continue;
      }
      const a = day.assignment;
      const start = localTime(new Date(a.planStartAt), plan.timezone);
      const end = localTime(new Date(a.planEndAt), plan.timezone);
      const zone = a.zoneName ? ` · ${a.zoneName}` : '';
      const mark = a.acknowledged ? '' : ' •';
      lines.push(`${dd} ${wd}  ${t.schedule.dayKinds[day.kind]} ${start}–${end}${zone}${mark}`);
    }
    lines.push(
      '',
      format(t.schedule.planTotals, {
        shifts: plan.totals.shifts,
        hours: Math.round(plan.totals.plannedMinutes / 60),
        day: plan.totals.dayShifts,
        night: plan.totals.nightShifts,
      }),
    );
    if (plan.unacknowledgedVersionIds.length > 0) lines.push(t.schedule.ackRequired);
  }

  const keyboard = new InlineKeyboard()
    .text(t.schedule.prevMonth, `${CALLBACK.planPrefix}${addMonths(plan.month, -1)}`)
    .text(t.schedule.nextMonth, `${CALLBACK.planPrefix}${addMonths(plan.month, 1)}`);
  if (plan.unacknowledgedVersionIds.length > 0)
    keyboard.row().text(t.schedule.ackButton, CALLBACK.ackAll);
  return { text: lines.join('\n'), keyboard };
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
