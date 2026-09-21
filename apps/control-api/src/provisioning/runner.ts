import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import {
  JobStatus,
  ModuleStatus,
  ProvisioningKind,
  StepStatus,
  TenantStatus,
  isStepSettled,
  isStepWaitingForOperator,
} from '@vakhta/domain';
import {
  and,
  asc,
  eq,
  inArray,
  provisioningJobs,
  provisioningSteps,
  sql,
  tenantModules,
  tenantSecrets,
  tenants,
  type RegistryDatabase,
  type SecretCipher,
} from '@vakhta/registry';
import type { ControlEnv } from '../config/env.js';
import { CONTROL_ENV, REGISTRY, SECRET_CIPHER } from '../infra/registry.module.js';
import { createLogger } from '../logger.js';
import { TenantsService } from '../tenants/tenants.service.js';
import type { StepCode } from './provisioning.service.js';
import type { ProvisioningStep, StepContext } from './steps/context.js';
import {
  createDatabaseStep,
  migrateStep,
  seedDefaultsStep,
  storagePrefixStep,
} from './steps/database.steps.js';
import { inviteAdminStep } from './steps/invite.steps.js';
import {
  botWebhookStep,
  evictRuntimeStep,
  registerDomainsStep,
  removeWebhookStep,
} from './steps/surface.steps.js';
import { lockTenant } from './tenant-lock.js';
import { TelegramProvider } from './telegram.provider.js';

type JobRow = typeof provisioningJobs.$inferSelect;
type StepRow = typeof provisioningSteps.$inferSelect;
type SecretKind = 'DATABASE_URL' | 'BOT_TOKEN' | 'BOT_WEBHOOK_SECRET';

/** A step that is not implemented in this delivery ends the job with a visible error. */
const notImplemented = (step: string): ProvisioningStep => ({
  async isDone() {
    return false;
  },
  async run() {
    throw new Error(`Step ${step} is not implemented yet`);
  },
});

/**
 * Executes provisioning jobs one step at a time (spec AC-002, FR-004). The runner polls, claims
 * a job under an advisory lock, and runs pending steps in order. A failed step is retried when the
 * operator asks; a manual step stops the job until the operator marks it done or retries it. A
 * process restart resumes from the first step that is not DONE or SKIPPED.
 */
@Injectable()
export class ProvisioningRunner implements OnModuleInit, OnApplicationShutdown {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private stopped = false;
  private readonly steps: Record<StepCode, ProvisioningStep>;
  private readonly logger;

  constructor(
    @Inject(REGISTRY) private readonly db: RegistryDatabase,
    @Inject(SECRET_CIPHER) private readonly cipher: SecretCipher,
    @Inject(CONTROL_ENV) private readonly env: ControlEnv,
    telegram: TelegramProvider,
    tenantsService: TenantsService,
  ) {
    this.logger = createLogger(env);
    this.steps = {
      CREATE_DATABASE: createDatabaseStep,
      MIGRATE: migrateStep,
      SEED_DEFAULTS: seedDefaultsStep,
      STORAGE_PREFIX: storagePrefixStep,
      REGISTER_DOMAINS: registerDomainsStep,
      BOT_WEBHOOK: botWebhookStep(telegram),
      INVITE_ADMIN: inviteAdminStep(tenantsService),
      REMOVE_WEBHOOK: removeWebhookStep(telegram),
      EVICT_RUNTIME: evictRuntimeStep,
      FINAL_BACKUP: notImplemented('FINAL_BACKUP'),
      DROP_DATABASE: notImplemented('DROP_DATABASE'),
      DROP_STORAGE: notImplemented('DROP_STORAGE'),
    };
  }

  onModuleInit(): void {
    if (this.env.NODE_ENV === 'test') return;
    this.start();
  }

  start(): void {
    if (this.timer || this.stopped) return;
    this.timer = setInterval(() => this.poll(), this.env.PROVISIONING_POLL_MS);
    this.timer.unref();
    this.poll();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.running;
  }

  private poll(): void {
    if (this.stopped || this.running) return;
    this.running = this.tick()
      .catch((error: unknown) => this.logger.error({ err: error }, 'provisioning tick failed'))
      .finally(() => {
        this.running = null;
      });
  }

  /** One pass: every runnable job, oldest first. */
  async tick(): Promise<void> {
    const jobs = await this.db
      .select()
      .from(provisioningJobs)
      .where(inArray(provisioningJobs.status, [JobStatus.PENDING, JobStatus.RUNNING]))
      .orderBy(asc(provisioningJobs.createdAt));
    await jobs.reduce((chain, job) => chain.then(() => this.runJob(job)), Promise.resolve());
  }

  async runJob(job: JobRow): Promise<void> {
    // Keep checkpoints on their own committed connections while this transaction owns the lock.
    await this.db.transaction(async (lock) => {
      if (!(await lockTenant(lock, job.tenantId))) return;
      const [current] = await this.db
        .select()
        .from(provisioningJobs)
        .where(eq(provisioningJobs.id, job.id));
      if (!current || ![JobStatus.PENDING, JobStatus.RUNNING].some((s) => s === current.status))
        return;
      await this.runClaimedJob(current);
    });
  }

