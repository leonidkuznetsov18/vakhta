import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { ConfigService } from '@nestjs/config';
import { QUEUES } from '@vakhta/contracts';
import { ackReminderJobId, shiftReminderJobId } from '@vakhta/domain';
import type { Env } from '../config/env.js';
import { ensureDockerHost } from '../../test/docker.js';
import { TimersQueue } from './timers.queue.js';

const ASSIGNMENT = '11111111-1111-4111-8111-111111111111';
const VERSION = '22222222-2222-4222-8222-222222222222';
const EMPLOYEE = '33333333-3333-4333-8333-333333333333';

/** Реальний Redis: BullMQ валідує jobId і опції лише при додаванні job-а. */
describe('TimersQueue на реальному Redis (ADR-8)', () => {
  let container: StartedTestContainer;
  let url: string;
  let timers: TimersQueue;
  let inspector: Queue;
  let connection: Redis;

  beforeAll(async () => {
    ensureDockerHost();
    container = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
    url = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
    const config = { get: () => url } as unknown as ConfigService<Env, true>;
    timers = new TimersQueue(config);
    connection = new Redis(url, { maxRetriesPerRequest: null });
    inspector = new Queue(QUEUES.timers, { connection });
  }, 180_000);

  afterAll(async () => {
    await inspector?.close();
    await connection?.quit();
    await timers?.onApplicationShutdown();
    await container?.stop();
  });

  it('ставить відкладені job-и з детермінованими id і не дублює їх', async () => {
    const fireAt = new Date(Date.now() + 3_600_000);
    await timers.scheduleShiftReminder(ASSIGNMENT, fireAt);
    await timers.scheduleShiftReminder(ASSIGNMENT, fireAt);
    await timers.scheduleAckReminder(VERSION, EMPLOYEE, fireAt);
    expect(await inspector.getDelayedCount()).toBe(2);

    const job = await inspector.getJob(shiftReminderJobId(ASSIGNMENT));
    expect(job?.data).toMatchObject({ assignmentId: ASSIGNMENT });
    expect(await inspector.getJob(ackReminderJobId(VERSION, EMPLOYEE))).not.toBeNull();
  });

  it('минулий час не ставиться, скасування прибирає job', async () => {
    await timers.scheduleShiftReminder(
      '44444444-4444-4444-8444-444444444444',
      new Date(Date.now() - 1000),
    );
    expect(await inspector.getDelayedCount()).toBe(2);

    await timers.cancel(shiftReminderJobId(ASSIGNMENT));
    expect(await inspector.getDelayedCount()).toBe(1);
    await timers.cancel('no-such-job');
    expect(await inspector.getDelayedCount()).toBe(1);
  });
});
