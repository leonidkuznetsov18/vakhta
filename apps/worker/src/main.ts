import {
  dispatchCommunication,
  PrivateCommunicationFiles,
  TelegramCommunicationTransport,
} from './communications/dispatch.js';
import { CloudflareInspectionAnalyzer } from './photo-inspection/gemma.js';
import { InspectionTaskRunner } from './photo-inspection/runner.js';
import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { pino, type Logger } from 'pino';
import {
  CleaningReminderJob,
  DowntimeEscalationJob,
  HandoverTimeoutJob,
  IncidentSlaJob,
  MediaJob,
  QUEUES,
  ReturnReminderJob,
  ShiftReminderJob,
  type TenantSettings,
} from '@vakhta/contracts';
import { createDatabase, databaseErrorCode, type Database } from '@vakhta/db';
import { TIMER_JOBS, TenancyMode, TenantModule, TenantSurface } from '@vakhta/domain';
import {
  ENV_TENANT_ID,
  primaryHost,
  tenantHasModule,
  type TenantRuntimeConfig,
} from '@vakhta/registry';
import { loadWorkerEnv } from './env.js';
import { initSentry, reportJobFailure, Sentry } from './observability/sentry.js';
import { TelegramSender, relayOnce } from './outbox/relay.js';
import { handleShiftReminder, retiredAckReminder } from './timers/reminders.js';
import { S3MediaStore, TelegramFileFetcher } from './media/adapters.js';
import { processMedia, type MediaDependencies } from './media/process.js';
import { MediaTaskRunner } from './media/runner.js';
import { TimerTaskRunner } from './timers/runner.js';
import { TimerRecoveryOptions } from './timers/recovery.js';
import { handleCleaningReminder, handleHandoverTimeout } from './timers/handover-timers.js';
import { handleIncidentSla } from './timers/incident-sla.js';
import { handleDowntimeEscalation, handleReturnReminder } from './timers/shift-timers.js';
import { TenantWorkerPool, type TenantWorker } from './tenants/pool.js';
import { resolveJobTenantId } from './tenants/resolve.js';
import {
  loadWorkerSettings,
  settingsFingerprint,
  workerSettingsDefaults,
} from './tenants/settings.js';
import { openTenantSource } from './tenants/source.js';

const env = loadWorkerEnv(process.env);
const sentry = initSentry(env);

const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'worker' },
  ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
});

/** BullMQ вимагає maxRetriesPerRequest: null для блокуючих команд. */
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

/* ------------------------------------------------------------------ */
/* Shared adapters (one bucket, one analyzer; tenants differ by prefix)  */
/* ------------------------------------------------------------------ */

const mediaStore = S3MediaStore.fromEnv(env);
const communicationFiles = PrivateCommunicationFiles.fromEnv(env);
const inspectionAnalyzer = CloudflareInspectionAnalyzer.fromEnv(env);
function recoveryOptionsFor(
  settings: TenantSettings,
  tenant: TenantRuntimeConfig,
): TimerRecoveryOptions {
  return TimerRecoveryOptions.parse({
    maintenanceEnabled: tenantHasModule(tenant, TenantModule.MAINTENANCE),
    shiftReminderMinutes: settings.shiftReminderMinutes,
    breakMinutes: settings.breakMinutes,
    mealMinutes: settings.mealMinutes,
    serviceTimeMinutes: settings.serviceTimeMinutes,
    downtimeEscalationMinutes: settings.downtimeEscalationMinutes,
    cleaningReminderMinutes: settings.cleaningReminderMinutes,
    autoCloseGraceMinutes: settings.autoCloseGraceMinutes,
  });
}
// Optional legacy evidence reads only. Canonical PostgreSQL admission never depends on Redis.
const legacyTimers = new Queue(QUEUES.timers, { connection });

