import {
  MaintenanceCallbackAction,
  MaterialMode,
  WorkType,
  maintenanceCallback,
  type NotificationButton,
  type MaintenanceNoticeData,
  type NotificationPayload,
} from '@vakhta/domain';
import { format } from './format.js';
import type { Messages } from './messages.js';

export const MaintenanceNoticeKind = {
  REMINDER: 'REMINDER',
  ASSIGNED: 'ASSIGNED',
  REPLANNED: 'REPLANNED',
} as const;
export type MaintenanceNoticeKind =
  (typeof MaintenanceNoticeKind)[keyof typeof MaintenanceNoticeKind];

function machine(t: Messages, data: MaintenanceNoticeData): string {
  return format(t.maintenance.bot.machine, { code: data.equipmentCode, name: data.equipmentName });
}

function heading(t: Messages, kind: MaintenanceNoticeKind, offsetDays: number): string {
  const bot = t.maintenance.bot;
  if (kind === MaintenanceNoticeKind.ASSIGNED) return bot.assignedTitle;
  if (kind === MaintenanceNoticeKind.REPLANNED) return bot.replannedTitle;
  if (offsetDays === 1) return bot.reminderTomorrow;
  return format(bot.reminderTitle, { days: offsetDays });
}

function operationLines(t: Messages, data: MaintenanceNoticeData): string[] {
  if (!data.operations.length) return [];
  const lines = data.operations.map(
    (operation, index) =>
      `${index + 1}. ${operation.text}${operation.photoRequired ? t.maintenance.bot.photoMark : ''}`,
  );
  return [
    '',
    format(t.maintenance.bot.operationsTitle, { count: data.operations.length }),
    ...lines,
  ];
}

function materialLines(t: Messages, data: MaintenanceNoticeData): string[] {
  if (!data.materials.length) return [];
  const bot = t.maintenance.bot;
  const lines = data.materials.map(
    (material) =>
      format(bot.materialLine, material) +
      (material.mode === MaterialMode.IF_NEEDED ? bot.ifNeeded : ''),
  );
  return ['', bot.materialsTitle, ...lines];
}

function effortLine(t: Messages, data: MaintenanceNoticeData): string[] {
  const bot = t.maintenance.bot;
  const parts: string[] = [];
  if (data.estimatedMinutes) parts.push(format(bot.duration, { minutes: data.estimatedMinutes }));
  if (data.requiresStop !== null) parts.push(data.requiresStop ? bot.needsStop : bot.noStop);
  return parts.length ? [parts.join(' · ')] : [];
}

/** Buttons under a maintenance notice: open, manual, readiness answers (AC-026). */
export function maintenanceButtons(
  t: Messages,
  data: Pick<MaintenanceNoticeData, 'workOrderId' | 'hasDocument'>,
): NotificationButton[][] {
  const bot = t.maintenance.bot;
  const id = data.workOrderId;
  const first: NotificationButton[] = [
    { text: bot.open, callbackData: maintenanceCallback(MaintenanceCallbackAction.OPEN, id) },
  ];
  if (data.hasDocument)
    first.push({
      text: bot.manual,
      callbackData: maintenanceCallback(MaintenanceCallbackAction.MANUAL, id),
    });
  return [
    first,
    [
      { text: bot.ready, callbackData: maintenanceCallback(MaintenanceCallbackAction.READY, id) },
      {
        text: bot.missing,
        callbackData: maintenanceCallback(MaintenanceCallbackAction.MISSING, id),
      },
    ],
  ];
}

export interface MaintenanceNoticeOptions {
  readonly kind: MaintenanceNoticeKind;
  readonly offsetDays?: number;
  /** A copy for the backup mechanic names the absent responsible one (AC-032). */
  readonly absentMechanic?: string | null;
}

/** Reminder, new-maintenance and date-change notice to the mechanic (FR-044). */
export function maintenanceNotice(
  t: Messages,
  data: MaintenanceNoticeData,
  options: MaintenanceNoticeOptions,
): NotificationPayload {
  const bot = t.maintenance.bot;
  const lines = [
    heading(t, options.kind, options.offsetDays ?? 0),
    ...(options.absentMechanic ? [format(bot.absentCopy, { name: options.absentMechanic })] : []),
    machine(t, data),
    data.location,
    '',
    format(bot.planLine, { title: data.title, date: data.plannedOn ?? '' }),
    ...effortLine(t, data),
    ...operationLines(t, data),
    ...materialLines(t, data),
    ...(data.source ? ['', format(bot.source, { source: data.source })] : []),
  ];
  return { text: lines.join('\n'), buttons: maintenanceButtons(t, data) };
}

export const EmergencyNoticeKind = {
  ASSIGNED: 'ASSIGNED',
  MASTER_COPY: 'MASTER_COPY',
  ESCALATION: 'ESCALATION',
} as const;
export type EmergencyNoticeKind = (typeof EmergencyNoticeKind)[keyof typeof EmergencyNoticeKind];

function reportLines(t: Messages, data: MaintenanceNoticeData): string[] {
  if (!data.description) return [];
  const by = data.reporterName
    ? [
        format(t.maintenance.bot.reportedBy, {
          name: data.reporterName,
          time: data.reportedAtLocal ?? '',
        }),
      ]
    : [];
  return ['', `«${data.description}»`, ...by];
}

function emergencyHeading(t: Messages, data: MaintenanceNoticeData, kind: EmergencyNoticeKind) {
  const bot = t.maintenance.bot;
  if (kind === EmergencyNoticeKind.MASTER_COPY)
    return format(bot.masterCopy, { machine: machine(t, data) });
  if (kind === EmergencyNoticeKind.ESCALATION)
    return format(bot.escalation, { number: data.number });
  return format(bot.emergencyTitle, {
    number: data.number,
    priority: t.maintenance.priority[data.priority],
  });
}

/** Emergency repair to the mechanic, a copy to the master, or an escalation (FR-061, FR-063). */
export function emergencyNotice(
  t: Messages,
  data: MaintenanceNoticeData,
  kind: EmergencyNoticeKind,
): NotificationPayload {
  const bot = t.maintenance.bot;
  const lines = [
    emergencyHeading(t, data, kind),
    `${machine(t, data)} ${bot.stoppedMark}`,
    data.location,
    ...reportLines(t, data),
    ...(data.ackDueLocal ? ['', format(bot.acceptBy, { time: data.ackDueLocal })] : []),
  ];
  const id = data.workOrderId;
  const buttons: NotificationButton[][] = [
    [
      { text: bot.accept, callbackData: maintenanceCallback(MaintenanceCallbackAction.ACCEPT, id) },
      {
        text: bot.decline,
        callbackData: maintenanceCallback(MaintenanceCallbackAction.DECLINE, id),
      },
    ],
  ];
  return kind === EmergencyNoticeKind.MASTER_COPY
    ? { text: lines.join('\n') }
    : { text: lines.join('\n'), buttons };
}

/** Whether a notice is about a repair, so the caller picks the right template. */
export function isRepair(data: Pick<MaintenanceNoticeData, 'type'>): boolean {
  return data.type === WorkType.EMERGENCY_REPAIR;
}
