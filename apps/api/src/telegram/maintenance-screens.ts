import { InlineKeyboard } from 'grammy';
import {
  AnswerCode,
  MaintenanceCallbackAction,
  MaterialsReadiness,
  OperationResult,
  WAIT_REASONS,
  WorkStatus,
  WorkType,
  maintenanceCallback,
} from '@vakhta/domain';
import { format, type Messages } from '@vakhta/i18n';
import type { MechanicCard, MechanicWorkRow } from '../maintenance/mechanic-work.service.js';
import type { Screen } from './screens.js';

/** The mechanic's screens in Telegram (spec 014, US5, US7): list, work card, operation, pause. */

const RESULT_MARK: Readonly<Record<OperationResult, string>> = {
  DONE: '✅',
  NOT_DONE: '❌',
  NOT_APPLICABLE: '➖',
};
const OPEN_MARK = '▫️';

const ANSWER_RESULT: ReadonlyMap<string, OperationResult> = new Map<AnswerCode, OperationResult>([
  [AnswerCode.DONE, OperationResult.DONE],
  [AnswerCode.NOT_DONE, OperationResult.NOT_DONE],
  [AnswerCode.NOT_APPLICABLE, OperationResult.NOT_APPLICABLE],
]);

/** "3.n" → operation 3, "not done"; null for anything else. */
export function parseAnswerArg(
  arg: string | null,
): { ordinal: number; result: OperationResult } | null {
  const [ordinalText, code] = (arg ?? '').split('.');
  const ordinal = Number(ordinalText);
  if (!Number.isInteger(ordinal) || ordinal < 1) return null;
  const result = ANSWER_RESULT.get(code ?? '');
  if (!result) return null;
  return { ordinal, result };
}

function callback(action: MaintenanceCallbackAction, id?: string, arg?: string): string {
  return maintenanceCallback(action, id, arg);
}

/** Adds the "My work" entry to a home or shift screen of a maintenance employee. */
export function withMaintenanceEntry(t: Messages, screen: Screen): Screen {
  const keyboard = screen.keyboard ?? new InlineKeyboard();
  keyboard.row().text(t.maintenance.bot.menu, callback(MaintenanceCallbackAction.LIST));
  return { ...screen, keyboard };
}

function rowLabel(t: Messages, row: MechanicWorkRow): string {
  const mark = row.type === WorkType.EMERGENCY_REPAIR ? '🚨' : '🔧';
  const date = row.plannedOn ? ` · ${row.plannedOn.split('-').reverse().join('.')}` : '';
  return `${mark} #${row.number} ${row.code}${date} · ${t.maintenance.workStatus[row.status]}`;
}

export function myWorkScreen(t: Messages, rows: readonly MechanicWorkRow[]): Screen {
  const bot = t.maintenance.bot;
  if (!rows.length) return { text: `${bot.myWorkTitle}\n\n${bot.myWorkEmpty}` };
  const keyboard = new InlineKeyboard();
  for (const row of rows)
    keyboard.text(rowLabel(t, row), callback(MaintenanceCallbackAction.OPEN, row.id)).row();
  const lines = rows.map((row) => `#${row.number} ${row.code} — ${row.title}`);
  return { text: [bot.myWorkTitle, '', ...lines].join('\n'), keyboard };
}

/** The operation the mechanic answers next: the first unanswered one, then the first "not done". */
export function currentOperation(card: MechanicCard): number | null {
  const operations = card.notice.data.operations;
  const ordinals = operations.map((_operation, index) => index + 1);
  const unanswered = ordinals.find((ordinal) => !card.answers.has(ordinal));
  if (unanswered) return unanswered;
  const notDone = ordinals.find(
    (ordinal) => card.answers.get(ordinal) === OperationResult.NOT_DONE,
  );
  return notDone ?? null;
}

