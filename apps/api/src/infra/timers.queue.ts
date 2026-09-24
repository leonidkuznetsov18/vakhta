import { Global, Injectable, Module, Logger } from '@nestjs/common';
import {
  MaintenanceTimerKind,
  timerTaskIntent,
  type DowntimeEscalationJob,
  type ReturnReminderJob,
  type TimerTask,
} from '@vakhta/contracts';
import { enqueueBackgroundTask, type Transaction } from '@vakhta/db';

export const TIMER_SCHEDULER = Symbol('TIMER_SCHEDULER');

/** Source-owned PostgreSQL admission. Stale tasks are harmless; never cancel under business locks. */
@Injectable()
export class TimerScheduler {
  private readonly logger = new Logger(TimerScheduler.name);

  private async enqueue(tx: Transaction, task: TimerTask): Promise<void> {
    const admitted = await enqueueBackgroundTask(tx, timerTaskIntent(task));
    this.logger.log({ event: 'task_intent_staged', taskId: admitted.id, kind: task.kind });
  }

  scheduleShiftReminder(tx: Transaction, assignmentId: string, fireAt: Date): Promise<void> {
    return this.enqueue(tx, {
      kind: 'SHIFT_REMINDER',
      payload: { assignmentId, fireAt: fireAt.toISOString() },
    });
  }
  scheduleReturnReminder(
    tx: Transaction,
    job: Omit<ReturnReminderJob, 'fireAt'>,
    fireAt: Date,
  ): Promise<void> {
    return this.enqueue(tx, {
      kind: 'RETURN_REMINDER',
      payload: { ...job, fireAt: fireAt.toISOString() },
    });
  }
  scheduleDowntimeEscalation(
    tx: Transaction,
    job: Omit<DowntimeEscalationJob, 'fireAt'>,
    fireAt: Date,
  ): Promise<void> {
    return this.enqueue(tx, {
      kind: 'DOWNTIME_ESCALATION',
      payload: { ...job, fireAt: fireAt.toISOString() },
    });
  }
  scheduleMaintenanceReminder(
    tx: Transaction,
    job: { workOrderId: string; plannedOn: string; offsetDays: number },
    fireAt: Date,
  ): Promise<void> {
    return this.enqueue(tx, {
      kind: MaintenanceTimerKind.MAINTENANCE_REMINDER,
      payload: { ...job, fireAt: fireAt.toISOString() },
    });
  }
  scheduleEmergencyAck(tx: Transaction, workOrderId: string, fireAt: Date): Promise<void> {
    return this.enqueue(tx, {
      kind: MaintenanceTimerKind.EMERGENCY_ACK,
      payload: { workOrderId, fireAt: fireAt.toISOString() },
    });
  }
  scheduleEmergencyEscalation(tx: Transaction, workOrderId: string, fireAt: Date): Promise<void> {
    return this.enqueue(tx, {
      kind: MaintenanceTimerKind.EMERGENCY_ESCALATION,
      payload: { workOrderId, fireAt: fireAt.toISOString() },
    });
  }
  scheduleIncidentSla(tx: Transaction, incidentId: string, fireAt: Date): Promise<void> {
    return this.enqueue(tx, {
      kind: 'INCIDENT_SLA',
      payload: { incidentId, fireAt: fireAt.toISOString() },
    });
  }
  scheduleCleaningReminder(tx: Transaction, sessionId: string, fireAt: Date): Promise<void> {
    return this.enqueue(tx, {
      kind: 'CLEANING_REMINDER',
      payload: { sessionId, fireAt: fireAt.toISOString() },
    });
  }
  scheduleBirthdayGreeting(tx: Transaction, employeeId: string, fireAt: Date): Promise<void> {
    return this.enqueue(tx, {
      kind: 'BIRTHDAY_GREETING',
      payload: { employeeId, fireAt: fireAt.toISOString() },
    });
  }
  scheduleAbsenceCheckin(
    tx: Transaction,
    requestId: string,
    businessDate: string,
    fireAt: Date,
  ): Promise<void> {
    return this.enqueue(tx, {
      kind: 'ABSENCE_CHECKIN',
      payload: { requestId, businessDate, fireAt: fireAt.toISOString() },
    });
  }
  scheduleAbsenceReturn(tx: Transaction, requestId: string, fireAt: Date): Promise<void> {
    return this.enqueue(tx, {
      kind: 'ABSENCE_RETURN',
      payload: { requestId, fireAt: fireAt.toISOString() },
    });
  }
}

@Global()
@Module({
  providers: [{ provide: TIMER_SCHEDULER, useClass: TimerScheduler }],
  exports: [TIMER_SCHEDULER],
})
export class QueueModule {}
