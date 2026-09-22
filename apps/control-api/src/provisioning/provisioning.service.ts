import { Inject, Injectable } from '@nestjs/common';
import {
  ProvisioningKind,
  ProvisioningStep,
  JobStatus,
  StepStatus,
  TenantModule,
  type TenantModule as ModuleCode,
} from '@vakhta/domain';
import {
  and,
  asc,
  desc,
  eq,
  provisioningJobs,
  provisioningSteps,
  type RegistryDatabase,
  type RegistryDbOrTx,
} from '@vakhta/registry';
import type { ProvisioningJobView } from '@vakhta/contracts';
import { ControlError } from '../common/domain-error.js';
import type { Operator } from '../auth/operator.guard.js';
import { ControlAudit } from '../audit/audit.service.js';
import { lockTenant } from './tenant-lock.js';
import { REGISTRY } from '../infra/registry.module.js';

export type JobKind = (typeof provisioningJobs.$inferSelect)['kind'];
export type StepCode = (typeof provisioningSteps.$inferSelect)['step'];

export interface CreateJobInput {
  readonly tenantId: string;
  readonly kind: JobKind;
  readonly requestedBy: string | null;
  readonly modules: readonly ModuleCode[];
  readonly payload: Record<string, unknown>;
}

const S = ProvisioningStep;
const K = ProvisioningKind;

/** Which steps a job kind runs, in order; module-dependent steps are added when the module is on. */
const STEPS_BY_KIND: Record<ProvisioningKind, (has: ReadonlySet<ModuleCode>) => StepCode[]> = {
  [K.PROVISION]: (has) => [
    S.CREATE_DATABASE,
    S.MIGRATE,
    S.SEED_DEFAULTS,
    S.STORAGE_PREFIX,
    S.REGISTER_DOMAINS,
    ...(has.has(TenantModule.ADMIN_PANEL) ? [S.INVITE_ADMIN] : []),
  ],
  [K.ENABLE_MODULE]: (has) =>
    has.has(TenantModule.WORKER_BOT) ? [S.BOT_WEBHOOK] : [S.EVICT_RUNTIME],
  [K.DISABLE_MODULE]: (has) =>
    has.has(TenantModule.WORKER_BOT) ? [S.REMOVE_WEBHOOK, S.EVICT_RUNTIME] : [S.EVICT_RUNTIME],
  [K.ROTATE_BOT_TOKEN]: () => [S.BOT_WEBHOOK, S.EVICT_RUNTIME],
  [K.VERIFY_DOMAIN]: () => [S.REGISTER_DOMAINS],
  [K.MIGRATE]: () => [S.MIGRATE],
  [K.SUSPEND]: () => [S.EVICT_RUNTIME],
  [K.RESUME]: () => [S.EVICT_RUNTIME],
  [K.BACKUP]: () => [S.FINAL_BACKUP],
  [K.DELETE]: () => [
    S.FINAL_BACKUP,
    S.REMOVE_WEBHOOK,
    S.EVICT_RUNTIME,
    S.DROP_DATABASE,
    S.DROP_STORAGE,
  ],
};

export function stepsFor(kind: JobKind, modules: readonly ModuleCode[]): StepCode[] {
  return STEPS_BY_KIND[kind](new Set(modules));
}

export async function enqueueProvisioningJob(
  tx: RegistryDbOrTx,
  input: CreateJobInput,
): Promise<string> {
  const steps = stepsFor(input.kind, input.modules);
  let created: { id: string } | undefined;
  try {
    [created] = await tx
      .insert(provisioningJobs)
      .values({
        tenantId: input.tenantId,
        kind: input.kind,
        requestedBy: input.requestedBy,
        payload: input.payload,
      })
      .returning({ id: provisioningJobs.id });
  } catch {
    throw new ControlError(
      'JOB_ALREADY_ACTIVE',
      409,
      `Tenant ${input.tenantId} already has an active job`,
    );
  }
  if (!created) throw new Error('provisioning_jobs: insert returned no row');
  await tx
    .insert(provisioningSteps)
    .values(steps.map((step, seq) => ({ jobId: created.id, step, seq })));
  return created.id;
}

/** Job and step rows; the runner executes them. One active job per tenant (partial unique index). */
@Injectable()
export class ProvisioningService {
  constructor(
    @Inject(REGISTRY) private readonly db: RegistryDatabase,
    private readonly audit: ControlAudit,
  ) {}

