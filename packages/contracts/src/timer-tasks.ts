import { z } from 'zod';
import {
  absenceCheckinJobId,
  absenceReturnJobId,
  ackReminderJobId,
  birthdayGreetingJobId,
  emergencyAckJobId,
  emergencyEscalationJobId,
  maintenanceReminderJobId,
  cleaningReminderJobId,
  downtimeEscalationJobId,
  handoverTimeoutJobId,
  incidentSlaJobId,
  returnReminderJobId,
  shiftReminderJobId,
} from '@vakhta/domain';
import {
  AbsenceCheckinJob,
  AbsenceReturnJob,
  AckReminderJob,
  BirthdayGreetingJob,
  CleaningReminderJob,
  DowntimeEscalationJob,
  EmergencyAckJob,
  EmergencyEscalationJob,
  HandoverTimeoutJob,
  MaintenanceReminderJob,
  IncidentSlaJob,
  ReturnReminderJob,
  ShiftReminderJob,
} from './queues.js';

/** Timer kinds of the maintenance module, referenced as constants in switches (rule C9). */
export const MaintenanceTimerKind = {
  MAINTENANCE_REMINDER: 'MAINTENANCE_REMINDER',
  EMERGENCY_ACK: 'EMERGENCY_ACK',
  EMERGENCY_ESCALATION: 'EMERGENCY_ESCALATION',
} as const;

/** Version one persists the original fire time and limit, independent of later configuration. */
export const TimerTask = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('SHIFT_REMINDER'), payload: ShiftReminderJob }),
  z.object({ kind: z.literal('ACK_REMINDER'), payload: AckReminderJob }),
  z.object({ kind: z.literal('RETURN_REMINDER'), payload: ReturnReminderJob }),
  z.object({ kind: z.literal('DOWNTIME_ESCALATION'), payload: DowntimeEscalationJob }),
  z.object({ kind: z.literal('CLEANING_REMINDER'), payload: CleaningReminderJob }),
  z.object({ kind: z.literal('INCIDENT_SLA'), payload: IncidentSlaJob }),
  z.object({ kind: z.literal('HANDOVER_TIMEOUT'), payload: HandoverTimeoutJob }),
  z.object({ kind: z.literal('BIRTHDAY_GREETING'), payload: BirthdayGreetingJob }),
  z.object({ kind: z.literal('ABSENCE_CHECKIN'), payload: AbsenceCheckinJob }),
  z.object({ kind: z.literal('ABSENCE_RETURN'), payload: AbsenceReturnJob }),
  z.object({
    kind: z.literal(MaintenanceTimerKind.MAINTENANCE_REMINDER),
    payload: MaintenanceReminderJob,
  }),
  z.object({ kind: z.literal(MaintenanceTimerKind.EMERGENCY_ACK), payload: EmergencyAckJob }),
  z.object({
    kind: z.literal(MaintenanceTimerKind.EMERGENCY_ESCALATION),
    payload: EmergencyEscalationJob,
  }),
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
    case 'BIRTHDAY_GREETING':
      return birthdayGreetingJobId(
        task.payload.employeeId,
        Number(task.payload.fireAt.slice(0, 4)),
      );
    case 'ABSENCE_CHECKIN':
      return absenceCheckinJobId(task.payload.requestId, task.payload.businessDate);
    case 'ABSENCE_RETURN':
      return absenceReturnJobId(task.payload.requestId);
    case MaintenanceTimerKind.MAINTENANCE_REMINDER:
      return maintenanceReminderJobId(
        task.payload.workOrderId,
        task.payload.plannedOn,
        task.payload.offsetDays,
      );
    case MaintenanceTimerKind.EMERGENCY_ACK:
      return emergencyAckJobId(task.payload.workOrderId);
    case MaintenanceTimerKind.EMERGENCY_ESCALATION:
      return emergencyEscalationJobId(task.payload.workOrderId);
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
