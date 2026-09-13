import type { AssignmentInput, AssignmentView, ScheduleVersionView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { sameAssignment } from './grid';
import { recordedTime } from '../lib/labels';

/** An old acknowledgement cannot describe an edited or unpublished assignment. */
export function assignmentAcknowledgement(input: {
  assignment: AssignmentInput | undefined;
  recorded: readonly AssignmentView[];
  version: ScheduleVersionView | undefined;
  timezone: string;
}): string {
  const t = messages(currentLocale()).scheduleWorkspace;
  const saved =
    input.assignment &&
    input.recorded.find(
      (item) =>
        item.status === 'PLANNED' &&
        item.scheduleVersionId === input.version?.id &&
        input.assignment &&
        sameAssignment(item, input.assignment),
    );
  if (!saved || input.version?.status !== 'PUBLISHED') return t.acknowledgeAfterPublish;
  return saved.acknowledgedAt
    ? `${t.acknowledged} · ${recordedTime(saved.acknowledgedAt, input.timezone)}`
    : t.notAcknowledged;
}