/** The panel address a tenant's communications link to. */
function communicationsWebUrl(tenant: TenantRuntimeConfig): string {
  if (tenant.id === ENV_TENANT_ID) return env.COMMUNICATIONS_WEB_URL;
  const host = primaryHost(tenant, TenantSurface.PANEL);
  const scheme = env.COMMUNICATIONS_WEB_URL.startsWith('http://') ? 'http' : 'https';
  return host ? `${scheme}://${host}` : env.COMMUNICATIONS_WEB_URL;
}

function mediaDependenciesFor(
  tenant: TenantRuntimeConfig,
  settings: TenantSettings,
): MediaDependencies | null {
  if (!mediaStore || !tenant.botToken) return null;
  return {
    fetcher: new TelegramFileFetcher(tenant.botToken),
    store: {
      async put(...args: Parameters<S3MediaStore['put']>) {
        const stored = await tenantSource.source.withActiveTenant(tenant.id, async () => {
          await mediaStore.put(...args);
          return true;
        });
        if (!stored) throw new Error('Tenant is not active');
      },
    },
    options: {
      thresholds: {
        minWidth: settings.mediaMinWidth,
        minHeight: settings.mediaMinHeight,
        minBrightness: settings.mediaMinBrightness,
        nearDuplicateDistance: settings.mediaNearDuplicateDistance,
      },
      retentionDays: settings.mediaRetentionDays,
      keyPrefix: tenant.storagePrefix,
    },
  };
}

/* ------------------------------------------------------------------ */
/* One worker per tenant: relay (ADR-8), photos (ADR-6), timers         */
/* ------------------------------------------------------------------ */

interface TenantRunners {
  start(): void;
  stop(): Promise<void>;
}

interface RunnerInput {
  readonly tenant: TenantRuntimeConfig;
  readonly db: Database;
  readonly mediaDeps: MediaDependencies | null;
  readonly settings: TenantSettings;
  readonly log: Logger;
}

function createRunners({ tenant, db, mediaDeps, settings, log }: RunnerInput): TenantRunners {
  const mediaRunner = new MediaTaskRunner(db, mediaDeps, {
    completed(result) {
      if (result.claimed) log.info(result, 'durable media batch');
    },
    recovered(result) {
      if (result.admitted || result.bonusQueued) log.info(result, 'media recovery');
      if (result.inconsistent)
        log.error({ count: result.inconsistent }, 'completed media task invariant violated');
    },
    failed(stage) {
      log.error({ stage }, 'durable media processing failed');
      reportJobFailure(
        'durable-media',
        undefined,
        new Error(`Media ${stage.toLowerCase()} failed`),
      );
    },
  });
  const inspectionRunner = new InspectionTaskRunner(db, inspectionAnalyzer, () => {
    log.error('Photo inspection task processing failed');
  });
  const timerRunner = new TimerTaskRunner(
    db,
    recoveryOptionsFor(settings, tenant),
    {
      task(event) {
        log.info(event, 'durable timer outcome');
      },
      dispatched(result) {
        if (result.claimed) log.info(result, 'durable timer batch');
      },
      recovered(result) {
        if (result.admitted || result.legacyUnavailable) log.info(result, 'timer recovery');
        if (result.failed) log.error({ count: result.failed }, 'timer recovery admission failed');
      },
      failed(stage) {
        log.error({ stage }, 'durable timer processing failed');
        reportJobFailure(
          'durable-timers',
          undefined,
          new Error(`Timer ${stage.toLowerCase()} failed`),
        );
      },
    },
    {
      async read(key) {
        const job = await legacyTimers.getJob(key);
        return job?.data ?? null;
      },
    },
  );
  return {
    start() {
      mediaRunner.start();
      inspectionRunner.start();
      timerRunner.start();
    },
    async stop() {
      await Promise.all([mediaRunner.stop(), timerRunner.stop(), inspectionRunner.stop()]);
    },
  };
}

interface TenantRelay {
  tick(): Promise<void>;
  drain(): Promise<void>;
}

