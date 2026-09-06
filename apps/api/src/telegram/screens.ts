import { InlineKeyboard } from 'grammy';
import {
  HANDOVER_ANGLES,
  LOCALES,
  REMARK_NEEDS,
  addMonths,
  businessDateOf,
  formatLocal,
  maskFullName,
  maskPersonnelNumber,
  type CheckAction,
  type ChecklistKey,
  type EmployeeAccess,
  type HandoverAngle,
  type Locale,
  type RequestType,
  type ShiftAction,
} from '@vakhta/domain';
import type {
  CheckInResult,
  HandoverView,
  MyPlanView,
  MyScoresView,
  PendingHandoverView,
  ReasonOption,
  ReportProblemResult,
  RequestView,
  ShiftScoreView,
  ShiftScreenView,
  ShiftSummaryView,
} from '@vakhta/contracts';
import { format, type Messages } from '@vakhta/i18n';
import type { ActivationOutcome, ActivationPreview } from '../identity/activation.service.js';
import type { EmployeeRecord } from '../identity/employees.service.js';
import type { NextShift } from '../scheduling/schedule.service.js';

/**
 * Every screen is a pure function of the server state and the catalog `t` for the
 * employee's language (ADR-11): nothing here reads the process locale.
 */
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
  languageMenu: 'lang:menu',
  languagePrefix: 'lang:',
} as const;

function localTime(instant: Date, timezone: string): string {
  return formatLocal(instant, timezone).local.slice(11, 16);
}

function localDate(instant: Date, timezone: string): string {
  const d = formatLocal(instant, timezone).local.slice(0, 10);
  const [, m, day] = d.split('-');
  return `${day}.${m}`;
}

function weekdayShort(t: Messages, date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return t.schedule.weekdaysShort[day === 0 ? 6 : day - 1] ?? '';
}

/** Checklist item labels are stored in the definition; known keys are rendered in the employee's language. */
function itemLabel(t: Messages, item: { readonly key: string; readonly label: string }): string {
  return (
    (t.handover.items as Readonly<Record<string, string>>)[item.key as ChecklistKey] ?? item.label
  );
}

export interface HomeInput {
  readonly employee: EmployeeRecord;
  readonly next: NextShift | null;
  readonly unacknowledged: number;
  /** Open presence: when the employee recorded arrival. */
  readonly presenceSince: Date | null;
  readonly timezone: string;
  /** Shift swaps waiting for this employee's consent. */
  readonly pendingSwaps: number;
  /** Address of the user guide; when set the home screen gets a Help link. */
  readonly helpUrl?: string | null;
}