  private async runClaimedJob(job: JobRow): Promise<void> {
    const [tenant] = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, job.tenantId))
      .limit(1);
    if (!tenant) return;
    const steps = await this.db
      .select()
      .from(provisioningSteps)
      .where(eq(provisioningSteps.jobId, job.id))
      .orderBy(asc(provisioningSteps.seq));
    const next = steps.find((s) => !isStepSettled(s.status));
    if (!next) return this.finish(job, tenant);
    if (isStepWaitingForOperator(next.status)) return;
    await this.db
      .update(provisioningJobs)
      .set({ status: JobStatus.RUNNING, startedAt: job.startedAt ?? new Date() })
      .where(eq(provisioningJobs.id, job.id));
    const modules = await this.db
      .select({ module: tenantModules.module })
      .from(tenantModules)
      .where(
        and(eq(tenantModules.tenantId, tenant.id), eq(tenantModules.status, ModuleStatus.ENABLED)),
      );
    const ctx = this.context(
      tenant,
      job,
      modules.map((m) => m.module),
    );
    const outcome = await this.runStep(next, ctx);
    if (outcome === 'continue') await this.runClaimedJob({ ...job, status: JobStatus.RUNNING });
  }

  private async runStep(step: StepRow, ctx: StepContext): Promise<'continue' | 'stop'> {
    const impl = this.steps[step.step];
    await this.db
      .update(provisioningSteps)
      .set({ status: StepStatus.RUNNING, attempts: step.attempts + 1, startedAt: new Date() })
      .where(and(eq(provisioningSteps.jobId, step.jobId), eq(provisioningSteps.step, step.step)));
    try {
      if (await impl.isDone(ctx)) {
        await this.settle(step, StepStatus.DONE, { resumed: true });
        return 'continue';
      }
      const outcome = await impl.run(ctx);
      if (outcome.kind === 'manual') {
        await this.settle(step, StepStatus.MANUAL_REQUIRED, outcome.output);
        await this.db
          .update(provisioningJobs)
          .set({ status: 'PENDING' })
          .where(eq(provisioningJobs.id, step.jobId));
        return 'stop';
      }
      await this.settle(
        step,
        outcome.kind === 'done' ? StepStatus.DONE : StepStatus.SKIPPED,
        outcome.output ?? null,
      );
      return 'continue';
    } catch {
      const message = `Step ${step.step} failed; check provider access and configuration, then retry`;
      // Driver messages can contain SQL passwords or provider tokens. Never persist them.
      ctx.log.error({ step: step.step, tenant: ctx.tenant.slug }, 'provisioning step failed');
      await this.db
        .update(provisioningSteps)
        .set({ status: StepStatus.FAILED, lastError: message, finishedAt: new Date() })
        .where(and(eq(provisioningSteps.jobId, step.jobId), eq(provisioningSteps.step, step.step)));
      await this.db
        .update(provisioningJobs)
        .set({ status: JobStatus.FAILED, error: `${step.step}: ${message}` })
        .where(eq(provisioningJobs.id, step.jobId));
      return 'stop';
    }
  }

  private async settle(
    step: StepRow,
    status: 'DONE' | 'SKIPPED' | 'MANUAL_REQUIRED',
    output: Record<string, unknown> | null | undefined,
  ): Promise<void> {
    await this.db
      .update(provisioningSteps)
      .set({ status, output: output ?? null, lastError: null, finishedAt: new Date() })
      .where(and(eq(provisioningSteps.jobId, step.jobId), eq(provisioningSteps.step, step.step)));
  }

  private async finish(job: JobRow, tenant: typeof tenants.$inferSelect): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(provisioningJobs)
        .set({ status: JobStatus.DONE, finishedAt: new Date() })
        .where(eq(provisioningJobs.id, job.id));
      if (job.kind === ProvisioningKind.PROVISION && tenant.status === TenantStatus.PROVISIONING) {
        await tx
          .update(tenants)
          .set({ status: TenantStatus.ACTIVE, updatedAt: sql`now()` })
          .where(eq(tenants.id, tenant.id));
      }
    });
    this.logger.info({ job: job.id, kind: job.kind, tenant: tenant.slug }, 'provisioning job done');
  }

  private context(
    tenant: typeof tenants.$inferSelect,
    job: JobRow,
    modules: readonly string[],
  ): StepContext {
    const db = this.db;
    const cipher = this.cipher;
    return {
      tenant,
      payload: job.payload,
      modules,
      env: this.env,
      db,
      cipher,
      log: this.logger.child({ job: job.id, tenant: tenant.slug }),
      async secret(kind: SecretKind) {
        const [row] = await db
          .select()
          .from(tenantSecrets)
          .where(and(eq(tenantSecrets.tenantId, tenant.id), eq(tenantSecrets.kind, kind)))
          .limit(1);
        return row
          ? cipher.decrypt({ ciphertext: row.ciphertext, keyVersion: row.keyVersion })
          : null;
      },
      async storeSecret(kind: SecretKind, value: string) {
        const encrypted = cipher.encrypt(value);
        const values = {
          tenantId: tenant.id,
          kind,
          ciphertext: encrypted.ciphertext,
          keyVersion: encrypted.keyVersion,
          fingerprint: cipher.fingerprint(value),
          updatedAt: new Date(),
        };
        await db
          .insert(tenantSecrets)
          .values(values)
          .onConflictDoUpdate({
            target: [tenantSecrets.tenantId, tenantSecrets.kind],
            set: values,
          });
        await db
          .update(tenants)
          .set({ updatedAt: sql`now()` })
          .where(eq(tenants.id, tenant.id));
      },
    };
  }
}
