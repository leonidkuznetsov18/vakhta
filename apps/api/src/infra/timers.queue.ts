import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUES, type AckReminderJob, type ShiftReminderJob } from '@vakhta/contracts';
import { TIMER_JOBS, ackReminderJobId, shiftReminderJobId } from '@vakhta/domain';
import type { Env } from '../config/env.js';

/** Порт для сервісів: у тестах підмінюється памʼяттю. */
export interface TimerScheduler {
  scheduleShiftReminder(assignmentId: string, fireAt: Date): Promise<void>;
  scheduleAckReminder(versionId: string, employeeId: string, fireAt: Date): Promise<void>;
  cancel(jobId: string): Promise<void>;
}

export const TIMER_SCHEDULER = Symbol('TIMER_SCHEDULER');

/**
 * Відкладені job-и BullMQ з детермінованими jobId (ADR-8). Воркер при спрацюванні перечитує
 * стан і виходить, якщо нагадування вже не актуальне; тому скасування є оптимізацією.
 */
@Injectable()
export class TimersQueue implements TimerScheduler, OnApplicationShutdown {
  private readonly connection: Redis;
  private readonly queue: Queue;

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    this.connection = new Redis(config.get('REDIS_URL', { infer: true }), {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue(QUEUES.timers, { connection: this.connection });
  }

  async scheduleShiftReminder(assignmentId: string, fireAt: Date): Promise<void> {
    const delay = fireAt.getTime() - Date.now();
    if (delay <= 0) return;
    const data: ShiftReminderJob = { assignmentId, fireAt: fireAt.toISOString() };
    await this.queue.add(TIMER_JOBS.shiftReminder, data, {
      jobId: shiftReminderJobId(assignmentId),
      delay,
      removeOnComplete: true,
      removeOnFail: 200,
    });
  }

  async scheduleAckReminder(versionId: string, employeeId: string, fireAt: Date): Promise<void> {
    const delay = fireAt.getTime() - Date.now();
    if (delay <= 0) return;
    const data: AckReminderJob = { versionId, employeeId, fireAt: fireAt.toISOString() };
    await this.queue.add(TIMER_JOBS.ackReminder, data, {
      jobId: ackReminderJobId(versionId, employeeId),
      delay,
      removeOnComplete: true,
      removeOnFail: 200,
    });
  }

  async cancel(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) await job.remove().catch(() => undefined);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}

/** Лише в тестах: памʼятає, що було заплановано. */
export class InMemoryTimerScheduler implements TimerScheduler {
  readonly scheduled: { jobId: string; fireAt: Date }[] = [];

  async scheduleShiftReminder(assignmentId: string, fireAt: Date): Promise<void> {
    this.scheduled.push({ jobId: shiftReminderJobId(assignmentId), fireAt });
  }

  async scheduleAckReminder(versionId: string, employeeId: string, fireAt: Date): Promise<void> {
    this.scheduled.push({ jobId: ackReminderJobId(versionId, employeeId), fireAt });
  }

  async cancel(jobId: string): Promise<void> {
    const i = this.scheduled.findIndex((s) => s.jobId === jobId);
    if (i >= 0) this.scheduled.splice(i, 1);
  }
}

@Global()
@Module({
  providers: [{ provide: TIMER_SCHEDULER, useClass: TimersQueue }],
  exports: [TIMER_SCHEDULER],
})
export class QueueModule {}
