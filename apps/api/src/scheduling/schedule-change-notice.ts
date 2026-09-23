import {
  formatLocal,
  type EmployeeChanges,
  type PlannedShift,
  type ShiftChange,
} from '@vakhta/domain';
import { format, type Messages } from '@vakhta/i18n';

/** Telegram messages stay short; the full plan is one tap away. */
export const MAX_CHANGE_LINES = 12;

/** Telegram refuses texts over 4096 characters; long zone names and reasons must not reach it. */
export const MAX_NOTICE_CHARS = 3800;
/** Room kept for the "…and N more" line. */
const MORE_LINE_RESERVE = 40;

/** Bot button under a schedule notice: opens that month's plan as a new message. */
export const PLAN_MESSAGE_CALLBACK = 'planmsg:';

export interface ScheduleNoticeInput {
  readonly periodMonth: string;
  readonly timezone: string;
  readonly zoneNames: ReadonlyMap<string, string>;
  readonly reason: string | null;
}

interface ChangeLine {
  readonly businessDate: string;
  readonly text: string;
}

function monthLabel(t: Messages, periodMonth: string): { month: string; year: string } {
  const [year, m] = periodMonth.split('-');
  return { month: t.schedule.months[Number(m) - 1] ?? periodMonth, year: year ?? '' };
}

function dayLabel(t: Messages, businessDate: string): { weekday: string; date: string } {
  const day = new Date(`${businessDate}T00:00:00Z`).getUTCDay();
  const [, month, dd] = businessDate.split('-');
  return {
    weekday: t.schedule.weekdaysShort[day === 0 ? 6 : day - 1] ?? '',
    date: `${dd}.${month}`,
  };
}

function shiftLabel(t: Messages, shift: PlannedShift, input: ScheduleNoticeInput): string {
  const kind = t.schedule.kindNames[shift.period];
  const start = formatLocal(shift.planStartAt, input.timezone).local.slice(11, 16);
  const end = formatLocal(shift.planEndAt, input.timezone).local.slice(11, 16);
  const zone = shift.zoneId ? input.zoneNames.get(shift.zoneId) : undefined;
  return `${kind} ${start}–${end}${zone ? ` · ${zone}` : ''}`;
}

/** A change of kind, team or position alone keeps the hours; an arrow between equal texts would confuse. */
function changedLine(
  t: Messages,
  { before, after }: ShiftChange,
  input: ScheduleNoticeInput,
): string {
  const day = dayLabel(t, after.businessDate);
  const was = shiftLabel(t, before, input);
  const now = shiftLabel(t, after, input);
  if (was === now) return format(t.schedule.changeDetails, { ...day, shift: now });
  return format(t.schedule.changeChanged, { ...day, before: was, after: now });
}

function changeLines(
  t: Messages,
  changes: EmployeeChanges,
  input: ScheduleNoticeInput,
): ChangeLine[] {
  const added = changes.added.map((shift) => ({
    businessDate: shift.businessDate,
    text: format(t.schedule.changeAdded, {
      ...dayLabel(t, shift.businessDate),
      shift: shiftLabel(t, shift, input),
    }),
  }));
  const removed = changes.removed.map((shift) => ({
    businessDate: shift.businessDate,
    text: format(t.schedule.changeRemoved, {
      ...dayLabel(t, shift.businessDate),
      shift: shiftLabel(t, shift, input),
    }),
  }));
  const changed = changes.changed.map((change) => ({
    businessDate: change.after.businessDate,
    text: changedLine(t, change, input),
  }));
  return [...added, ...removed, ...changed].sort((a, b) =>
    a.businessDate.localeCompare(b.businessDate),
  );
}

/**
 * The worker is informed, not asked to confirm: every added, cancelled or changed shift is
 * named with its date and hours, so the message alone tells what is different.
 */
export function scheduleChangedText(
  t: Messages,
  changes: EmployeeChanges,
  input: ScheduleNoticeInput,
): string {
  const header = format(t.schedule.changed, monthLabel(t, input.periodMonth));
  const reason = input.reason ? format(t.schedule.changeReason, { reason: input.reason }) : '';
  const lines = changeLines(t, changes, input).map((line) => line.text);
  const shown = fittingLines(lines, MAX_NOTICE_CHARS - header.length - reason.length);
  const hidden = lines.length - shown.length;
  if (hidden > 0) shown.push(format(t.schedule.changeMore, { count: hidden }));
  const text = [header, '', ...shown];
  if (reason) text.push('', reason);
  return text.join('\n');
}

/** At most MAX_CHANGE_LINES whole lines that fit the budget; the rest are counted, not cut. */
function fittingLines(lines: readonly string[], budget: number): string[] {
  const shown: string[] = [];
  let used = MORE_LINE_RESERVE;
  for (const line of lines.slice(0, MAX_CHANGE_LINES)) {
    used += line.length + 1;
    if (used > budget) break;
    shown.push(line);
  }
  return shown;
}

export function schedulePublishedText(
  t: Messages,
  shifts: number,
  input: Pick<ScheduleNoticeInput, 'periodMonth' | 'reason'>,
): string {
  const text = [format(t.schedule.published, { ...monthLabel(t, input.periodMonth), shifts })];
  if (input.reason) text.push('', format(t.schedule.changeReason, { reason: input.reason }));
  return text.join('\n');
}

/** Every shift a change line may mention, for loading zone names in one query. */
export function changedShifts(changes: EmployeeChanges): PlannedShift[] {
  return [
    ...changes.added,
    ...changes.removed,
    ...changes.changed.flatMap(({ before, after }) => [before, after]),
  ];
}