/** Outbox relay (ADR-8) and communication dispatch of one tenant, one pass at a time. */
function createRelay(tenant: TenantRuntimeConfig, db: Database, log: Logger): TenantRelay {
  const sender = tenant.botToken ? TelegramSender.fromToken(tenant.botToken) : null;
  const transport = tenant.botToken
    ? TelegramCommunicationTransport.fromToken(tenant.botToken)
    : null;
  if (!sender) log.warn('no bot token: outbox relay disabled, rows stay PENDING');
  const webUrl = communicationsWebUrl(tenant);
  let relayBusy = false;
  let communicationRun: Promise<unknown> | null = null;

  function dispatchOnce(): void {
    if (!transport || communicationRun) return;
    communicationRun = dispatchCommunication(db, transport, communicationFiles, webUrl)
      .catch(() => log.error('Communication dispatch failed; durable state retained'))
      .finally(() => {
        communicationRun = null;
      });
  }

  async function relay(): Promise<void> {
    if (!sender || relayBusy) return;
    relayBusy = true;
    try {
      const r = await relayOnce(db, sender, {
        batch: env.OUTBOX_BATCH,
        maxAttempts: env.OUTBOX_MAX_ATTEMPTS,
      });
      if (r.sent || r.skipped || r.failed || r.retried || r.deferred) log.info(r, 'outbox');
    } catch (err: unknown) {
      log.error({ err }, 'outbox relay');
      reportJobFailure('outbox', undefined, err);
    } finally {
      relayBusy = false;
    }
  }

  return {
    async tick() {
      dispatchOnce();
      await relay();
    },
    async drain() {
      await communicationRun;
    },
  };
}

async function startTenantWorker(tenant: TenantRuntimeConfig): Promise<TenantWorker> {
  const log = logger.child({ tenant: tenant.slug });
  const { db, client } = createDatabase(tenant.databaseUrl, { max: env.TENANT_POOL_MAX });
  const defaults = workerSettingsDefaults(tenant, env);
  const settings = await loadWorkerSettings(db, defaults).catch(async (error: unknown) => {
    await client.end({ timeout: 5 });
    throw error;
  });
  const mediaDeps = mediaDependenciesFor(tenant, settings);
  if (!mediaDeps) log.warn('Media dependencies unavailable: durable tasks remain retryable');
  const runners = createRunners({ tenant, db, mediaDeps, settings, log });
  const relay = createRelay(tenant, db, log);
  runners.start();
  const started = settingsFingerprint(settings);
  return {
    tenant,
    db,
    mediaDeps,
    settings,
    // An unreadable database is not a change: the running worker keeps its settings.
    async settingsChanged() {
      const current = await loadWorkerSettings(db, defaults).catch((error: unknown) => {
        log.warn(
          { code: databaseErrorCode(error) },
          'Tenant settings unavailable; current values kept',
        );
        return null;
      });
      return current !== null && settingsFingerprint(current) !== started;
    },
    tick: () => relay.tick(),
    async stop() {
      await Promise.all([relay.drain(), runners.stop()]);
      await client.end({ timeout: 5 });
    },
  };
}

const tenantSource = await openTenantSource(env, logger);
const pool = new TenantWorkerPool(tenantSource.source, startTenantWorker, logger);
await pool.sync();
const poolTimer =
  env.TENANCY_MODE === TenancyMode.REGISTRY
    ? setInterval(() => void pool.sync(), env.REGISTRY_REFRESH_SECONDS * 1000)
    : null;
const relayTimer = setInterval(() => {
  void Promise.all(pool.all().map((worker) => worker.tick()));
}, env.OUTBOX_POLL_MS);

/* ------------------------------------------------------------------ */
/* Черги (legacy BullMQ): every job names its tenant                    */
/* ------------------------------------------------------------------ */

function tenantWorkerFor(job: Job): TenantWorker {
  const tenantId = resolveJobTenantId(job.data, env.TENANCY_MODE);
  const worker = tenantId ? pool.get(tenantId) : null;
  if (!worker) {
    logger.warn({ queue: job.queueName, jobId: job.id }, 'job rejected: tenant is not served');
    throw new Error('Job tenant is not served');
  }
  return worker;
}

