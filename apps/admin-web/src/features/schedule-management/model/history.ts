import type { AssignmentView, ScheduleHistoryEntry } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';

const t = messages(currentLocale()).scheduleWorkspace;
const admin = messages(currentLocale()).admin;
const actions = {
  CREATE: 'schedule.version.create',
  SAVE: 'schedule.assignments.replace',
  SUBMIT: 'schedule.version.submit',
  RETURN: 'schedule.version.return',
  PUBLISH: 'schedule.version.publish',
  REMIND: 'schedule.version.remind',
} as const;
export function historyTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat(currentLocale(), {
    timeZone: timezone,
    dateStyle: 'short',
    timeStyle: 'short',
    hourCycle: 'h23',
  }).format(new Date(value));
}
export function historyAssignmentStatus(status: AssignmentView['status']) {
  return { PLANNED: t.historyPlanned, CANCELLED: t.historyCancelled, REPLACED: t.historyReplaced }[
    status
  ];
}
export function historyDecision(entry: ScheduleHistoryEntry) {
  let detail: string | null = null;
  if (entry.action === 'SAVE')
    detail = format(t.historySave, { count: entry.assignmentCount ?? t.historyUnavailable });
  if (entry.action === 'REMIND')
    detail = format(t.historyRemind, {
      count: entry.reminded ?? t.historyUnavailable,
      pending: entry.pending ?? t.historyUnavailable,
    });
  if ('fromStatus' in entry)
    detail = `${entry.fromStatus ? admin.schedule.statuses[entry.fromStatus] : t.historyUnavailable} → ${entry.toStatus ? admin.schedule.statuses[entry.toStatus] : t.historyUnavailable}`;
  return {
    action: admin.audit.actions[actions[entry.action]],
    detail,
    actor:
      entry.actorLabel ??
      (entry.actorId
        ? `${admin.audit.actorTypes[entry.actorType]} · ${entry.actorId}`
        : admin.audit.actorTypes[entry.actorType]),
  };
}

export function historyAssignmentKind(kind: AssignmentView['kind']) {
  return {
    REGULAR: t.historyRegular,
    EXTRA: t.historyExtra,
    REPLACEMENT: t.historyReplacement,
    SWAP: t.historySwap,
  }[kind];
}
