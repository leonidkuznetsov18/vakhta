/** Control-plane codes (specs/011 data-model.md): jobs, steps, operators. Mirrored in the registry schema. */

export const PROVISIONING_KINDS = [
  'PROVISION',
  'ENABLE_MODULE',
  'DISABLE_MODULE',
  'SUSPEND',
  'RESUME',
  'ROTATE_BOT_TOKEN',
  'VERIFY_DOMAIN',
  'MIGRATE',
  'BACKUP',
  'DELETE',
] as const;
export type ProvisioningKind = (typeof PROVISIONING_KINDS)[number];
export const ProvisioningKind = {
  PROVISION: 'PROVISION',
  ENABLE_MODULE: 'ENABLE_MODULE',
  DISABLE_MODULE: 'DISABLE_MODULE',
  SUSPEND: 'SUSPEND',
  RESUME: 'RESUME',
  ROTATE_BOT_TOKEN: 'ROTATE_BOT_TOKEN',
  VERIFY_DOMAIN: 'VERIFY_DOMAIN',
  MIGRATE: 'MIGRATE',
  BACKUP: 'BACKUP',
  DELETE: 'DELETE',
} as const satisfies Record<ProvisioningKind, ProvisioningKind>;

export const JOB_STATUSES = ['PENDING', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const JobStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  DONE: 'DONE',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const satisfies Record<JobStatus, JobStatus>;

export const PROVISIONING_STEPS = [
  'CREATE_DATABASE',
  'MIGRATE',
  'SEED_DEFAULTS',
  'STORAGE_PREFIX',
  'REGISTER_DOMAINS',
  'BOT_WEBHOOK',
  'INVITE_ADMIN',
  'REMOVE_WEBHOOK',
  'EVICT_RUNTIME',
  'FINAL_BACKUP',
  'DROP_DATABASE',
  'DROP_STORAGE',
] as const;
export type ProvisioningStep = (typeof PROVISIONING_STEPS)[number];
export const ProvisioningStep = {
  CREATE_DATABASE: 'CREATE_DATABASE',
  MIGRATE: 'MIGRATE',
  SEED_DEFAULTS: 'SEED_DEFAULTS',
  STORAGE_PREFIX: 'STORAGE_PREFIX',
  REGISTER_DOMAINS: 'REGISTER_DOMAINS',
  BOT_WEBHOOK: 'BOT_WEBHOOK',
  INVITE_ADMIN: 'INVITE_ADMIN',
  REMOVE_WEBHOOK: 'REMOVE_WEBHOOK',
  EVICT_RUNTIME: 'EVICT_RUNTIME',
  FINAL_BACKUP: 'FINAL_BACKUP',
  DROP_DATABASE: 'DROP_DATABASE',
  DROP_STORAGE: 'DROP_STORAGE',
} as const satisfies Record<ProvisioningStep, ProvisioningStep>;

export const STEP_STATUSES = [
  'PENDING',
  'RUNNING',
  'DONE',
  'FAILED',
  'SKIPPED',
  'MANUAL_REQUIRED',
] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];
export const StepStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  DONE: 'DONE',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
  MANUAL_REQUIRED: 'MANUAL_REQUIRED',
} as const satisfies Record<StepStatus, StepStatus>;

export const OPERATOR_ROLES = ['PLATFORM_ADMIN', 'PLATFORM_VIEWER'] as const;
export type OperatorRole = (typeof OPERATOR_ROLES)[number];
export const OperatorRole = {
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  PLATFORM_VIEWER: 'PLATFORM_VIEWER',
} as const satisfies Record<OperatorRole, OperatorRole>;

export const OPERATOR_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type OperatorStatus = (typeof OPERATOR_STATUSES)[number];
export const OperatorStatus = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
} as const satisfies Record<OperatorStatus, OperatorStatus>;

export const MODULE_STATUSES = ['ENABLED', 'DISABLED'] as const;
export type ModuleStatus = (typeof MODULE_STATUSES)[number];
export const ModuleStatus = {
  ENABLED: 'ENABLED',
  DISABLED: 'DISABLED',
} as const satisfies Record<ModuleStatus, ModuleStatus>;

/** Finished steps a resumed job skips. */
export function isStepSettled(status: StepStatus): boolean {
  return status === StepStatus.DONE || status === StepStatus.SKIPPED;
}

/** Steps the runner must not touch until the operator retries or marks them done. */
export function isStepWaitingForOperator(status: StepStatus): boolean {
  return status === StepStatus.MANUAL_REQUIRED || status === StepStatus.FAILED;
}
