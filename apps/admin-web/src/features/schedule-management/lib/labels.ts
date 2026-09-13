import type { AssignmentView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';

/** Recorded instants are shown in the site timezone with a 24-hour clock. */
export function recordedTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat(currentLocale(), {
    timeZone: timezone,
    dateStyle: 'short',
    timeStyle: 'short',
    hourCycle: 'h23',
  }).format(new Date(value));
}

export function assignmentKindLabel(kind: AssignmentView['kind']) {
  const t = messages(currentLocale()).scheduleWorkspace;
  return {
    REGULAR: t.kindRegular,
    EXTRA: t.kindExtra,
    REPLACEMENT: t.kindReplacement,
    SWAP: t.kindSwap,
  }[kind];
}
