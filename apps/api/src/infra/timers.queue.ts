import { Global, Injectable, Module } from '@nestjs/common';
import {
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
  private async enqueue(tx: Transaction, task: TimerTask): Promise<void> {
    await enqueueBackgroundTask(tx, timerTaskIntent(task));
  }

  scheduleShiftReminder(tx: Transaction, assignmentId: string, fireAt: Date): Promise<void> {
    return this.enqueue(tx, {
      kind: 'SHIFT_REMINDER',
      payload: { assignmentId, fireAt: fireAt.toISOString() },
    });
  }
  scheduleAckReminder(
    tx: Transaction,
    versionId: string,
    employeeId: string,
    fireAt: Date,
  ): Promise<void> {
    return this.enqueue(tx, {
      kind: 'ACK_REMINDER',
      payload: { versionId, employeeId, fireAt: fireAt.toISOString() },
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
}

@Global()
@Module({
  providers: [{ provide: TIMER_SCHEDULER, useClass: TimerScheduler }],
  exports: [TIMER_SCHEDULER],
})
export class QueueModule {}