  async createJob(tx: RegistryDbOrTx, input: CreateJobInput): Promise<string> {
    return enqueueProvisioningJob(tx, input);
  }

  async listForTenant(tenantId: string): Promise<ProvisioningJobView[]> {
    const jobs = await this.db
      .select()
      .from(provisioningJobs)
      .where(eq(provisioningJobs.tenantId, tenantId))
      .orderBy(desc(provisioningJobs.createdAt))
      .limit(20);
    return Promise.all(jobs.map((job) => this.view(job)));
  }

  async get(jobId: string): Promise<ProvisioningJobView> {
    const [job] = await this.db
      .select()
      .from(provisioningJobs)
      .where(eq(provisioningJobs.id, jobId))
      .limit(1);
    if (!job) throw new ControlError('JOB_NOT_FOUND', 404, `Job ${jobId} not found`);
    return this.view(job);
  }

  async retryStep(
    jobId: string,
    step: StepCode,
    actor: Operator | null = null,
  ): Promise<ProvisioningJobView> {
    return this.changeStep({ jobId, step, actor, status: StepStatus.PENDING });
  }

  async skipStep(
    jobId: string,
    step: StepCode,
    actor: Operator | null = null,
  ): Promise<ProvisioningJobView> {
    return this.changeStep({ jobId, step, actor, status: StepStatus.SKIPPED });
  }

  private async changeStep(input: {
    jobId: string;
    step: StepCode;
    actor: Operator | null;
    status: typeof StepStatus.PENDING | typeof StepStatus.SKIPPED;
  }): Promise<ProvisioningJobView> {
    const { jobId, step, actor, status } = input;
    await this.db.transaction(async (tx) => {
      const [job] = await tx.select().from(provisioningJobs).where(eq(provisioningJobs.id, jobId));
      if (!job) throw new ControlError('JOB_NOT_FOUND', 404, 'Job not found');
      if (!(await lockTenant(tx, job.tenantId)))
        throw new ControlError('JOB_BUSY', 409, 'Job is running');
      const [current] = await tx
        .select()
        .from(provisioningSteps)
        .where(and(eq(provisioningSteps.jobId, jobId), eq(provisioningSteps.step, step)));
      if (!current) throw new ControlError('STEP_NOT_FOUND', 404, 'Step not found');
      const retryable =
        current.status === StepStatus.FAILED || current.status === StepStatus.MANUAL_REQUIRED;
      const skippable =
        current.status === StepStatus.MANUAL_REQUIRED && step === S.REGISTER_DOMAINS;
      const allowed = status === StepStatus.SKIPPED ? skippable : retryable;
      if (!allowed)
        throw new ControlError('STEP_TRANSITION_INVALID', 409, 'Step cannot be changed');
      await tx
        .update(provisioningSteps)
        .set({
          status,
          lastError: null,
          finishedAt: status === StepStatus.SKIPPED ? new Date() : null,
        })
        .where(and(eq(provisioningSteps.jobId, jobId), eq(provisioningSteps.step, step)));
      await tx
        .update(provisioningJobs)
        .set({ status: JobStatus.PENDING, error: null, finishedAt: null })
        .where(eq(provisioningJobs.id, jobId));
      await this.audit.record(tx, {
        actor,
        action: status === StepStatus.SKIPPED ? 'job.step.skip' : 'job.step.retry',
        tenantId: job.tenantId,
        objectType: 'provisioning_step',
        objectId: `${jobId}:${step}`,
        before: { status: current.status },
        after: { status },
      });
    });
    return this.get(jobId);
  }

  private async view(job: typeof provisioningJobs.$inferSelect): Promise<ProvisioningJobView> {
    const steps = await this.db
      .select()
      .from(provisioningSteps)
      .where(eq(provisioningSteps.jobId, job.id))
      .orderBy(asc(provisioningSteps.seq));
    return {
      id: job.id,
      tenantId: job.tenantId,
      kind: job.kind,
      status: job.status,
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      steps: steps.map((s) => ({
        step: s.step,
        seq: s.seq,
        status: s.status,
        attempts: s.attempts,
        lastError: s.lastError,
        output: s.output ?? null,
        startedAt: s.startedAt?.toISOString() ?? null,
        finishedAt: s.finishedAt?.toISOString() ?? null,
      })),
    };
  }
}