/** Home screen (spec 5.1): presence, next shift, plan, acknowledgement. */
export function homeScreen(t: Messages, input: HomeInput): Screen {
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
  } else {
    lines.push(t.bot.checkInHint);
  }
  if (input.next) {
    const tz = input.next.timezone;
    lines.push(
      format(t.schedule.nextShift, {
        date: localDate(input.next.planStartAt, tz),
        weekday: weekdayShort(t, businessDateOf(input.next.planStartAt, tz)),
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

  const keyboard = new InlineKeyboard()
    .text(t.schedule.myPlanButton, `${CALLBACK.planPrefix}cur`)
    .text(t.requests.menuButton, 'rq:menu')
    .row()
    .text(t.bonus.myScoresButton, BONUS_CALLBACK.me)
    .text(t.language.menuButton, CALLBACK.languageMenu);
  if (input.unacknowledged > 0) keyboard.row().text(t.schedule.ackButton, CALLBACK.ackAll);
  if (input.pendingSwaps > 0)
    keyboard.row().text(`${t.requests.counterpartYes}? (${input.pendingSwaps})`, 'rq:pending');
  if (input.helpUrl) keyboard.row().url(`ℹ️ ${t.bot.helpButton}`, input.helpUrl);
  return { text: lines.join('\n'), keyboard };
}

/** Language picker: one button per supported locale, the current one marked. */
export function languageScreen(t: Messages, current: Locale): Screen {
  const keyboard = new InlineKeyboard();
  for (const locale of LOCALES) {
    keyboard
      .text(
        `${locale === current ? '✅ ' : ''}${t.language.names[locale]}`,
        `${CALLBACK.languagePrefix}${locale}`,
      )
      .row();
  }
  keyboard.text(t.shift.backToShift, SHIFT_CALLBACK.back);
  return { text: t.language.choose, keyboard };
}

/** After scanning a QR: a single action matching the presence state (FR-UI-01). */
export function checkInPromptScreen(
  t: Messages,
  input: {
    readonly action: CheckAction;
    readonly terminalName: string;
    readonly token: string;
  },
): Screen {
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

/** Confirmation with server time and the new status (FR-UI-02). */
export function checkInResultScreen(t: Messages, result: CheckInResult, timezone: string): Screen {
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

/** "My plan" for a month (FR-SCH-01): compact calendar with totals and navigation. */
export function planScreen(t: Messages, plan: MyPlanView): Screen {
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
  keyboard.row().text(t.shift.backToShift, SHIFT_CALLBACK.back);
  return { text: lines.join('\n'), keyboard };
}

export function welcomeScreen(t: Messages): Screen {
  return { text: `${t.bot.welcome}\n\n${t.bot.askCode}` };
}

export function accessDeniedScreen(
  t: Messages,
  access: Exclude<EmployeeAccess, 'ALLOWED'>,
): Screen {
  return { text: t.bot.access[access] };
}

export function activationPreviewScreen(
  t: Messages,
  preview: Extract<ActivationPreview, { ok: true }>,
): Screen {
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

export function activationOutcomeScreen(t: Messages, outcome: ActivationOutcome): Screen {
  if (!outcome.ok) return { text: t.activation.failures[outcome.reason] };
  return { text: outcome.alreadyLinked ? t.activation.alreadyLinked : t.activation.success };
}

export function activationFailureText(
  t: Messages,
  reason: Extract<ActivationPreview, { ok: false }>['reason'],
): string {
  return t.activation.failures[reason];
}

/* -------------------------------------------------------------------- */
/* Shift (spec 4.4, 5.1): the screen is rendered from server state, ADR-11 */
/* -------------------------------------------------------------------- */

export const SHIFT_CALLBACK = {
  prefix: 'sh:',
  pick: 'sh:pick:',
  zone: 'sh:zone:',
  back: 'sh:back',
} as const;

/** Actions that open a reason picker instead of transitioning immediately. */
const REASON_ACTIONS: readonly ShiftAction[] = ['START_DOWNTIME', 'EMERGENCY_EXIT'];

function shiftLines(t: Messages, view: ShiftScreenView): string[] {
  const s = view.session;
  if (!s) return [];
  const tz = view.timezone;
  const lines: string[] = [];
  if (s.state === 'SHIFT_CLOSED' || s.state === 'EMERGENCY_EXIT') {
    lines.push(s.state === 'SHIFT_CLOSED' ? t.shift.closedHeader : t.shift.emergencyHeader);
  } else {
    lines.push(
      format(t.shift.stateLine, {
        state: t.states[s.state],
        since: s.stateSince ? localTime(new Date(s.stateSince), tz) : '—',
      }),
    );
    if (s.resumeState) lines.push(format(t.shift.resumeLine, { resume: t.states[s.resumeState] }));
  }
  if (s.planStartAt && s.planEndAt) {
    lines.push(
      format(t.shift.planLine, {
        start: localTime(new Date(s.planStartAt), tz),
        end: localTime(new Date(s.planEndAt), tz),
      }),
    );
  }
  if (s.zoneName) {
    lines.push(format(t.shift.zoneLine, { zone: s.zoneName }));
    if (!s.zoneAccepted && s.state === 'PREPARATION') lines.push(t.shift.zoneNotAccepted);
  }
  if (s.needsClarification && (s.state === 'SHIFT_CLOSED' || s.state === 'EMERGENCY_EXIT')) {
    lines.push(t.shift.flagged);
  }
  if (view.summary) lines.push('', summaryLines(t, view.summary));
  return lines;
}

/** Shift summary text (spec 5.1), shared by the bot screen and the closing notification. */
export function summaryLines(t: Messages, s: ShiftSummaryView): string {
  const lines = [
    format(t.shift.summaryTotals, {
      total: s.totalMinutes,
      work: s.workMinutes + s.preparationMinutes + s.serviceMinutes,
      breaks: s.breakMinutes,
      meal: s.mealMinutes,
      downtime: s.downtimeMinutes,
    }),
  ];
  if (s.lateMinutes > 0) lines.push(format(t.shift.summaryLate, { minutes: s.lateMinutes }));
  if (s.earlyLeaveMinutes > 0)
    lines.push(format(t.shift.summaryEarly, { minutes: s.earlyLeaveMinutes }));
  if (s.overtimeMinutes > 0)
    lines.push(format(t.shift.summaryOvertime, { minutes: s.overtimeMinutes }));
  if (s.overtimePending) lines.push(t.shift.summaryOvertimePending);
  return lines.join('\n');
}

/** Shift keyboard: only allowed actions, two per row; mutually exclusive ones are hidden (FR-UI-01). */
export function shiftKeyboard(t: Messages, view: ShiftScreenView): InlineKeyboard | undefined {
  const version = view.session?.version ?? 0;
  const keyboard = new InlineKeyboard();
  let inRow = 0;
  /** New row only when the current one is not empty: Telegram rejects empty rows. */
  const newRow = () => {
    if (inRow > 0) keyboard.row();
    inRow = 0;
  };
  const add = (label: string, data: string) => {
    if (inRow === 2) newRow();
    keyboard.text(label, data);
    inRow += 1;
  };
  if (view.canAcceptZone) {
    add(t.shift.acceptZone, `${SHIFT_CALLBACK.zone}${version}`);
    newRow();
  }
  for (const action of view.allowedActions) {
    if (action === 'RESUME' && view.offerResumeIntoDowntime) {
      newRow();
      keyboard.text(t.shift.resumeIntoDowntimeYes, `${SHIFT_CALLBACK.prefix}RESUME:${version}`);
      inRow = 1;
      newRow();
      keyboard.text(t.shift.resumeIntoDowntimeNo, `${SHIFT_CALLBACK.prefix}RESUME:${version}:DT`);
      inRow = 1;
      newRow();
      continue;
    }
    const data = REASON_ACTIONS.includes(action)
      ? `${SHIFT_CALLBACK.pick}${action === 'START_DOWNTIME' ? 'DOWNTIME' : 'EMERGENCY'}:${version}`
      : `${SHIFT_CALLBACK.prefix}${action}:${version}`;
    add(t.actions[action], data);
  }
  if (view.session?.state === 'HANDOVER') {
    newRow();
    keyboard.text(t.handover.openButton, 'hv:open');
  }
  if (view.pendingHandovers > 0) {
    newRow();
    keyboard.text(`📥 ${t.admin.handover.review} (${view.pendingHandovers})`, 'hr:open');
  }
  if (
    view.session &&
    view.session.state !== 'SHIFT_CLOSED' &&
    view.session.state !== 'EMERGENCY_EXIT' &&
    view.session.state !== 'NOT_STARTED'
  ) {
    newRow();
    keyboard.text(t.incidents.reportButton, `${INCIDENT_CALLBACK.newPrefix}${version}`);
    inRow = 1;
    newRow();
    keyboard
      .text(t.schedule.myPlanButton, `${CALLBACK.planPrefix}cur`)
      .text(t.requests.menuButton, 'rq:menu');
  } else if (view.session) {
    newRow();
    keyboard
      .text(t.schedule.myPlanButton, `${CALLBACK.planPrefix}cur`)
      .text(t.requests.menuButton, 'rq:menu');
    if (view.session.state === 'SHIFT_CLOSED' || view.session.state === 'EMERGENCY_EXIT') {
      keyboard
        .row()
        .text(t.requests.types.CORRECTION, `rq:corr:${view.session.id}`)
        .text(t.bonus.myScoresButton, BONUS_CALLBACK.me);
    }
  }
  return keyboard.inline_keyboard.some((row) => row.length > 0) ? keyboard : undefined;
}

/** Screen of an active or just-closed shift. */
export function shiftScreen(t: Messages, view: ShiftScreenView, header: string): Screen {
  const lines = [header, '', ...shiftLines(t, view)];
  if (view.offerResumeIntoDowntime && view.allowedActions.includes('RESUME')) {
    lines.push('', t.shift.resumeIntoDowntimeQuestion);
  }
  const keyboard = shiftKeyboard(t, view);
  return keyboard ? { text: lines.join('\n'), keyboard } : { text: lines.join('\n') };
}

/** Reason picker for downtime or emergency exit from the directory (FR-DWN-01). */
export function reasonPickerScreen(
  t: Messages,
  view: ShiftScreenView,
  kind: 'DOWNTIME' | 'EMERGENCY',
): Screen {
  const reasons = kind === 'DOWNTIME' ? view.downtimeReasons : view.emergencyReasons;
  const version = view.session?.version ?? 0;
  const action = kind === 'DOWNTIME' ? 'START_DOWNTIME' : 'EMERGENCY_EXIT';
  const keyboard = new InlineKeyboard();
  for (const r of reasons) {
    keyboard.text(r.label, `${SHIFT_CALLBACK.prefix}${action}:${version}:${r.code}`).row();
  }
  keyboard.text(t.shift.backToShift, SHIFT_CALLBACK.back);
  return {
    text:
      reasons.length === 0
        ? t.shift.noReasons
        : kind === 'DOWNTIME'
          ? t.shift.chooseDowntimeReason
          : t.shift.chooseEmergencyReason,
    keyboard,
  };
}

/* -------------------------------------------------------------------- */
/* Problems and incidents (spec 5.5)                                      */
/* -------------------------------------------------------------------- */

export const INCIDENT_CALLBACK = {
  newPrefix: 'inc:new:',
  reasonPrefix: 'inc:r:',
  stopPrefix: 'inc:stop:',
  skipPhoto: 'inc:skip',
  cancel: 'inc:cancel',
} as const;

export function incidentReasonScreen(t: Messages, reasons: readonly ReasonOption[]): Screen {
  const keyboard = new InlineKeyboard();
  for (const r of reasons)
    keyboard.text(r.label, `${INCIDENT_CALLBACK.reasonPrefix}${r.code}`).row();
  keyboard.text(t.incidents.cancel, INCIDENT_CALLBACK.cancel);
  return { text: reasons.length === 0 ? t.shift.noReasons : t.incidents.chooseReason, keyboard };
}

export function incidentCommentScreen(t: Messages): Screen {
  return {
    text: t.incidents.askComment,
    keyboard: new InlineKeyboard().text(t.incidents.cancel, INCIDENT_CALLBACK.cancel),
  };
}

export function incidentPhotoScreen(t: Messages): Screen {
  return {
    text: t.incidents.askPhoto,
    keyboard: new InlineKeyboard()
      .text(t.incidents.skipPhoto, INCIDENT_CALLBACK.skipPhoto)
      .row()
      .text(t.incidents.cancel, INCIDENT_CALLBACK.cancel),
  };
}

/** "Is work stopped?": "Yes" additionally opens a personal DOWNTIME (spec 5.5). */
export function incidentStoppedScreen(t: Messages, reasonLabel: string): Screen {
  return {
    text: `${reasonLabel}\n\n${t.incidents.askStopped}`,
    keyboard: new InlineKeyboard()
      .text(t.incidents.stoppedYes, `${INCIDENT_CALLBACK.stopPrefix}1`)
      .row()
      .text(t.incidents.stoppedNo, `${INCIDENT_CALLBACK.stopPrefix}0`)
      .row()
      .text(t.incidents.cancel, INCIDENT_CALLBACK.cancel),
  };
}

export function incidentResultScreen(
  t: Messages,
  result: ReportProblemResult,
  reasonLabel: string,
): Screen {
  const lines = [
    result.linkedToExisting
      ? t.incidents.linked
      : format(t.incidents.reported, { reason: reasonLabel }),
    result.severity === 'SAFETY' ? t.incidents.safetyEscalated : t.incidents.masterNotified,
  ];
  if (result.downtimeStarted) lines.push(t.incidents.downtimeOpened);
  else if (result.downtimeError) {
    const known = (t.errors as Record<string, string>)[result.downtimeError];
    lines.push(format(t.incidents.downtimeNotOpened, { error: known ?? result.downtimeError }));
  }
  return { text: lines.join('\n') };
}

/* -------------------------------------------------------------------- */
/* Cleaning, checklist, photos, handover (spec 5.6-5.8)                   */
/* -------------------------------------------------------------------- */

export const HANDOVER_CALLBACK = {
  ok: 'hv:ok:',
  remark: 'hv:rem:',
  note: 'hv:note',
  photo: 'hv:ph:',
  cannot: 'hv:cannot',
  cannotReason: 'hv:cr:',
  submit: 'hv:submit',
  cancel: 'hv:cancel',
  remarkCategory: 'hv:rc:',
  safeYes: 'hv:safe:1',
  safeNo: 'hv:safe:0',
  need: 'hv:need:',
  reviewAccept: 'hr:ok:',
  reviewIssue: 'hr:issue:',
  reviewCategory: 'hr:rc:',
} as const;

/** Checklist screen in HANDOVER: a line per item (✅ / ⚠️), three angles, submission. */
export function handoverScreen(t: Messages, view: HandoverView, header: string): Screen {
  const done = view.items.filter((i) => i.answered).length;
  const lines = [
    header,
    '',
    format(t.handover.header, { zone: view.zoneName }),
    format(t.handover.progress, { done, total: view.items.length, photos: view.photos.length }),
  ];
  for (const item of view.items) {
    const mark = !item.answered ? '▫️' : item.ok ? '✅' : '⚠️';
    const extra =
      item.kind === 'NOTE' && item.answered
        ? ''
        : item.answered && !item.ok
          ? ` · ${item.remarkText ?? ''}`
          : '';
    lines.push(`${mark} ${itemLabel(t, item)}${extra}`);
  }
  for (const photo of view.photos) {
    lines.push(`🖼 ${t.handover.angles[photo.angle]}: ${t.handover.quality[photo.media.quality]}`);
  }
  if (view.cannotCompleteReason) lines.push('', t.handover.cannotCompleteSaved);
  if (view.status !== 'DRAFT') lines.push('', t.handover.submitted);
  else if (view.issues.length > 0) {
    lines.push('', t.handover.notReady);
    const seen = new Set<string>();
    for (const issue of view.issues) {
      const item = view.items.find((i) => i.key === issue.itemKey);
      const label =
        issue.code === 'PHOTO_MISSING'
          ? `${t.handover.issues.PHOTO_MISSING}: ${t.handover.angles[issue.angle!]}`
          : `${t.handover.issues[issue.code]}: ${item ? itemLabel(t, item) : issue.itemKey}`;
      if (!seen.has(label)) lines.push(`• ${label}`);
      seen.add(label);
    }
  }

  if (view.status !== 'DRAFT') return { text: lines.join('\n') };
  const keyboard = new InlineKeyboard();
  for (const item of view.items) {
    if (item.kind === 'NOTE') {
      keyboard
        .text(
          item.answered ? `✍️ ${itemLabel(t, item)} ✓` : t.handover.noteButton,
          HANDOVER_CALLBACK.note,
        )
        .row();
      continue;
    }
    keyboard
      .text(
        `${item.answered && item.ok ? '✅' : t.handover.okButton} ${itemLabel(t, item)}`,
        `${HANDOVER_CALLBACK.ok}${item.key}`,
      )
      .text(
        item.answered && !item.ok ? '⚠️ ✓' : t.handover.remarkButton,
        `${HANDOVER_CALLBACK.remark}${item.key}`,
      )
      .row();
  }
  const present = new Set(view.photos.map((p) => p.angle));
  for (const angle of HANDOVER_ANGLES) {
    keyboard.text(
      format(present.has(angle) ? t.handover.photoDone : t.handover.photoButton, {
        angle: t.handover.angles[angle],
      }),
      `${HANDOVER_CALLBACK.photo}${angle}`,
    );
  }
  keyboard.row();
  if (view.issues.length === 0) keyboard.text(t.handover.submit, HANDOVER_CALLBACK.submit).row();
  if (!view.cannotCompleteReason)
    keyboard.text(t.handover.cannotComplete, HANDOVER_CALLBACK.cannot).row();
  keyboard.text(t.shift.backToShift, SHIFT_CALLBACK.back);
  return { text: lines.join('\n'), keyboard };
}

export function handoverPhotoPromptScreen(t: Messages, angle: HandoverAngle): Screen {
  return {
    text: format(t.handover.askPhoto, { angle: t.handover.angles[angle] }),
    keyboard: new InlineKeyboard().text(t.handover.cancel, HANDOVER_CALLBACK.cancel),
  };
}

export function handoverRemarkCategoryScreen(
  t: Messages,
  itemLabelText: string,
  reasons: readonly ReasonOption[],
): Screen {
  const keyboard = new InlineKeyboard();
  for (const r of reasons)
    keyboard.text(r.label, `${HANDOVER_CALLBACK.remarkCategory}${r.code}`).row();
  keyboard.text(t.handover.cancel, HANDOVER_CALLBACK.cancel);
  return { text: format(t.handover.chooseRemarkCategory, { item: itemLabelText }), keyboard };
}

export function handoverTextPromptScreen(t: Messages, text: string): Screen {
  return { text, keyboard: new InlineKeyboard().text(t.handover.cancel, HANDOVER_CALLBACK.cancel) };
}

export function handoverSafeScreen(t: Messages): Screen {
  return {
    text: t.handover.askSafe,
    keyboard: new InlineKeyboard()
      .text(t.handover.safeYes, HANDOVER_CALLBACK.safeYes)
      .row()
      .text(t.handover.safeNo, HANDOVER_CALLBACK.safeNo)
      .row()
      .text(t.handover.cancel, HANDOVER_CALLBACK.cancel),
  };
}

export function handoverNeedsScreen(t: Messages): Screen {
  const keyboard = new InlineKeyboard();
  for (const need of REMARK_NEEDS)
    keyboard.text(t.handover.needs[need], `${HANDOVER_CALLBACK.need}${need}`).row();
  keyboard.text(t.handover.needsNone, `${HANDOVER_CALLBACK.need}NONE`);
  return { text: t.handover.askNeeds, keyboard };
}

export function cannotCompleteReasonScreen(t: Messages, reasons: readonly ReasonOption[]): Screen {
  const keyboard = new InlineKeyboard();
  for (const r of reasons)
    keyboard.text(r.label, `${HANDOVER_CALLBACK.cannotReason}${r.code}`).row();
  keyboard.text(t.handover.cancel, HANDOVER_CALLBACK.cancel);
  return { text: t.handover.cannotCompleteReason, keyboard };
}

/** Receiving shift: handovers waiting for a zone check (FR-HND-03). */
export function pendingHandoverScreen(
  t: Messages,
  pending: readonly PendingHandoverView[],
  timezone: string,
): Screen {
  const lines = [t.handover.pendingHeader, ''];
  const keyboard = new InlineKeyboard();
  for (const p of pending) {
    lines.push(
      format(t.handover.pendingLine, {
        zone: p.zoneName,
        name: p.submittedByName,
        time: localTime(new Date(p.submittedAt), timezone),
      }),
    );
    if (p.remarks > 0) lines.push(format(t.handover.pendingRemarks, { count: p.remarks }));
    if (p.cannotComplete) lines.push(t.admin.handover.cannotComplete);
    for (const note of p.notes) lines.push(format(t.handover.pendingNotes, { note }));
    lines.push('');
    keyboard
      .text(t.handover.acceptButton, `${HANDOVER_CALLBACK.reviewAccept}${p.id}`)
      .row()
      .text(t.handover.issueButton, `${HANDOVER_CALLBACK.reviewIssue}${p.id}`)
      .row();
  }
  keyboard.text(t.shift.backToShift, SHIFT_CALLBACK.back);
  return { text: lines.join('\n').trim(), keyboard };
}

export function reviewCategoryScreen(t: Messages, reasons: readonly ReasonOption[]): Screen {
  const keyboard = new InlineKeyboard();
  for (const r of reasons)
    keyboard.text(r.label, `${HANDOVER_CALLBACK.reviewCategory}${r.code}`).row();
  keyboard.text(t.handover.cancel, HANDOVER_CALLBACK.cancel);
  return { text: t.handover.reviewCategory, keyboard };
}

/* -------------------------------------------------------------------- */
/* Requests (spec 8)                                                      */
/* -------------------------------------------------------------------- */

export const REQUEST_CALLBACK = {
  menu: 'rq:menu',
  typePrefix: 'rq:t:',
  list: 'rq:list',
  assignmentPrefix: 'rq:a:',
  counterpartPrefix: 'rq:c:',
  counterpartAssignmentPrefix: 'rq:ca:',
  templatePrefix: 'rq:tpl:',
  reasonPrefix: 'rq:r:',
  skip: 'rq:skip',
  cancel: 'rq:cancel',
  correctionPrefix: 'rq:corr:',
} as const;

/** Types available from the bot (FR-SCH-05). Appeals start from the scores screen. */
export const BOT_REQUEST_TYPES: readonly RequestType[] = [
  'VACATION',
  'DAY_OFF',
  'SICK',
  'CANNOT_ATTEND',
  'LATE',
  'EARLY_LEAVE',
  'SWAP',
  'EXTRA_SHIFT',
  'TECH_ISSUE',
];

export function requestMenuScreen(t: Messages): Screen {
  const keyboard = new InlineKeyboard();
  BOT_REQUEST_TYPES.forEach((type, i) => {
    keyboard.text(t.requests.types[type], `${REQUEST_CALLBACK.typePrefix}${type}`);
    if (i % 2 === 1) keyboard.row();
  });
  if (BOT_REQUEST_TYPES.length % 2 === 1) keyboard.row();
  keyboard
    .text(t.requests.myRequests, REQUEST_CALLBACK.list)
    .row()
    .text(t.shift.backToShift, SHIFT_CALLBACK.back);
  return { text: t.requests.chooseType, keyboard };
}

export function requestListScreen(t: Messages, items: readonly RequestView[]): Screen {
  const lines =
    items.length === 0
      ? [t.requests.noRequests]
      : items.map((r) => {
          const when = r.periodFrom
            ? `${r.periodFrom.slice(8, 10)}.${r.periodFrom.slice(5, 7)}${r.periodTo && r.periodTo !== r.periodFrom ? `–${r.periodTo.slice(8, 10)}.${r.periodTo.slice(5, 7)}` : ''}`
            : r.assignmentDate
              ? `${r.assignmentDate.slice(8, 10)}.${r.assignmentDate.slice(5, 7)}`
              : '';
          const step = r.currentStepKey
            ? ` · ${format(t.requests.stepOf, { step: r.currentStep + 1, total: r.totalSteps })}`
            : '';
          return `• ${format(t.requests.line, { type: t.requests.types[r.type], status: t.requests.statuses[r.status] })}${when ? ` · ${when}` : ''}${step}`;
        });
  return {
    text: lines.join('\n'),
    keyboard: new InlineKeyboard().text(t.shift.backToShift, REQUEST_CALLBACK.menu),
  };
}

export function requestPromptScreen(t: Messages, text: string, withSkip = false): Screen {
  const keyboard = new InlineKeyboard();
  if (withSkip) keyboard.text(t.requests.skip, REQUEST_CALLBACK.skip).row();
  keyboard.text(t.requests.cancel, REQUEST_CALLBACK.cancel);
  return { text, keyboard };
}

export function requestAssignmentScreen(
  t: Messages,
  items: readonly { id: string; businessDate: string; templateCode: string }[],
  prefix: string,
  title: string,
): Screen {
  if (items.length === 0)
    return {
      text: t.requests.noShifts,
      keyboard: new InlineKeyboard().text(t.requests.cancel, REQUEST_CALLBACK.cancel),
    };
  const keyboard = new InlineKeyboard();
  for (const a of items) {
    const kind = a.templateCode === 'NIGHT' ? t.schedule.kindNames.NIGHT : t.schedule.kindNames.DAY;
    keyboard
      .text(
        `${a.businessDate.slice(8, 10)}.${a.businessDate.slice(5, 7)} · ${kind}`,
        `${prefix}${a.id}`,
      )
      .row();
  }
  keyboard.text(t.requests.cancel, REQUEST_CALLBACK.cancel);
  return { text: title, keyboard };
}

export function requestChoiceScreen(
  t: Messages,
  items: readonly { id: string; label: string }[],
  prefix: string,
  title: string,
): Screen {
  const keyboard = new InlineKeyboard();
  for (const i of items) keyboard.text(i.label, `${prefix}${i.id}`).row();
  keyboard.text(t.requests.cancel, REQUEST_CALLBACK.cancel);
  return { text: items.length === 0 ? t.requests.noShifts : title, keyboard };
}

export function counterpartScreen(t: Messages, pending: readonly RequestView[]): Screen {
  const keyboard = new InlineKeyboard();
  const lines: string[] = [];
  for (const r of pending) {
    lines.push(
      `${r.employeeName}: ${t.requests.types.SWAP}${r.assignmentDate ? ` · ${r.assignmentDate.slice(8, 10)}.${r.assignmentDate.slice(5, 7)}` : ''}${r.comment ? ` · ${r.comment}` : ''}`,
    );
    keyboard
      .text(t.requests.counterpartYes, `rq:ok:${r.id}`)
      .text(t.requests.counterpartNo, `rq:no:${r.id}`)
      .row();
  }
  keyboard.text(t.shift.backToShift, SHIFT_CALLBACK.back);
  return { text: [t.requests.counterpartAsk, '', ...lines].join('\n'), keyboard };
}

/* -------------------------------------------------------------------- */
/* Scores (spec 7.7)                                                      */
/* -------------------------------------------------------------------- */

export const BONUS_CALLBACK = {
  me: 'bn:me',
  detailPrefix: 'bn:d:',
  appealPrefix: 'bn:ap:',
  monthPrefix: 'bn:m:',
} as const;

/** "My scores": month coefficient and shifts with statuses; the basis of each reduction is a button away. */
export function myScoresScreen(t: Messages, view: MyScoresView): Screen {
  const [year, m] = view.month.split('-');
  const monthName = t.schedule.months[Number(m) - 1] ?? view.month;
  const lines = [format(t.bonus.header, { month: monthName, year: year ?? '' }), ''];
  if (view.scores.length === 0) lines.push(t.bonus.noScores);
  else {
    if (view.sMonth !== null) lines.push(format(t.bonus.monthLine, { score: view.sMonth }));
    if (
      view.scores.some(
        (s) => s.status === 'PENDING' || s.status === 'MANUAL_REVIEW' || s.status === 'APPEALED',
      )
    )
      lines.push(t.bonus.monthPending);
    lines.push('');
    for (const s of view.scores) {
      lines.push(
        format(t.bonus.shiftLine, {
          date: `${s.businessDate.slice(8, 10)}.${s.businessDate.slice(5, 7)}`,
          score:
            s.score === null
              ? s.status === 'NOT_EVALUATED'
                ? '—'
                : t.bonus.manualReview
              : String(s.score),
          status: t.bonus.statuses[s.status],
        }),
      );
    }
  }
  const keyboard = new InlineKeyboard();
  for (const s of view.scores.slice(0, 6)) {
    keyboard
      .text(
        `${t.bonus.detailsButton} ${s.businessDate.slice(8, 10)}.${s.businessDate.slice(5, 7)}`,
        `${BONUS_CALLBACK.detailPrefix}${s.id}`,
      )
      .row();
  }
  keyboard
    .text(t.schedule.prevMonth, `${BONUS_CALLBACK.monthPrefix}${addMonths(view.month, -1)}`)
    .text(t.schedule.nextMonth, `${BONUS_CALLBACK.monthPrefix}${addMonths(view.month, 1)}`)
    .row()
    .text(t.shift.backToShift, SHIFT_CALLBACK.back);
  return { text: lines.join('\n'), keyboard };
}

/** Shift breakdown: criterion, points, status and basis (spec 7.1: the employee sees the reason). */
export function scoreDetailScreen(
  t: Messages,
  score: ShiftScoreView,
  appealDays: number,
  canAppeal: boolean,
): Screen {
  const lines = [
    `${score.businessDate.slice(8, 10)}.${score.businessDate.slice(5, 7)} · ${score.score === null ? t.bonus.statuses[score.status] : `${score.score} / 100`} · ${t.bonus.statuses[score.status]}`,
    '',
  ];
  let section: string | null = null;
  for (const c of score.criteria) {
    if (c.section !== section) {
      section = c.section;
      lines.push(`— ${t.bonus.sections[c.section as keyof typeof t.bonus.sections] ?? c.section}`);
    }
    const mark =
      c.status === 'earned' || c.status === 'confirmed'
        ? '✅'
        : c.status === 'not_applicable'
          ? '➖'
          : c.status === 'pending' || c.status === 'appealed'
            ? '⏳'
            : '⚠️';
    const basis = c.basis.length > 0 ? ` (${c.basis.slice(0, 3).join(', ')})` : '';
    lines.push(
      `${mark} ${t.bonus.criteria[c.criterion]}: ${c.status === 'not_applicable' ? t.bonus.criterionStatuses.not_applicable : `${c.earnedPoints}/${c.maxPoints}`}${basis}`,
    );
  }
  if (score.excludedReason)
    lines.push('', `${t.bonus.statuses.NOT_EVALUATED}: ${score.excludedReason}`);
  if (canAppeal) lines.push('', format(t.bonus.appealHint, { days: appealDays }));
  const keyboard = new InlineKeyboard();
  if (canAppeal)
    keyboard
      .text(t.bonus.appealButton, `${BONUS_CALLBACK.appealPrefix}${score.shiftSessionId}`)
      .row();
  keyboard.text(t.shift.backToShift, BONUS_CALLBACK.me);
  return { text: lines.join('\n'), keyboard };
}
