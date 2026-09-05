import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import {
  QUEUES,
  type AckReminderJob,
  type CleaningReminderJob,
  type HandoverTimeoutJob,
  type MediaJob,
  type DowntimeEscalationJob,
  type IncidentSlaJob,
  type ReturnReminderJob,
  type ShiftReminderJob,
} from '@vakhta/contracts';
import {
  TIMER_JOBS,
  ackReminderJobId,
  cleaningReminderJobId,
  downtimeEscalationJobId,
  handoverTimeoutJobId,
  incidentSlaJobId,
  returnReminderJobId,
  shiftReminderJobId,
} from '@vakhta/domain';
import type { Env } from '../config/env.js';

/** Порт для сервісів: у тестах підмінюється памʼяттю. */
export interface TimerScheduler {
  scheduleShiftReminder(assignmentId: string, fireAt: Date): Promise<void>;
  scheduleAckReminder(versionId: string, employeeId: string, fireAt: Date): Promise<void>;
  scheduleReturnReminder(job: Omit<ReturnReminderJob, 'fireAt'>, fireAt: Date): Promise<void>;
  scheduleDowntimeEscalation(
    job: Omit<DowntimeEscalationJob, 'fireAt'>,
    fireAt: Date,
  ): Promise<void>;
  scheduleIncidentSla(incidentId: string, fireAt: Date): Promise<void>;
  scheduleHandoverTimeout(handoverId: string, fireAt: Date): Promise<void>;
  scheduleCleaningReminder(sessionId: string, fireAt: Date): Promise<void>;
  /** Черга media: перенесення фото у сховище і перевірка (ADR-0006). */
  enqueueMedia(mediaObjectId: string): Promise<void>;
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
  private readonly media: Queue;

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    this.connection = new Redis(config.get('REDIS_URL', { infer: true }), {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue(QUEUES.timers, { connection: this.connection });
    this.media = new Queue(QUEUES.media, { connection: this.connection });
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

  async scheduleReturnReminder(
    job: Omit<ReturnReminderJob, 'fireAt'>,
    fireAt: Date,
  ): Promise<void> {
    const delay = fireAt.getTime() - Date.now();
    const data: ReturnReminderJob = { ...job, fireAt: fireAt.toISOString() };
    await this.queue.add(TIMER_JOBS.returnReminder, data, {
      jobId: returnReminderJobId(job.sessionId, job.intervalId),
      delay: Math.max(0, delay),
      removeOnComplete: true,
      removeOnFail: 200,
    });
  }

  async scheduleDowntimeEscalation(
    job: Omit<DowntimeEscalationJob, 'fireAt'>,
    fireAt: Date,
  ): Promise<void> {
    const delay = fireAt.getTime() - Date.now();
    const data: DowntimeEscalationJob = { ...job, fireAt: fireAt.toISOString() };
    await this.queue.add(TIMER_JOBS.downtimeEscalation, data, {
      jobId: downtimeEscalationJobId(job.sessionId, job.intervalId),
      delay: Math.max(0, delay),
      removeOnComplete: true,
      removeOnFail: 200,
    });
  }

  async scheduleIncidentSla(incidentId: string, fireAt: Date): Promise<void> {
    const data: IncidentSlaJob = { incidentId, fireAt: fireAt.toISOString() };
    await this.queue.add(TIMER_JOBS.incidentSla, data, {
      jobId: incidentSlaJobId(incidentId),
      delay: Math.max(0, fireAt.getTime() - Date.now()),
      removeOnComplete: true,
      removeOnFail: 200,
    });
  }

  async scheduleHandoverTimeout(handoverId: string, fireAt: Date): Promise<void> {
    const data: HandoverTimeoutJob = { handoverId, fireAt: fireAt.toISOString() };
    await this.queue.add(TIMER_JOBS.handoverTimeout, data, {
      jobId: handoverTimeoutJobId(handoverId),
      delay: Math.max(0, fireAt.getTime() - Date.now()),
      removeOnComplete: true,
      removeOnFail: 200,
    });
  }

  async scheduleCleaningReminder(sessionId: string, fireAt: Date): Promise<void> {
    const delay = fireAt.getTime() - Date.now();
    if (delay <= 0) return;
    const data: CleaningReminderJob = { sessionId, fireAt: fireAt.toISOString() };
    await this.queue.add(TIMER_JOBS.cleaningReminder, data, {
      jobId: cleaningReminderJobId(sessionId),
      delay,
      removeOnComplete: true,
      removeOnFail: 200,
    });
  }

  async enqueueMedia(mediaObjectId: string): Promise<void> {
    const data: MediaJob = { mediaObjectId };
    await this.media.add('process', data, {
      jobId: `media.${mediaObjectId}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: 500,
    });
  }

  async cancel(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) await job.remove().catch(() => undefined);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
    await this.media.close();
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

  async scheduleReturnReminder(
    job: Omit<ReturnReminderJob, 'fireAt'>,
    fireAt: Date,
  ): Promise<void> {
    this.scheduled.push({ jobId: returnReminderJobId(job.sessionId, job.intervalId), fireAt });
  }

  async scheduleDowntimeEscalation(
    job: Omit<DowntimeEscalationJob, 'fireAt'>,
    fireAt: Date,
  ): Promise<void> {
    this.scheduled.push({ jobId: downtimeEscalationJobId(job.sessionId, job.intervalId), fireAt });
  }

  async scheduleIncidentSla(incidentId: string, fireAt: Date): Promise<void> {
    this.scheduled.push({ jobId: incidentSlaJobId(incidentId), fireAt });
  }

  async scheduleHandoverTimeout(handoverId: string, fireAt: Date): Promise<void> {
    this.scheduled.push({ jobId: handoverTimeoutJobId(handoverId), fireAt });
  }

  async scheduleCleaningReminder(sessionId: string, fireAt: Date): Promise<void> {
    this.scheduled.push({ jobId: cleaningReminderJobId(sessionId), fireAt });
  }

  readonly media: string[] = [];

  async enqueueMedia(mediaObjectId: string): Promise<void> {
    this.media.push(mediaObjectId);
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