function operationLines(t: Messages, card: MechanicCard): string[] {
  const operations = card.notice.data.operations;
  if (!operations.length) return [];
  const lines = operations.map((operation, index) => {
    const answer = card.answers.get(index + 1);
    const mark = answer ? RESULT_MARK[answer] : OPEN_MARK;
    const photo = operation.photoRequired ? t.maintenance.bot.photoMark : '';
    return `${mark} ${index + 1}. ${operation.text}${photo}`;
  });
  const title = format(t.maintenance.bot.operationsTitle, { count: operations.length });
  return ['', title, ...lines];
}

function materialLines(t: Messages, card: MechanicCard): string[] {
  const materials = card.notice.data.materials;
  if (!materials.length) return [];
  const bot = t.maintenance.bot;
  return [
    '',
    bot.materialsTitle,
    ...materials.map((material) => format(bot.materialLine, material)),
  ];
}

function headLines(t: Messages, card: MechanicCard): string[] {
  const { data, status } = card.notice;
  const bot = t.maintenance.bot;
  const lines = [
    format(bot.cardHeader, { kind: t.maintenance.workType[data.type], number: data.number }),
    format(bot.machine, { code: data.equipmentCode, name: data.equipmentName }),
    data.location,
  ];
  if (data.plannedOn) lines.push(format(bot.planLine, { title: data.title, date: data.plannedOn }));
  if (data.description) lines.push(`«${data.description}»`);
  lines.push(format(bot.statusLine, { status: t.maintenance.workStatus[status] }));
  if (card.waitingFor)
    lines.push(format(bot.paused, { reason: t.maintenance.waitReason[card.waitingFor] }));
  return lines;
}

function plannedActions(t: Messages, card: MechanicCard, keyboard: InlineKeyboard): void {
  const bot = t.maintenance.bot;
  const id = card.notice.data.workOrderId;
  const status = card.notice.status;
  if (status === WorkStatus.ASSIGNED) {
    keyboard.text(bot.start, callback(MaintenanceCallbackAction.START, id)).row();
    if (card.readiness !== MaterialsReadiness.UNKNOWN) return;
    keyboard
      .text(bot.ready, callback(MaintenanceCallbackAction.READY, id))
      .text(bot.missing, callback(MaintenanceCallbackAction.MISSING, id))
      .row();
    return;
  }
  if (status !== WorkStatus.IN_PROGRESS) return;
  const ordinal = currentOperation(card);
  if (ordinal === null) keyboard.text(bot.submit, callback(MaintenanceCallbackAction.SUBMIT, id));
  else answerButtons(t, { keyboard, id, ordinal });
  keyboard.row().text(bot.pause, callback(MaintenanceCallbackAction.PAUSE, id)).row();
}

function answerButtons(
  t: Messages,
  input: { keyboard: InlineKeyboard; id: string; ordinal: number },
): void {
  const bot = t.maintenance.bot;
  const answer = (code: AnswerCode) =>
    callback(MaintenanceCallbackAction.ANSWER, input.id, `${input.ordinal}.${code}`);
  input.keyboard
    .text(bot.done, answer(AnswerCode.DONE))
    .row()
    .text(bot.notDone, answer(AnswerCode.NOT_DONE))
    .text(bot.notApplicable, answer(AnswerCode.NOT_APPLICABLE));
}

function repairActions(t: Messages, card: MechanicCard, keyboard: InlineKeyboard): void {
  const bot = t.maintenance.bot;
  const id = card.notice.data.workOrderId;
  const status = card.notice.status;
  if (status === WorkStatus.ASSIGNED && !card.notice.acceptedAt) {
    keyboard
      .text(bot.accept, callback(MaintenanceCallbackAction.ACCEPT, id))
      .text(bot.decline, callback(MaintenanceCallbackAction.DECLINE, id))
      .row();
    return;
  }
  if (status === WorkStatus.ASSIGNED)
    keyboard.text(bot.start, callback(MaintenanceCallbackAction.START, id)).row();
  if (status !== WorkStatus.IN_PROGRESS) return;
  keyboard
    .text(bot.finish, callback(MaintenanceCallbackAction.FINISH, id))
    .text(bot.pause, callback(MaintenanceCallbackAction.PAUSE, id))
    .row();
}

