import { z } from 'zod';
import {
  ackReminderJobId,
  cleaningReminderJobId,
  downtimeEscalationJobId,
  handoverTimeoutJobId,
  incidentSlaJobId,
  returnReminderJobId,
  shiftReminderJobId,
} from '@vakhta/domain';
import {
  AckReminderJob,
  CleaningReminderJob,
  DowntimeEscalationJob,
  HandoverTimeoutJob,
  IncidentSlaJob,
  ReturnReminderJob,
  ShiftReminderJob,
} from './queues.js';

/** Version one persists the original fire time and limit, independent of later configuration. */
export const TimerTask = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('SHIFT_REMINDER'), payload: ShiftReminderJob }),
  z.object({ kind: z.literal('ACK_REMINDER'), payload: AckReminderJob }),
  z.object({ kind: z.literal('RETURN_REMINDER'), payload: ReturnReminderJob }),
  z.object({ kind: z.literal('DOWNTIME_ESCALATION'), payload: DowntimeEscalationJob }),
  z.object({ kind: z.literal('CLEANING_REMINDER'), payload: CleaningReminderJob }),
  z.object({ kind: z.literal('INCIDENT_SLA'), payload: IncidentSlaJob }),
  z.object({ kind: z.literal('HANDOVER_TIMEOUT'), payload: HandoverTimeoutJob }),
]);
export type TimerTask = z.infer<typeof TimerTask>;

export function timerTaskKey(task: TimerTask): string {
  switch (task.kind) {
    case 'SHIFT_REMINDER':
      return shiftReminderJobId(task.payload.assignmentId);
    case 'ACK_REMINDER':
      return ackReminderJobId(task.payload.versionId, task.payload.employeeId);
    case 'RETURN_REMINDER':
      return returnReminderJobId(task.payload.sessionId, task.payload.intervalId);
    case 'DOWNTIME_ESCALATION':
      return downtimeEscalationJobId(task.payload.sessionId, task.payload.intervalId);
    case 'CLEANING_REMINDER':
      return cleaningReminderJobId(task.payload.sessionId);
    case 'INCIDENT_SLA':
      return incidentSlaJobId(task.payload.incidentId);
    case 'HANDOVER_TIMEOUT':
      return handoverTimeoutJobId(task.payload.handoverId);
  }
}

export function timerTaskIntent(input: TimerTask) {
  const task = TimerTask.parse(input);
  return {
    kind: task.kind,
    payloadVersion: 1,
    dedupeKey: timerTaskKey(task),
    payload: task.payload,
    dueAt: new Date(task.payload.fireAt),
  };
}
