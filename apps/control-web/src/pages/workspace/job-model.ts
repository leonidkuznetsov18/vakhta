import type { ProvisioningJobView, TenantDetailView } from '@vakhta/contracts';
import {
  JobStatus,
  ProvisioningStep,
  StepStatus,
  TenantModule,
  TenantSecretKind,
} from '@vakhta/domain';

const STEP_TAB = {
  [ProvisioningStep.CREATE_DATABASE]: 'database',
  [ProvisioningStep.MIGRATE]: 'database',
  [ProvisioningStep.SEED_DEFAULTS]: 'parameters',
  [ProvisioningStep.STORAGE_PREFIX]: 'database',
  [ProvisioningStep.REGISTER_DOMAINS]: 'domains',
  [ProvisioningStep.BOT_WEBHOOK]: 'bot',
  [ProvisioningStep.INVITE_ADMIN]: 'overview',
  [ProvisioningStep.REMOVE_WEBHOOK]: 'bot',
  [ProvisioningStep.EVICT_RUNTIME]: 'modules',
  [ProvisioningStep.FINAL_BACKUP]: 'database',
  [ProvisioningStep.DROP_DATABASE]: 'database',
  [ProvisioningStep.DROP_STORAGE]: 'database',
} as const satisfies Record<ProvisioningStep, string>;

export function stepConfigurationTab(step: ProvisioningStep) {
  return STEP_TAB[step];
}

export function needsBotToken(detail: TenantDetailView): boolean {
  return (
    detail.modules.includes(TenantModule.WORKER_BOT) &&
    !detail.secrets.some((secret) => secret.kind === TenantSecretKind.BOT_TOKEN && secret.present)
  );
}

export const TaskKind = { JOB_STEP: 'JOB_STEP', BOT_TOKEN: 'BOT_TOKEN' } as const;
export type TenantTask =
  | { kind: typeof TaskKind.JOB_STEP; jobId: string; step: ProvisioningJobView['steps'][number] }
  | { kind: typeof TaskKind.BOT_TOKEN };

type JobTask = Extract<TenantTask, { kind: typeof TaskKind.JOB_STEP }>;

function preserveCompleted(previous: TenantTask | undefined, step: JobTask['step']): boolean {
  return (
    step.status === StepStatus.SKIPPED &&
    previous?.kind === TaskKind.JOB_STEP &&
    previous.step.status === StepStatus.DONE
  );
}

function currentTasks(jobs: readonly ProvisioningJobView[]) {
  const latest = new Map<ProvisioningStep, TenantTask>();
  const ordered = [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).reverse();
  const steps = ordered.flatMap((job) => job.steps.map((step) => ({ jobId: job.id, step })));
  for (const { jobId, step } of steps) {
    // A later no-op does not undo work that already succeeded.
    if (preserveCompleted(latest.get(step.step), step)) continue;
    latest.set(step.step, { kind: TaskKind.JOB_STEP, jobId, step });
  }
  return latest;
}

function checklistStatus(statuses: readonly StepStatus[]): JobStatus {
  if (statuses.includes(StepStatus.FAILED)) return JobStatus.FAILED;
  if (statuses.includes(StepStatus.RUNNING)) return JobStatus.RUNNING;
  if (statuses.length > 0 && statuses.every((status) => status === StepStatus.DONE))
    return JobStatus.DONE;
  return JobStatus.PENDING;
}

export function tenantChecklist(detail: TenantDetailView, jobs: readonly ProvisioningJobView[]) {
  const latest = currentTasks(jobs);
  if (needsBotToken(detail)) latest.set(ProvisioningStep.BOT_WEBHOOK, { kind: TaskKind.BOT_TOKEN });
  const rows = [...latest.entries()].map(([key, task]) => ({ key, task }));
  const statuses = rows.map(({ task }) =>
    task.kind === TaskKind.BOT_TOKEN ? StepStatus.PENDING : task.step.status,
  );
  return {
    rows,
    done: statuses.filter((status) => status === StepStatus.DONE).length,
    skipped: statuses.filter((status) => status === StepStatus.SKIPPED).length,
    status: checklistStatus(statuses),
  };
}