function currentOperationLines(t: Messages, card: MechanicCard): string[] {
  if (card.notice.status !== WorkStatus.IN_PROGRESS) return [];
  const ordinal = currentOperation(card);
  const operations = card.notice.data.operations;
  if (ordinal === null) return operations.length ? ['', t.maintenance.bot.allAnswered] : [];
  const operation = operations[ordinal - 1];
  if (!operation) return [];
  const header = format(t.maintenance.bot.operationHeader, {
    n: ordinal,
    total: operations.length,
  });
  const photo = operation.photoRequired ? t.maintenance.bot.photoMark : '';
  return ['', header, `${operation.text}${photo}`];
}

/** The work card with the buttons its state allows; no button ever releases a machine. */
export function workCardScreen(t: Messages, card: MechanicCard): Screen {
  const bot = t.maintenance.bot;
  const id = card.notice.data.workOrderId;
  const keyboard = new InlineKeyboard();
  if (card.notice.type === WorkType.EMERGENCY_REPAIR) repairActions(t, card, keyboard);
  else plannedActions(t, card, keyboard);
  if (card.notice.status === WorkStatus.WAITING)
    keyboard.text(bot.resume, callback(MaintenanceCallbackAction.RESUME, id)).row();
  if (card.notice.data.hasDocument)
    keyboard.text(bot.manual, callback(MaintenanceCallbackAction.MANUAL, id));
  keyboard.text(bot.back, callback(MaintenanceCallbackAction.LIST));
  const lines = [
    ...headLines(t, card),
    ...operationLines(t, card),
    ...materialLines(t, card),
    ...currentOperationLines(t, card),
  ];
  return { text: lines.join('\n'), keyboard };
}

/**
 * The "what is missing" checklist (FR-044): the selection travels in the button data as a base-36
 * bit mask, so a toggle is stateless and a repeated press has no second effect. 30 bits keep the
 * value within JavaScript's 32-bit operators and the callback's 12-character argument.
 */
export const MISSING_CHECKLIST_LIMIT = 30;
const MASK_RADIX = 36;

export const MissingStep = { OPEN: 'OPEN', TOGGLE: 'm', SEND: 's', WRITE: 'w' } as const;
export type MissingStep = (typeof MissingStep)[keyof typeof MissingStep];
const MISSING_STEPS = new Set<string>([MissingStep.TOGGLE, MissingStep.SEND, MissingStep.WRITE]);

export interface MissingPress {
  readonly step: MissingStep;
  readonly mask: number;
}

function isMissingStep(value: string): value is MissingStep {
  return MISSING_STEPS.has(value);
}

/** "m1c" → toggle to mask 0x48; no argument opens the empty checklist; null when malformed. */
export function parseMissingArg(arg: string | null): MissingPress | null {
  if (arg === null) return { step: MissingStep.OPEN, mask: 0 };
  const step = arg.slice(0, 1);
  const mask = Number.parseInt(arg.slice(1) || '0', MASK_RADIX);
  if (!isMissingStep(step) || !Number.isInteger(mask) || mask < 0) return null;
  if (mask >= 2 ** MISSING_CHECKLIST_LIMIT) return null;
  return { step, mask };
}

function missingArg(step: MissingStep, mask: number): string {
  return `${step}${mask.toString(MASK_RADIX)}`;
}

function isSelected(mask: number, index: number): boolean {
  return (mask & (1 << index)) !== 0;
}

/** Whether the plan's materials fit the checklist; otherwise the mechanic writes what is missing. */
export function hasMissingChecklist(card: MechanicCard): boolean {
  const count = card.notice.data.materials.length;
  return count > 0 && count <= MISSING_CHECKLIST_LIMIT;
}