async function processTimer(job: Job): Promise<void> {
  const worker = tenantWorkerFor(job);
  const db: Database = worker.db;
  const graceMinutes = worker.settings.autoCloseGraceMinutes;
  switch (job.name) {
    case TIMER_JOBS.shiftReminder: {
      const outcome = await handleShiftReminder(db, ShiftReminderJob.parse(job.data));
      logger.info({ job: job.name, jobId: job.id, outcome }, 'timer');
      return;
    }
    case TIMER_JOBS.ackReminder: {
      const outcome = await retiredAckReminder();
      logger.info({ job: job.name, jobId: job.id, outcome }, 'timer');
      return;
    }
    case TIMER_JOBS.returnReminder: {
      const outcome = await handleReturnReminder(
        db,
        ReturnReminderJob.parse(job.data),
        undefined,
        graceMinutes,
      );
      logger.info({ job: job.name, jobId: job.id, outcome }, 'timer');
      return;
    }
    case TIMER_JOBS.downtimeEscalation: {
      const outcome = await handleDowntimeEscalation(
        db,
        DowntimeEscalationJob.parse(job.data),
        undefined,
        graceMinutes,
      );
      logger.info({ job: job.name, jobId: job.id, outcome }, 'timer');
      return;
    }
    case TIMER_JOBS.incidentSla: {
      const outcome = await handleIncidentSla(db, IncidentSlaJob.parse(job.data));
      logger.info({ job: job.name, jobId: job.id, outcome }, 'timer');
      return;
    }
    case TIMER_JOBS.handoverTimeout: {
      const outcome = await handleHandoverTimeout(db, HandoverTimeoutJob.parse(job.data));
      logger.info({ job: job.name, jobId: job.id, outcome }, 'timer');
      return;
    }
    case TIMER_JOBS.cleaningReminder: {
      const outcome = await handleCleaningReminder(db, CleaningReminderJob.parse(job.data));
      logger.info({ job: job.name, jobId: job.id, outcome }, 'timer');
      return;
    }
    default:
      logger.warn({ job: job.name, jobId: job.id }, 'невідомий таймер');
  }
}

const workers = [
  new Worker(QUEUES.timers, processTimer, { connection, concurrency: 5 }),
  new Worker(
    QUEUES.media,
    async (job) => {
      const worker = tenantWorkerFor(job);
      try {
        const outcome = await processMedia(worker.db, worker.mediaDeps, MediaJob.parse(job.data));
        logger.info({ queue: QUEUES.media, jobId: job.id, outcome }, 'legacy media');
      } catch {
        // BullMQ retries the failure; retain no Telegram download URL or raw database parameters.
        throw new Error('Legacy media processing failed');
      }
    },
    { connection, concurrency: 2 },
  ),
  new Worker(
    QUEUES.bonus,
    async (job) => {
      logger.warn(
        { queue: QUEUES.bonus, jobId: job.id },
        'Legacy bonus job requires investigation; durable scoring belongs to the API',
      );
      throw new Error('Unsupported legacy bonus job; no work was completed');
    },
    { connection, concurrency: 2 },
  ),
];

for (const w of workers) {
  w.on('failed', (job, err) => {
    logger.error({ queue: w.name, jobId: job?.id, err }, 'job failed');
    reportJobFailure(w.name, job?.id, err);
  });
  w.on('error', (err) => {
    logger.error({ queue: w.name, err }, 'worker error');
    reportJobFailure(w.name, undefined, err);
  });
}

logger.info(
  {
    queues: workers.map((w) => w.name),
    tenants: pool.all().map((worker) => worker.tenant.slug),
    mode: env.TENANCY_MODE,
    sentry,
  },
  'worker запущено',
);

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'зупинка worker');
  clearInterval(relayTimer);
  if (poolTimer) clearInterval(poolTimer);
  await Promise.all([pool.stopAll(), ...workers.map((w) => w.close())]);
  await legacyTimers.close();
  await tenantSource.close();
  await connection.quit();
  await Sentry.flush(2000);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