export function missingScreen(t: Messages, card: MechanicCard, mask: number): Screen {
  const bot = t.maintenance.bot;
  const id = card.notice.data.workOrderId;
  const keyboard = new InlineKeyboard();
  card.notice.data.materials.forEach((material, index) => {
    const selected = isSelected(mask, index);
    const label = format(bot.checklistItem, {
      mark: selected ? '☑️' : '⬜',
      name: material.name,
      quantity: material.quantity,
      unit: material.unit,
    });
    const toggled = mask ^ (1 << index);
    keyboard
      .text(
        label,
        callback(MaintenanceCallbackAction.MISSING, id, missingArg(MissingStep.TOGGLE, toggled)),
      )
      .row();
  });
  keyboard
    .text(
      bot.missingSend,
      callback(MaintenanceCallbackAction.MISSING, id, missingArg(MissingStep.SEND, mask)),
    )
    .row()
    .text(
      bot.missingWrite,
      callback(MaintenanceCallbackAction.MISSING, id, missingArg(MissingStep.WRITE, mask)),
    )
    .row()
    .text(bot.back, callback(MaintenanceCallbackAction.OPEN, id));
  return { text: bot.missingChecklistTitle, keyboard };
}

/** The note the master reads: the checked materials, then what the mechanic wrote. */
export function missingNote(card: MechanicCard, mask: number, text: string | null): string {
  const checked = card.notice.data.materials
    .filter((_material, index) => isSelected(mask, index))
    .map((material) => `${material.name} ${material.quantity} ${material.unit}`);
  return [...checked, ...(text ? [text] : [])].join('; ');
}

/** Submission arguments of planned maintenance with materials (FR-051). */
export const UsedArg = { AS_PLANNED: 'p', OTHER: 'w' } as const;

/** Before "submit", the mechanic confirms the materials used: as in the plan or in their words. */
export function materialsUsedScreen(t: Messages, card: MechanicCard): Screen {
  const bot = t.maintenance.bot;
  const id = card.notice.data.workOrderId;
  const keyboard = new InlineKeyboard()
    .text(bot.usedAsPlanned, callback(MaintenanceCallbackAction.SUBMIT, id, UsedArg.AS_PLANNED))
    .row()
    .text(bot.usedOther, callback(MaintenanceCallbackAction.SUBMIT, id, UsedArg.OTHER))
    .row()
    .text(bot.back, callback(MaintenanceCallbackAction.OPEN, id));
  const lines = [bot.usedTitle, ...materialLines(t, card)];
  return { text: lines.join('\n'), keyboard };
}

/** Why the work pauses; the reason travels as its index in WAIT_REASONS. */
export function pauseScreen(t: Messages, workOrderId: string): Screen {
  const keyboard = new InlineKeyboard();
  WAIT_REASONS.forEach((reason, index) => {
    const data = callback(MaintenanceCallbackAction.PAUSE, workOrderId, String(index));
    keyboard.text(t.maintenance.waitReason[reason], data).row();
  });
  keyboard.text(t.maintenance.bot.back, callback(MaintenanceCallbackAction.OPEN, workOrderId));
  return { text: t.maintenance.bot.waitPrompt, keyboard };
}

/** Callback data of the incident flow's machine step (FR-060). */
export const EQUIPMENT_PICK_PREFIX = 'inc:eq:';
export const EQUIPMENT_PICK_NONE = 'none';

/** "Which equipment?" after the reason; the machine travels as its index in the stored choices. */
export function equipmentPickScreen(
  t: Messages,
  input: {
    readonly machines: readonly { id: string; code: string; name: string }[];
    readonly cancel: { readonly text: string; readonly data: string };
  },
): Screen {
  const bot = t.maintenance.bot;
  const keyboard = new InlineKeyboard();
  input.machines.forEach((machine, index) => {
    keyboard.text(format(bot.machine, machine), `${EQUIPMENT_PICK_PREFIX}${index}`).row();
  });
  keyboard
    .text(bot.unknownEquipment, `${EQUIPMENT_PICK_PREFIX}${EQUIPMENT_PICK_NONE}`)
    .row()
    .text(input.cancel.text, input.cancel.data);
  return { text: bot.pickEquipment, keyboard };
}
